const bsp = require("./bsp");
const { getUpcomingAppointments, updateAppointmentReminderFlag } = require("./db");

async function runReminders() {
  // 24-hour reminders (template — outside 24h customer service window)
  const in24h = await getUpcomingAppointments(24);
  for (const apt of in24h) {
    if (apt.reminder_24h_sent) continue;

    const patient = apt.patients;
    try {
      const result = await bsp.sendTemplate({
        to: patient.phone,
        templateRef: "reminder_24h",
        variables: {
          "1": patient.name,
          "2": formatTime12h(apt.time),
          "3": apt.treatment,
        },
      });

      if (!result.success) {
        throw new Error(result.error || "sendTemplate failed");
      }

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
      const result = await bsp.sendTemplate({
        to: patient.phone,
        templateRef: "reminder_2h",
        variables: {
          "1": patient.name,
          "2": formatTime12h(apt.time),
        },
      });

      if (!result.success) {
        throw new Error(result.error || "sendTemplate failed");
      }

      await updateAppointmentReminderFlag(apt.id, "reminder_2h_sent");
      console.log(`[Reminder] 2h reminder sent to ${patient.name}`);
    } catch (error) {
      console.error(`[Reminder] 2h failed for ${patient.name}:`, error.message);
    }
  }
}

function formatTime12h(time24) {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

module.exports = { runReminders };
