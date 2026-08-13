const { google } = require("googleapis");

function getCalendarClient() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    ["https://www.googleapis.com/auth/calendar"]
  );

  return google.calendar({ version: "v3", auth });
}

async function checkAvailability(date, preferredTime = "any") {
  const calendar = getCalendarClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  const timeRanges = {
    morning: { start: "09:00", end: "12:00" },
    afternoon: { start: "12:00", end: "16:00" },
    evening: { start: "16:00", end: "20:00" },
    any: { start: "09:00", end: "20:00" },
  };

  const range = timeRanges[preferredTime] || timeRanges.any;
  const timeMin = new Date(`${date}T${range.start}:00+05:30`).toISOString();
  const timeMax = new Date(`${date}T${range.end}:00+05:30`).toISOString();

  try {
    const response = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items || [];

    // All-day block (start.date without start.dateTime) → treat whole day as busy
    const hasAllDayBlock = events.some(
      (event) => event.start && event.start.date && !event.start.dateTime
    );
    if (hasAllDayBlock) {
      return {
        date,
        available: false,
        message: "That day is fully blocked. Try a different day.",
        slots: [],
      };
    }

    const busySlots = events
      .filter((event) => event.start && event.start.dateTime)
      .map((event) => ({
        start: new Date(event.start.dateTime).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "Asia/Kolkata",
        }),
        end: new Date(event.end.dateTime).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "Asia/Kolkata",
        }),
      }));

    const allSlots = generateSlots(range.start, range.end, 30);
    const availableSlots = allSlots.filter((slot) => {
      return !busySlots.some(
        (busy) => slot.start >= busy.start && slot.start < busy.end
      );
    });

    if (availableSlots.length === 0) {
      return {
        date,
        available: false,
        message: `No slots available on ${date} for ${preferredTime}. Try a different day or time.`,
        slots: [],
      };
    }

    return {
      date,
      available: true,
      slots: availableSlots.slice(0, 5).map((s) => ({
        time: s.start,
        display: formatTime12h(s.start),
      })),
    };
  } catch (error) {
    console.error("[Calendar] Error checking availability:", error.message);
    return {
      date,
      available: false,
      message: "Unable to check calendar right now. Please try again.",
      slots: [],
    };
  }
}

async function bookAppointment({ clinicId, patient_name, patient_phone, date, time, treatment, duration_minutes }) {
  const calendar = getCalendarClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const duration = duration_minutes || 30;

  const startDateTime = new Date(`${date}T${time}:00+05:30`);
  const endDateTime = new Date(startDateTime.getTime() + duration * 60 * 1000);

  try {
    const event = await calendar.events.insert({
      calendarId,
      resource: {
        summary: `${treatment} — ${patient_name}`,
        description: `Patient: ${patient_name}\nPhone: ${patient_phone}\nTreatment: ${treatment}\nBooked via: ReplyKaro WhatsApp`,
        start: {
          dateTime: startDateTime.toISOString(),
          timeZone: "Asia/Kolkata",
        },
        end: {
          dateTime: endDateTime.toISOString(),
          timeZone: "Asia/Kolkata",
        },
      },
    });

    return {
      success: true,
      appointmentId: event.data.id,
      date,
      time: formatTime12h(time),
      treatment,
      patient_name,
      message: `Appointment confirmed for ${patient_name} on ${date} at ${formatTime12h(time)} for ${treatment}.`,
    };
  } catch (error) {
    console.error("[Calendar] Error booking:", error.message);
    return {
      success: false,
      message: "Unable to book right now. Please try again or call us directly.",
    };
  }
}

function generateSlots(startTime, endTime, intervalMinutes) {
  const slots = [];
  let [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);

  while (startH < endH || (startH === endH && startM < endM)) {
    const start = `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}`;
    startM += intervalMinutes;
    if (startM >= 60) {
      startH += Math.floor(startM / 60);
      startM = startM % 60;
    }
    const end = `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}`;
    slots.push({ start, end });
  }

  return slots;
}

function formatTime12h(time24) {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

module.exports = { checkAvailability, bookAppointment };
