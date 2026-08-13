/**
 * Twilio BSP adapter — production default.
 * Implements the contract documented in ./interface.js
 */

const twilio = require("twilio");
const { MessagingResponse } = require("twilio").twiml;

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/** @type {Record<string, string>} templateRef → env var name */
const TEMPLATE_ENV = {
  reminder_24h: "TWILIO_TEMPLATE_SID_REMINDER_24H",
  reminder_2h: "TWILIO_TEMPLATE_SID_REMINDER_2H",
  owner_flag: "TWILIO_TEMPLATE_SID_OWNER_FLAG",
};

function stripWhatsAppPrefix(value) {
  if (!value) return "";
  return String(value).replace(/^whatsapp:/i, "");
}

function resolveTemplateSid(templateRef) {
  const envKey = TEMPLATE_ENV[templateRef];
  if (!envKey) {
    throw new Error(`[Twilio] Unknown templateRef: ${templateRef}`);
  }
  const sid = process.env[envKey];
  if (!sid) {
    throw new Error(`[Twilio] Missing env var ${envKey} for templateRef '${templateRef}'`);
  }
  return sid;
}

function mediaTypeFromContentType(contentType) {
  if (!contentType) return undefined;
  const ct = contentType.toLowerCase();
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("audio/")) return "audio";
  if (ct.startsWith("video/")) return "video";
  if (ct.includes("pdf") || ct.startsWith("application/")) return "document";
  if (ct.includes("webp") || ct.includes("sticker")) return "sticker";
  return undefined;
}

const adapter = {
  name: "twilio",

  /**
   * Free-form reply inside the 24h customer service window.
   * @param {{ to: string, body: string }} params
   * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
   */
  async sendMessage({ to, body }) {
    try {
      const msg = await twilioClient.messages.create({
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: `whatsapp:${to}`,
        body,
      });
      return { success: true, messageId: msg.sid };
    } catch (error) {
      console.error(`[Twilio] sendMessage failed to ${to}:`, error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * Approved template send (reminders, owner flags, etc.).
   * @param {{ to: string, templateRef: string, variables: Object<string,string> }} params
   * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
   */
  async sendTemplate({ to, templateRef, variables }) {
    const contentSid = resolveTemplateSid(templateRef);
    try {
      const msg = await twilioClient.messages.create({
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: `whatsapp:${to}`,
        contentSid,
        contentVariables: JSON.stringify(variables || {}),
      });
      return { success: true, messageId: msg.sid };
    } catch (error) {
      console.error(`[Twilio] sendTemplate(${templateRef}) failed to ${to}:`, error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * Validate X-Twilio-Signature. Honours SKIP_TWILIO_VALIDATION=true for local dev.
   * @param {import('express').Request} req
   * @returns {boolean}
   */
  validateWebhook(req) {
    if (process.env.SKIP_TWILIO_VALIDATION === "true") {
      return true;
    }

    const signature = req.get("X-Twilio-Signature") || "";
    const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    try {
      return twilio.validateRequest(
        process.env.TWILIO_AUTH_TOKEN,
        signature,
        url,
        req.body
      );
    } catch (error) {
      console.error("[Twilio] validateWebhook error:", error.message);
      return false;
    }
  },

  /**
   * Normalize Twilio webhook form fields into IncomingMessage.
   * @param {import('express').Request} req
   */
  parseIncomingMessage(req) {
    const b = req.body || {};
    const numMedia = parseInt(b.NumMedia || "0", 10);
    const hasMedia = numMedia > 0;

    return {
      messageId: b.MessageSid || "",
      from: stripWhatsAppPrefix(b.From),
      to: stripWhatsAppPrefix(b.To),
      profileName: b.ProfileName || "",
      body: (b.Body || "").trim(),
      hasMedia,
      mediaType: hasMedia ? mediaTypeFromContentType(b.MediaContentType0) : undefined,
      raw: b,
    };
  },

  /**
   * Build TwiML response. Empty replyText → empty <Response></Response>.
   * @param {{ replyText?: string }} params
   * @returns {{ contentType: string, body: string }}
   */
  buildWebhookResponse({ replyText }) {
    const twiml = new MessagingResponse();
    if (replyText) {
      twiml.message(replyText);
    }
    return {
      contentType: "text/xml",
      body: twiml.toString(),
    };
  },
};

module.exports = adapter;
