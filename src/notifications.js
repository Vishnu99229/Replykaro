const { sendWhatsApp } = require("./reminders");

/**
 * Notify the clinic owner that Priya escalated a conversation.
 * Uses an approved WhatsApp template (business-initiated).
 */
async function notifyOwner(clinic, reason, patient, recentMessages) {
  if (!clinic?.owner_phone) {
    console.error("[Notify] No owner_phone on clinic — cannot send flag notification");
    return;
  }

  const templateSid = process.env.TWILIO_TEMPLATE_SID_OWNER_FLAG;
  if (!templateSid) {
    console.error("[Notify] TWILIO_TEMPLATE_SID_OWNER_FLAG not set — cannot send flag notification");
    return;
  }

  const lastPatientMessage =
    [...(recentMessages || [])]
      .reverse()
      .find((m) => m.role === "user")?.content || "—";

  try {
    await sendWhatsApp(clinic.owner_phone, null, {
      contentSid: templateSid,
      contentVariables: {
        "1": patient.name || "Patient",
        "2": patient.phone || "—",
        "3": reason || "Needs attention",
        "4": lastPatientMessage.slice(0, 200),
      },
    });
    console.log(`[Notify] Owner flagged for patient ${patient.id}: ${reason}`);
  } catch (error) {
    console.error(`[Notify] Failed to notify owner:`, error.message);
  }
}

module.exports = { notifyOwner };
