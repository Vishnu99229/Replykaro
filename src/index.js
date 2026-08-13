require("dotenv").config();
const express = require("express");
const twilio = require("twilio");
const { MessagingResponse } = require("twilio").twiml;
const { handleWhatsAppMessage } = require("./whatsapp");
const { runReminders } = require("./reminders");
const cron = require("node-cron");

const app = express();
app.set("trust proxy", true);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Per-instance MessageSid dedup. Won't survive restart or multi-instance scale-out —
// acceptable because Twilio's retry window is short.
const processedMessageSids = new Map();
const MAX_PROCESSED_SIDS = 1000;

function rememberMessageSid(sid) {
  if (!sid) return false;
  if (processedMessageSids.has(sid)) return true;
  processedMessageSids.set(sid, Date.now());
  if (processedMessageSids.size > MAX_PROCESSED_SIDS) {
    const oldestKey = processedMessageSids.keys().next().value;
    processedMessageSids.delete(oldestKey);
  }
  return false;
}

function validateTwilioRequest(req, res, next) {
  if (process.env.SKIP_TWILIO_VALIDATION === "true") {
    return next();
  }

  const signature = req.get("X-Twilio-Signature") || "";
  const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const valid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    signature,
    url,
    req.body
  );

  if (!valid) {
    console.log(`[Security] Invalid Twilio signature from ${req.ip}`);
    return res.status(403).send("Forbidden");
  }

  return next();
}

function emptyTwiml() {
  return new MessagingResponse().toString();
}

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ReplyKaro is running", timestamp: new Date().toISOString() });
});

// Twilio WhatsApp webhook — incoming messages land here
app.post("/webhook/whatsapp", validateTwilioRequest, async (req, res) => {
  try {
    const { From, Body, ProfileName, MessageSid, NumMedia } = req.body;

    if (rememberMessageSid(MessageSid)) {
      return res.type("text/xml").send(emptyTwiml());
    }

    const numMedia = parseInt(NumMedia || "0", 10);
    const bodyText = (Body || "").trim();

    // Empty body + no media → ignore (status/system noise)
    if (!bodyText && numMedia === 0) {
      return res.type("text/xml").send(emptyTwiml());
    }

    // Media-only (voice notes, images, stickers) — don't call Claude
    if (!bodyText && numMedia > 0) {
      const twiml = new MessagingResponse();
      twiml.message(
        "Hi! I can only read text messages right now. Could you please type your question or request? For voice calls, please ring the clinic directly."
      );
      return res.type("text/xml").send(twiml.toString());
    }

    const patientPhone = From.replace("whatsapp:", "");
    const patientName = ProfileName || "there";

    console.log(`[WhatsApp] ${patientName} (${patientPhone}): ${bodyText}`);

    const reply = await handleWhatsAppMessage({
      phone: patientPhone,
      name: patientName,
      message: bodyText,
    });

    const twiml = new MessagingResponse();
    twiml.message(reply);
    res.type("text/xml").send(twiml.toString());
  } catch (error) {
    console.error("[WhatsApp] Error:", error);
    const twiml = new MessagingResponse();
    twiml.message("Sorry, I'm having a moment. Please try again or call us directly.");
    res.type("text/xml").send(twiml.toString());
  }
});

// Twilio status callbacks
app.post("/webhook/status", validateTwilioRequest, (req, res) => {
  const { MessageSid, MessageStatus } = req.body;
  console.log(`[Status] ${MessageSid}: ${MessageStatus}`);
  res.sendStatus(200);
});

// Cron: appointment reminders every hour
cron.schedule("0 * * * *", async () => {
  console.log("[Cron] Running reminder check...");
  try {
    await runReminders();
  } catch (error) {
    console.error("[Cron] Reminder error:", error);
  }
});

// Cron: daily summary to clinic owner at 8 AM IST
cron.schedule("30 2 * * *", async () => {
  // 2:30 UTC = 8:00 AM IST
  console.log("[Cron] Sending daily summary...");
  // TODO: Build daily summary from Supabase data and send to owner
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[ReplyKaro] Server running on port ${PORT}`);
});
