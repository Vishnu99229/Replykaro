const twilio = require("twilio");
const { getUpcomingAppointments, updateAppointmentReminderFlag } = require("./db");

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function runReminders() {
  // 24-hour reminders (WhatsApp template — outside 24h customer service window)
  const in24h = await getUpcomingAppointments(24);
  for (const apt of in24h) {
    if (apt.reminder_24h_sent) continue;

    const patient = apt.patients;
    try {
      await sendWhatsApp(patient.phone, null, {
        contentSid: process.env.TWILIO_TEMPLATE_SID_24H,
        contentVariables: {
          "1": patient.name,
          "2": formatTime12h(apt.time),
          "3": apt.treatment,
        },
      });
      await updateAppointmentReminderFlag(apt.id, "reminder_24h_sent");
      console.log(`[Reminder] 24h reminder sent to ${patient.name}`);
    } catch (error) {
      console.error(`[Reminder] 24h failed for ${patient.name}:`, error.message);
    }
  }

  // 2-hour reminders
  const in2h = await getUpcomingAppointments(2);
  for (const apt of in2h) {
    if (apt.reminder_2h_sent) continue;

    const patient = apt.patients;
    try {
      await sendWhatsApp(patient.phone, null, {
        contentSid: process.env.TWILIO_TEMPLATE_SID_2H,
        contentVariables: {
          "1": patient.name,
          "2": formatTime12h(apt.time),
        },
      });
      await updateAppointmentReminderFlag(apt.id, "reminder_2h_sent");
      console.log(`[Reminder] 2h reminder sent to ${patient.name}`);
    } catch (error) {
      console.error(`[Reminder] 2h failed for ${patient.name}:`, error.message);
    }
  }
}

/**
 * Send a WhatsApp message.
 * @param {string} to - Phone number (without whatsapp: prefix)
 * @param {string|null} body - Free-form text (within 24h session window)
 * @param {{ contentSid?: string, contentVariables?: object }} [options]
 *   If contentSid is set, sends via Twilio Content API (approved template).
 */
async function sendWhatsApp(to, body, options = {}) {
  const { contentSid, contentVariables } = options;
  const payload = {
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to: `whatsapp:${to}`,
  };

  if (contentSid) {
    payload.contentSid = contentSid;
    payload.contentVariables = JSON.stringify(contentVariables || {});
  } else {
    payload.body = body;
  }

  try {
    await twilioClient.messages.create(payload);
  } catch (error) {
    console.error(`[Twilio] Error sending to ${to}:`, error.message);
    throw error;
  }
}

function formatTime12h(time24) {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

module.exports = { runReminders, sendWhatsApp };
