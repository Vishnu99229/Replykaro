const Anthropic = require("@anthropic-ai/sdk");
const { getOrCreatePatient, getConversationHistory, saveMessage, getClinicContext } = require("./db");
const { checkAvailability, bookAppointment } = require("./calendar");

const anthropic = new Anthropic();

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
- If they express pain or urgency: "I'm sorry to hear that. Let me check the earliest available slot for you — would today or tomorrow work?"

## Booking flow
When a patient wants to book:
1. Ask what treatment/concern they have (if not already mentioned)
2. Ask their preferred day and time (morning/afternoon/evening)
3. Use the check_available_slots tool to check the calendar
4. Offer 2-3 available options
5. Confirm their choice and ask for their full name
6. Use the book_appointment tool to create the booking
7. Send confirmation: "You're all set! ${clinic.doctor_name} will see you on [date] at [time]. We'll send you a reminder before your visit."

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

## Rules
- NEVER make up information not in the clinic details above
- If asked something you don't know, say "Let me check with the team and get back to you" and use the flag_for_human tool
- If a patient seems angry or has a complaint, say "I completely understand your concern. Let me connect you with ${clinic.doctor_name} directly" and use the flag_for_human tool
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
    description: "Flag this conversation for human follow-up. Use when you can't answer a question, the patient is upset, or the situation needs a human.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Why this needs human attention" },
      },
      required: ["reason"],
    },
  },
];

async function handleToolCall(toolName, toolInput, clinicId) {
  switch (toolName) {
    case "check_available_slots": {
      const slots = await checkAvailability(toolInput.date, toolInput.preferred_time);
      return JSON.stringify(slots);
    }
    case "book_appointment": {
      const result = await bookAppointment({
        clinicId,
        ...toolInput,
        duration_minutes: toolInput.duration_minutes || 30,
      });
      return JSON.stringify(result);
    }
    case "flag_for_human": {
      console.log(`[FLAG] Human needed: ${toolInput.reason}`);
      return JSON.stringify({ status: "flagged", message: "Team has been notified" });
    }
    default:
      return JSON.stringify({ error: "Unknown tool" });
  }
}

async function handleWhatsAppMessage({ phone, name, message }) {
  const patient = await getOrCreatePatient(phone, name);
  const clinic = await getClinicContext("demo-clinic");
  const history = await getConversationHistory(patient.id, 20);

  await saveMessage(patient.id, "user", message);

  const messages = [
    ...history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: "user", content: message },
  ];

  let response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    system: buildSystemPrompt(clinic),
    tools,
    messages,
  });

  // Handle tool use loop
  while (response.stop_reason === "tool_use") {
    const toolUseBlock = response.content.find((block) => block.type === "tool_use");
    const toolResult = await handleToolCall(toolUseBlock.name, toolUseBlock.input, clinic.id);

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
