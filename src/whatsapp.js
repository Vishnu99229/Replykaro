const Anthropic = require("@anthropic-ai/sdk");
const {
  getOrCreatePatient,
  getConversationHistory,
  saveMessage,
  getClinicContext,
  logAppointment,
} = require("./db");
const { checkAvailability, bookAppointment } = require("./calendar");
const { notifyOwner } = require("./notifications");

const anthropic = new Anthropic();

const MAX_TOOL_ITERATIONS = 6;
const RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const rateLimitMap = new Map(); // phone → timestamps[]

function isRateLimited(phone) {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(phone) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  timestamps.push(now);
  rateLimitMap.set(phone, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

function buildSystemPrompt(clinic) {
  return `You are Priya, the AI receptionist for ${clinic.name}. You respond to patients on WhatsApp.

## Your personality
- Warm, friendly, professional — like a helpful receptionist who genuinely cares
- Keep messages SHORT — 2-3 sentences max. This is WhatsApp, not email
- Use the patient's first name after they share it
- Speak in natural Indian English — "Sure!", "Absolutely!", "Of course!"
- Never say you're an AI unless directly asked. If asked, say "I'm Priya, the digital assistant for ${clinic.name}"

## Your primary goal
Every conversation should naturally move toward booking an appointment. You never hard-sell, but you ALWAYS offer the next step. After answering any question, gently suggest a visit.

## How to subtly push toward booking
- After answering a pricing question: "Would you like to book a consultation? Dr. ${clinic.doctor_name} can assess exactly what you need."
- After answering a general question: "Is there something specific bringing you in? I can check available slots for you."
- If they're just browsing: "No pressure at all! But if you'd ever like to come in, I can check Dr. ${clinic.doctor_name}'s availability anytime."
- If they say they'll think about it: "Of course, take your time! Just message me whenever you're ready and I'll find you a slot right away."
- If they express pain or urgency: "I'm so sorry to hear that. Let me get you booked with ${clinic.doctor_name} right away." Then immediately ask what time works today (morning/afternoon/evening), their full name, and their phone number. Use the book_appointment tool to confirm the slot as soon as you have the details.

## Booking flow
When a patient wants to book:
1. Ask what treatment/concern they have (if not already mentioned)
2. Ask their preferred day and time (morning/afternoon/evening)
3. Use the check_available_slots tool to check the calendar
4. Offer 2-3 available options
5. Confirm their choice and ask for their full name
6. Use the book_appointment tool to create the booking
7. Send a warm confirmation: "You're all booked! ${clinic.doctor_name} will see you on [date] at [time]. Please arrive 5 minutes early. We'll send you a reminder before your visit. You're in good hands! 💙"

## Clinic information
- Name: ${clinic.name}
- Address: ${clinic.address}
- Working hours: ${clinic.hours}
- Doctor: ${clinic.doctor_name}
- Services and pricing:
${clinic.services.map((s) => `  - ${s.name}: ₹${s.price_range}`).join("\n")}
- Payment methods: ${clinic.payment_methods}
- Parking: ${clinic.parking}
- Additional info: ${clinic.additional_info}

## Handling complaints and upset patients
- If a patient seems angry or has a complaint, empathize first ("I completely understand your frustration"), then offer to book them in as soon as possible. Use the book_appointment tool directly — do NOT flag for human.
- If a patient is in pain, bleeding, or describes an urgent dental issue, treat it as a same-day booking priority. Say "I'm so sorry to hear that. Let me get you booked with ${clinic.doctor_name} right away." Then collect their preferred time, name, and phone, and use book_appointment immediately.

## When to use flag_for_human (ONLY these cases)
- The patient explicitly asks to speak to a human or the doctor directly
- The book_appointment tool fails after you've already tried to book
- The patient is being abusive or threatening
- You're asked a question that isn't covered by the clinic details above (say "Let me check with the team and get back to you")

## Rules
- NEVER make up information not in the clinic details above
- ALWAYS try to book via the book_appointment tool first before escalating to a human
- For medical emergencies, say "Please call emergency services (112) or visit the nearest hospital immediately"
- Always end messages with either a question or a clear next step`;
}

const tools = [
  {
    name: "check_available_slots",
    description: "Check available appointment slots for a given date. Returns a list of available times.",
    input_schema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Date to check in YYYY-MM-DD format",
        },
        preferred_time: {
          type: "string",
          enum: ["morning", "afternoon", "evening", "any"],
          description: "Preferred time of day",
        },
      },
      required: ["date"],
    },
  },
  {
    name: "book_appointment",
    description: "Book an appointment for a patient. Creates a calendar event and logs it in the database.",
    input_schema: {
      type: "object",
      properties: {
        patient_name: { type: "string", description: "Full name of the patient" },
        patient_phone: { type: "string", description: "Phone number of the patient" },
        date: { type: "string", description: "Appointment date in YYYY-MM-DD format" },
        time: { type: "string", description: "Appointment time in HH:MM format (24hr)" },
        treatment: { type: "string", description: "Type of treatment or concern" },
        duration_minutes: {
          type: "number",
          description: "Duration in minutes. Default 30 for consultation, 45 for cleaning, 90 for root canal.",
        },
      },
      required: ["patient_name", "patient_phone", "date", "time", "treatment"],
    },
  },
  {
    name: "flag_for_human",
    description: "Flag this conversation for human follow-up. Use ONLY when: the patient explicitly asks for a human, the booking tool has failed, or the patient is abusive. Do NOT use for complaints or urgent cases — book them directly instead.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Why this needs human attention" },
      },
      required: ["reason"],
    },
  },
];

async function handleToolCall(toolName, toolInput, { clinic, patient, recentMessages }) {
  switch (toolName) {
    case "check_available_slots": {
      const slots = await checkAvailability(toolInput.date, toolInput.preferred_time);
      return JSON.stringify(slots);
    }
    case "book_appointment": {
      const duration = toolInput.duration_minutes || 30;
      const result = await bookAppointment({
        clinicId: clinic.id,
        ...toolInput,
        duration_minutes: duration,
      });

      if (result.success) {
        try {
          await logAppointment({
            clinicId: clinic.id,
            patientId: patient.id,
            date: toolInput.date,
            time: toolInput.time,
            treatment: toolInput.treatment,
            duration,
          });
        } catch (err) {
          console.error(
            `[DB][CRITICAL] Failed to persist appointment after calendar booking:`,
            err.message || err
          );
        }
      }

      return JSON.stringify(result);
    }
    case "flag_for_human": {
      console.log(`[FLAG] Human needed: ${toolInput.reason}`);
      await notifyOwner(clinic, toolInput.reason, patient, recentMessages);
      return JSON.stringify({ status: "flagged", message: "Team has been notified" });
    }
    default:
      return JSON.stringify({ error: "Unknown tool" });
  }
}

async function handleWhatsAppMessage({ phone, name, message }) {
  if (isRateLimited(phone)) {
    return "You've sent a lot of messages quickly. Please wait a couple of minutes and I'll be right with you.";
  }

  const patient = await getOrCreatePatient(phone, name);
  const clinic = await getClinicContext("demo-clinic");
  const history = await getConversationHistory(patient.id, 20);

  await saveMessage(patient.id, "user", message);

  const recentMessages = [
    ...history.map((msg) => ({ role: msg.role, content: msg.content })),
    { role: "user", content: message },
  ];

  const messages = [...recentMessages];

  let response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    system: buildSystemPrompt(clinic),
    tools,
    messages,
  });

  // Handle tool use loop (capped to prevent infinite spins)
  let toolIterations = 0;
  while (response.stop_reason === "tool_use") {
    toolIterations += 1;
    if (toolIterations > MAX_TOOL_ITERATIONS) {
      console.log(`[Claude] Tool loop cap hit for patient ${patient.id}`);
      const fallback =
        "Let me get someone from the team to help you with this. One moment please.";
      await saveMessage(patient.id, "assistant", fallback);
      return fallback;
    }

    const toolUseBlock = response.content.find((block) => block.type === "tool_use");
    const toolResult = await handleToolCall(toolUseBlock.name, toolUseBlock.input, {
      clinic,
      patient,
      recentMessages,
    });

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseBlock.id,
          content: toolResult,
        },
      ],
    });

    response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: buildSystemPrompt(clinic),
      tools,
      messages,
    });
  }

  const reply = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  await saveMessage(patient.id, "assistant", reply);

  return reply;
}

module.exports = { handleWhatsAppMessage };
