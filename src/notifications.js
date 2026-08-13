const bsp = require("./bsp");

/**
 * Notify the clinic owner that Priya escalated a conversation.
 * Uses an approved WhatsApp template (business-initiated).
 */
async function notifyOwner(clinic, reason, patient, recentMessages) {
  if (!clinic?.owner_phone) {
    console.error("[Notify] No owner_phone on clinic — cannot send flag notification");
    return;
  }

  const lastPatientMessage =
    [...(recentMessages || [])]
      .reverse()
      .find((m) => m.role === "user")?.content || "—";

  try {
    const result = await bsp.sendTemplate({
      to: clinic.owner_phone,
      templateRef: "owner_flag",
      variables: {
        "1": patient.name || "Patient",
        "2": patient.phone || "—",
        "3": reason || "Needs attention",
        "4": lastPatientMessage.slice(0, 200),
      },
    });

    if (!result.success) {
      throw new Error(result.error || "sendTemplate failed");
    }

    console.log(`[Notify] Owner flagged for patient ${patient.id}: ${reason}`);
  } catch (error) {
    console.error(`[Notify] Failed to notify owner:`, error.message);
  }
}

module.exports = { notifyOwner };
