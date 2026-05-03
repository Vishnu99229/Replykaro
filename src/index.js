require("dotenv").config();
const express = require("express");
const { handleWhatsAppMessage } = require("./whatsapp");
const { runReminders } = require("./reminders");
const cron = require("node-cron");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ReplyKaro is running", timestamp: new Date().toISOString() });
});

// Twilio WhatsApp webhook — incoming messages land here
app.post("/webhook/whatsapp", async (req, res) => {
  try {
    const { From, Body, ProfileName } = req.body;
    const patientPhone = From.replace("whatsapp:", "");
    const patientName = ProfileName || "there";
    const message = Body;

    console.log(`[WhatsApp] ${patientName} (${patientPhone}): ${message}`);

    const reply = await handleWhatsAppMessage({
      phone: patientPhone,
      name: patientName,
      message,
    });

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${reply}</Message>
</Response>`;

    res.type("text/xml").send(twiml);
  } catch (error) {
    console.error("[WhatsApp] Error:", error);
    res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Sorry, I'm having a moment. Please try again or call us directly.</Message>
</Response>`);
  }
});

// Twilio status callbacks
app.post("/webhook/status", (req, res) => {
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
