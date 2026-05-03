const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function getOrCreatePatient(phone, name) {
  const { data: existing } = await supabase
    .from("patients")
    .select("*")
    .eq("phone", phone)
    .single();

  if (existing) {
    if (name && name !== "there" && existing.name !== name) {
      await supabase.from("patients").update({ name }).eq("id", existing.id);
    }
    return existing;
  }

  const { data: newPatient, error } = await supabase
    .from("patients")
    .insert({
      phone,
      name: name || "Unknown",
      first_contact: new Date().toISOString(),
      channel: "whatsapp",
    })
    .select()
    .single();

  if (error) {
    console.error("[DB] Error creating patient:", error);
    throw error;
  }

  return newPatient;
}

async function getConversationHistory(patientId, limit = 20) {
  const { data, error } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[DB] Error fetching history:", error);
    return [];
  }

  return data || [];
}

async function saveMessage(patientId, role, content) {
  const { error } = await supabase.from("messages").insert({
    patient_id: patientId,
    role,
    content,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[DB] Error saving message:", error);
  }
}

async function getClinicContext(clinicSlug) {
  if (clinicSlug === "demo-clinic") {
    return getDemoClinic();
  }

  const { data, error } = await supabase
    .from("clinics")
    .select("*, services(*)")
    .eq("slug", clinicSlug)
    .single();

  if (error || !data) {
    console.error("[DB] Clinic not found:", clinicSlug);
    return getDemoClinic();
  }

  return data;
}

function getDemoClinic() {
  return {
    id: "demo-clinic",
    name: "Dr. Sapna Dental Care",
    slug: "demo-clinic",
    doctor_name: "Dr. Sapna",
    address: "4th Block, Koramangala, Bangalore — near Sony World Signal",
    hours: "Mon-Sat 9 AM to 8 PM, Sunday 10 AM to 2 PM",
    phone: "+919901763361",
    payment_methods: "Cash, UPI, all debit/credit cards. 0% EMI available on treatments above ₹10,000",
    parking: "Free parking in the building basement",
    additional_info: "First X-ray is complimentary. Children age 3+. Wheelchair accessible. Same-day emergency dental.",
    services: [
      { name: "Consultation", price_range: "300 (adjustable against treatment)" },
      { name: "Teeth cleaning", price_range: "1,000 - 1,500" },
      { name: "Root canal treatment", price_range: "5,000 - 12,000" },
      { name: "Teeth whitening", price_range: "8,000 - 15,000" },
      { name: "Dental implant (per implant)", price_range: "25,000 onwards" },
      { name: "Braces / Orthodontics", price_range: "35,000 - 80,000" },
      { name: "Wisdom tooth extraction", price_range: "3,000 - 8,000" },
      { name: "Crown / Cap", price_range: "4,000 - 15,000" },
      { name: "Dental veneer (per tooth)", price_range: "8,000 - 20,000" },
      { name: "Cavity filling", price_range: "800 - 3,000" },
    ],
  };
}

async function logAppointment({ clinicId, patientId, date, time, treatment, duration, status }) {
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      date,
      time,
      treatment,
      duration_minutes: duration,
      status: status || "booked",
      booked_via: "whatsapp",
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("[DB] Error logging appointment:", error);
    throw error;
  }

  return data;
}

async function getUpcomingAppointments(hoursAhead) {
  const now = new Date();
  const target = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from("appointments")
    .select("*, patients(name, phone)")
    .eq("status", "booked")
    .gte("date", now.toISOString().split("T")[0])
    .lte("date", target.toISOString().split("T")[0]);

  if (error) {
    console.error("[DB] Error fetching upcoming:", error);
    return [];
  }

  return (data || []).filter((apt) => {
    const aptDateTime = new Date(`${apt.date}T${apt.time}:00`);
    return aptDateTime >= now && aptDateTime <= target;
  });
}

module.exports = {
  getOrCreatePatient,
  getConversationHistory,
  saveMessage,
  getClinicContext,
  logAppointment,
  getUpcomingAppointments,
};
