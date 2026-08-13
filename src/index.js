require("dotenv").config();
const express = require("express");
const bsp = require("./bsp");
const { handleWhatsAppMessage } = require("./whatsapp");
const { runReminders } = require("./reminders");
const cron = require("node-cron");

const app = express();
app.set("trust proxy", true);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Per-instance messageId dedup. Won't survive restart or multi-instance scale-out —
// acceptable because BSP retry windows are short.
const processedMessageIds = new Map();
const MAX_PROCESSED_IDS = 1000;

function rememberMessageId(id) {
  if (!id) return false;
  if (processedMessageIds.has(id)) return true;
  processedMessageIds.set(id, Date.now());
  if (processedMessageIds.size > MAX_PROCESSED_IDS) {
    const oldestKey = processedMessageIds.keys().next().value;
    processedMessageIds.delete(oldestKey);
  }
  return false;
}

function validateBspWebhook(req, res, next) {
  if (!bsp.validateWebhook(req)) {
    console.log(`[Security] Invalid ${bsp.name} signature from ${req.ip}`);
    return res.status(403).send("Forbidden");
  }
  return next();
}

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "ReplyKaro is running",
    bsp: bsp.name,
    timestamp: new Date().toISOString(),
  });
});

// WhatsApp inbound webhook — BSP-agnostic
app.post("/webhook/whatsapp", validateBspWebhook, async (req, res) => {
  try {
    const msg = bsp.parseIncomingMessage(req);

    if (rememberMessageId(msg.messageId)) {
      const { contentType, body } = bsp.buildWebhookResponse({ replyText: "" });
      return res.type(contentType).send(body);
    }

    // Empty body + no media → ignore (status/system noise)
    if (!msg.body && !msg.hasMedia) {
      const { contentType, body } = bsp.buildWebhookResponse({ replyText: "" });
      return res.type(contentType).send(body);
    }

    // Media-only (voice notes, images, stickers) — don't call Claude
    if (!msg.body && msg.hasMedia) {
      const { contentType, body } = bsp.buildWebhookResponse({
        replyText:
          "Hi! I can only read text messages right now. Could you please type your question or request? For voice calls, please ring the clinic directly.",
      });
      return res.type(contentType).send(body);
    }

    const patientName = msg.profileName || "there";
    console.log(`[WhatsApp] ${patientName} (${msg.from}): ${msg.body}`);

    const reply = await handleWhatsAppMessage({
      phone: msg.from,
      name: patientName,
      message: msg.body,
    });

    const { contentType, body } = bsp.buildWebhookResponse({ replyText: reply });
    res.type(contentType).send(body);
  } catch (error) {
    console.error("[WhatsApp] Error:", error);
    const { contentType, body } = bsp.buildWebhookResponse({
      replyText: "Sorry, I'm having a moment. Please try again or call us directly.",
    });
    res.type(contentType).send(body);
  }
});

// Delivery status callbacks.
// Note: not all BSPs send status callbacks the same way (or at all).
// For now we just log whatever arrives after signature validation.
app.post("/webhook/status", validateBspWebhook, (req, res) => {
  console.log(`[Status][${bsp.name}]`, req.body);
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
  console.log(`[ReplyKaro] Server running on port ${PORT} (BSP=${bsp.name})`);
});
