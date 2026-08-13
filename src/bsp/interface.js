/**
 * BSP Adapter Interface — ReplyKaro
 * ==================================
 *
 * Every WhatsApp Business Solution Provider (Twilio, Gupshup, AiSensy, 360dialog,
 * MSG91, …) MUST export an object matching this contract.
 *
 * This file is documentation only. It is NOT imported at runtime.
 * See `src/bsp/twilio.js` for the reference implementation.
 * See `src/bsp/index.js` for how adapters are loaded via BSP_PROVIDER.
 *
 * -----------------------------------------------------------------------------
 * Design rules
 * -----------------------------------------------------------------------------
 * 1. Adapters own ALL BSP-specific field names, headers, auth, and response formats.
 * 2. Callers never import `twilio`, Gupshup SDKs, etc. — only `require('./bsp')`.
 * 3. sendMessage / sendTemplate return a result object; they should NOT throw for
 *    expected API failures (auth, rate limit, bad number). They MAY throw for
 *    programmer errors (missing env vars, unknown templateRef).
 * 4. templateRef is a ReplyKaro semantic key (e.g. 'reminder_24h'). Each adapter
 *    maps it to its own SID / template name / template ID via env vars.
 */

/**
 * @typedef {Object} SendResult
 * @property {boolean} success
 * @property {string} [messageId]  Provider message id on success
 * @property {string} [error]      Human-readable error on failure
 */

/**
 * @typedef {Object} IncomingMessage
 * @property {string}  messageId     Unique id for dedup (MessageSid / message.id / …)
 * @property {string}  from          Patient phone, E.164-ish, NO 'whatsapp:' prefix
 * @property {string}  to            Clinic WhatsApp number, NO 'whatsapp:' prefix
 * @property {string}  profileName   Display name if available, else ''
 * @property {string}  body          Text body; '' if media-only
 * @property {boolean} hasMedia      True if any attachment present
 * @property {string}  [mediaType]   'image' | 'audio' | 'video' | 'document' | 'sticker'
 * @property {object}  raw           Original req.body for debugging
 */

/**
 * @typedef {Object} WebhookResponse
 * @property {string} contentType  e.g. 'text/xml' or 'application/json'
 * @property {string} body         Response body to send (may be empty string)
 */

/**
 * @typedef {Object} BspAdapter
 * @property {string} name  Provider id: 'twilio' | 'gupshup' | 'aisensy' | …
 *
 * @property {function({to: string, body: string}): Promise<SendResult>} sendMessage
 *   Send a free-form text message. ONLY valid inside Meta's 24-hour customer
 *   service window (patient messaged first). Outside that window the BSP will
 *   reject the send — use sendTemplate instead.
 *
 *   Inputs:
 *     to   — phone number without 'whatsapp:' prefix
 *     body — plain text
 *
 *   Returns SendResult. On network/API failure: { success: false, error }.
 *   Does not throw for Twilio/Gupshup API errors.
 *
 * @property {function({to: string, templateRef: string, variables: Object<string,string>}): Promise<SendResult>} sendTemplate
 *   Send a pre-approved WhatsApp template (required for business-initiated
 *   outbound messages: reminders, owner flags, etc.).
 *
 *   Inputs:
 *     to          — phone number without 'whatsapp:' prefix
 *     templateRef — semantic key: 'reminder_24h' | 'reminder_2h' | 'owner_flag'
 *     variables   — positional vars as { "1": "…", "2": "…" }
 *
 *   Adapter maps templateRef → provider SID/name via env vars.
 *   Throws if templateRef is unknown or the mapped env var is missing.
 *   Returns SendResult for API-level failures.
 *
 * @property {function(import('express').Request): boolean} validateWebhook
 *   Verify the incoming HTTP request is authentic (HMAC signature, shared
 *   secret, etc.). Return true if valid (or if validation is intentionally
 *   skipped for local dev). Return false if invalid — caller must 403.
 *   Must not throw.
 *
 * @property {function(import('express').Request): IncomingMessage} parseIncomingMessage
 *   Normalize BSP-specific webhook fields into IncomingMessage.
 *   Must strip provider prefixes (e.g. 'whatsapp:').
 *   Must not throw on missing optional fields — use '' / false defaults.
 *
 * @property {function({replyText: string}): WebhookResponse} buildWebhookResponse
 *   Build the HTTP response the BSP expects after we process an inbound message.
 *   Twilio → TwiML XML. Gupshup → often empty 200. Others → JSON ack.
 *   If replyText is empty/falsy, return a no-op response (empty TwiML / empty body).
 */

// Exported only so tooling / docs can reference the shape. Not used at runtime.
module.exports = {
  /**
   * Semantic template refs used across ReplyKaro.
   * Adapters map these to provider-specific IDs.
   */
  TEMPLATE_REFS: Object.freeze({
    REMINDER_24H: "reminder_24h",
    REMINDER_2H: "reminder_2h",
    OWNER_FLAG: "owner_flag",
  }),
};
