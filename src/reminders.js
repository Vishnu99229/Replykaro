const twilio = require("twilio");
const { getUpcomingAppointments } = require("./db");

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function runReminders() {
  // 24-hour reminders
  const in24h = await getUpcomingAppointments(24);
  for (const apt of in24h) {
    if (apt.reminder_24h_sent) continue;

    const patient = apt.patients;
    const message = `Hi ${patient.name}! This is a reminder that you have an appointment tomorrow at ${formatTime12h(apt.time)} for ${apt.treatment}. See you then! Reply CANCEL if you need to reschedule.`;

    await sendWhatsApp(patient.phone, message);
    console.log(`[Reminder] 24h reminder sent to ${patient.name}`);
  }

  // 2-hour reminders
  const in2h = await getUpcomingAppointments(2);
  for (const apt of in2h) {
    if (apt.reminder_2h_sent) continue;

    const patient = apt.patients;
    const message = `Hi ${patient.name}! Just a quick reminder — your appointment is in about 2 hours at ${formatTime12h(apt.time)}. See you soon!`;

    await sendWhatsApp(patient.phone, message);
    console.log(`[Reminder] 2h reminder sent to ${patient.name}`);
  }
}

async function sendWhatsApp(to, body) {
  try {
    await twilioClient.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:${to}`,
      body,
    });
  } catch (error) {
    console.error(`[Twilio] Error sending to ${to}:`, error.message);
  }
}

function formatTime12h(time24) {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

module.exports = { runReminders, sendWhatsApp };
