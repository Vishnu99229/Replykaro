/**
 * ReplyKaro walkthrough seed — Lumina Dental & Aesthetics
 *
 * Usage:
 *   node scripts/seed-data.js --wipe     # required on first run or to reset
 *   node scripts/seed-data.js --wipe --dry-run
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const ARGS = new Set(process.argv.slice(2));
const WIPE = ARGS.has('--wipe');
const DRY_RUN = ARGS.has('--dry-run');

const CLINIC_SLUG = 'demo-clinic';
const CLINIC_UPDATE = {
  name: 'Lumina Dental & Aesthetics',
  doctor_name: 'Dr. Priya Nair',
  address: '100 Feet Road, Indiranagar, Bangalore — near CMH Road junction',
};

const PATIENT_NAMES = [
  'Ananya Iyer', 'Rohan Malhotra', 'Kavya Reddy', 'Arjun Menon', 'Sneha Kulkarni',
  'Vikram Shetty', 'Divya Krishnan', 'Aditya Rao', 'Meera Pillai', 'Karthik Nambiar',
  'Ishita Sharma', 'Nikhil Verma', 'Priyanka Dutta', 'Sanjay Chopra', 'Lakshmi Venkatesh',
  'Rahul Banerjee', 'Pooja Iyengar', 'Harish Naidu', 'Nandini Bose', 'Varun Kapoor',
  'Shreya Patel', 'Manish Gill', 'Tanvi Desai', 'Gaurav Saxena', 'Ritu Agarwal',
  'Deepak Joshi', 'Ayesha Khan', 'Farhan Mirza', 'Zara Siddiqui', 'Harsh Trivedi',
  'Swati Mishra', 'Abhishek Pandey', 'Neha Bhat', 'Suresh Warrier', 'Gayatri Subramanian',
  'Pranav Hegde', "Rhea D'Souza", 'Akash Chatterjee',
];

const TREATMENT_FALLBACKS = [
  { name: 'Teeth cleaning', duration_minutes: 45 },
  { name: 'Root canal', duration_minutes: 60 },
  { name: 'Tooth extraction', duration_minutes: 45 },
  { name: 'Dental implant consultation', duration_minutes: 30 },
  { name: 'Teeth whitening', duration_minutes: 60 },
  { name: 'Braces consultation', duration_minutes: 30 },
  { name: 'Cavity filling', duration_minutes: 30 },
];

const TIME_SLOTS = [
  '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00',
  '17:30', '18:00', '18:30', '19:00',
];

// --- Seeded PRNG (reproducible runs) ---
function createRng(seed = 20260709) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = createRng();

function pick(arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dateStr(d) {
  return d.toISOString().split('T')[0];
}

function addDays(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d;
}

function addMinutes(iso, mins) {
  return new Date(new Date(iso).getTime() + mins * 60_000).toISOString();
}

function weightedPastDay(offsetMin, offsetMax) {
  // Quadratic bias toward recent weeks (offset 0 = today)
  const t = rand() * rand();
  const offset = Math.round(offsetMin + t * (offsetMax - offsetMin));
  return offset;
}

function randomPhone(used) {
  let phone;
  do {
    const digits = 9000000000 + Math.floor(rand() * 999999999);
    phone = `+91${digits}`;
  } while (used.has(phone));
  used.add(phone);
  return phone;
}

function formatSlot(date, time) {
  return new Date(`${date}T${time}:00+05:30`).toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

function pastStatus() {
  const r = rand();
  if (r < 0.70) return 'completed';
  if (r < 0.78) return 'cancelled';
  if (r < 0.83) return 'no_show';
  return 'completed';
}

// --- Conversation templates ---
const ENQUIRIES = {
  'Teeth cleaning': [
    'Hi, do you do teeth cleaning? What is the cost?',
    'Hello, I need a dental cleaning. How much does it cost?',
    'Hi there, wanted to check pricing for teeth cleaning please.',
  ],
  'Root canal': [
    'Hi, I think I need a root canal. Is Dr. Priya available this week?',
    'Hello, having severe tooth pain. Do you do root canal treatment?',
    'Hi, my dentist referred me for root canal. Can I book a slot?',
  ],
  'Tooth extraction': [
    'Hi, I need a wisdom tooth removed. Is that something you do?',
    'Hello, need to get a tooth extracted. What are your charges?',
    'Hi, can I book for tooth extraction? Having a lot of pain.',
  ],
  'Dental implant consultation': [
    'Hi, I am interested in dental implants. Can I come for a consultation?',
    'Hello, wanted to enquire about implant options and pricing.',
    'Hi, do you offer dental implants? Would like to consult first.',
  ],
  'Teeth whitening': [
    'Hi, do you do teeth whitening? What is the cost?',
    'Hello, interested in professional whitening. How long does it take?',
    'Hi there, saw your clinic online. Do you have teeth whitening?',
  ],
  'Braces consultation': [
    'Hi, I want to get braces for my daughter. Can we come for a consultation?',
    'Hello, interested in braces/aligners. Do you offer a first consult?',
    'Hi, looking for orthodontic consultation. What is the fee?',
  ],
  'Cavity filling': [
    'Hi, I think I have a cavity. Can I get an appointment?',
    'Hello, need a filling done. How soon can you slot me in?',
    'Hi, tooth is sensitive — probably needs a filling. Available tomorrow?',
  ],
};

const NO_BOOK_ENQUIRIES = [
  'Hi, do you do teeth whitening? What is the cost?',
  'Hello, wanted to know your consultation charges.',
  'Hi, do you have parking at the clinic?',
  'Hi, are you open on Sundays?',
  'Hello, what payment modes do you accept?',
  'Hi, do you treat kids? My son is 8 years old.',
];

function priceReply(treatment, priceRange) {
  return `Hi! Yes, we offer ${treatment.toLowerCase()}. The cost is around ₹${priceRange}. Would you like me to check available slots for you?`;
}

function slotReply(date, time) {
  return `I have an opening on ${formatSlot(date, time)}. Shall I book that for you?`;
}

function confirmReply(name, date, time, treatment) {
  return `Done! Your appointment is confirmed for ${name} on ${formatSlot(date, time)} for ${treatment}. You'll receive a reminder a day before. See you then! 😊`;
}

function bookingThread(patient, appt, service, clinic) {
  const treatment = appt.treatment;
  const msgs = [];
  const base = new Date(appt.created_at);
  const enquiry = pick(ENQUIRIES[treatment] || [`Hi, I'd like to book for ${treatment}.`]);
  const priceRange = service?.price_range || '—';

  let t = addMinutes(base.toISOString(), -rand() * 180 - 120); // 2–5 hrs before booking

  msgs.push({ role: 'user', content: enquiry, created_at: t });

  t = addMinutes(t, 1 + Math.floor(rand() * 3));
  msgs.push({
    role: 'assistant',
    content: `Hello! Thank you for reaching out to ${clinic.name}. ${priceReply(treatment, priceRange)}`,
    created_at: t,
  });

  if (rand() > 0.4) {
    t = addMinutes(t, 2 + Math.floor(rand() * 8));
    msgs.push({
      role: 'user',
      content: pick([
        'Can I get appointment tomorrow evening?',
        'Do you have anything this Saturday?',
        'Morning slots are better for me, is that possible?',
        'What times are available this week?',
      ]),
      created_at: t,
    });

    t = addMinutes(t, 1 + Math.floor(rand() * 2));
    msgs.push({ role: 'assistant', content: slotReply(appt.date, appt.time), created_at: t });
  }

  t = addMinutes(t, 3 + Math.floor(rand() * 10));
  msgs.push({
    role: 'user',
    content: pick(['Yes please, book it.', 'That works, please confirm.', 'Sounds good, go ahead.', `Yes, my name is ${patient.name}.`]),
    created_at: t,
  });

  t = addMinutes(t, 1 + Math.floor(rand() * 2));
  msgs.push({
    role: 'assistant',
    content: confirmReply(patient.name.split(' ')[0], appt.date, appt.time, treatment),
    created_at: t,
  });

  if (rand() > 0.6) {
    t = addMinutes(t, 5 + Math.floor(rand() * 20));
    msgs.push({ role: 'user', content: pick(['Thank you!', 'Great, see you then.', 'Perfect, thanks so much.']), created_at: t });
  }

  // Ensure all messages precede appointment created_at
  const cutoff = new Date(appt.created_at).getTime();
  return msgs.map((m) => {
    let ts = new Date(m.created_at).getTime();
    if (ts >= cutoff) ts = cutoff - 60_000 - Math.floor(rand() * 300_000);
    return { ...m, created_at: new Date(ts).toISOString() };
  });
}

function enquiryOnlyThread(patient, clinic) {
  const msgs = [];
  const daysAgo = weightedPastDay(1, 40);
  let t = addDays(new Date(), -daysAgo);
  t.setHours(9 + Math.floor(rand() * 10), Math.floor(rand() * 60), 0, 0);

  const enquiry = pick(NO_BOOK_ENQUIRIES);
  msgs.push({ role: 'user', content: enquiry, created_at: t.toISOString() });

  t = new Date(addMinutes(t.toISOString(), 1 + Math.floor(rand() * 3)));
  msgs.push({
    role: 'assistant',
    content: pick([
      `Hi! ${clinic.doctor_name} and our team would be happy to help. ${enquiry.includes('Sunday') ? 'We are open Sunday 10 AM to 2 PM.' : enquiry.includes('parking') ? 'Yes, basement parking is available for patients.' : enquiry.includes('payment') ? 'We accept cash, UPI, and all major cards.' : enquiry.includes('kids') ? 'Yes, we treat children aged 3 and above.' : 'Our consultation fee is ₹300, adjustable against treatment.'} Let me know if you'd like to book a visit!`,
      `Hello! Thanks for messaging ${clinic.name}. I'd be glad to share more details — would you like to schedule a visit with ${clinic.doctor_name}?`,
    ]),
    created_at: t.toISOString(),
  });

  if (rand() > 0.5) {
    t = new Date(addMinutes(t.toISOString(), 10 + Math.floor(rand() * 60)));
    msgs.push({
      role: 'user',
      content: pick(['Ok, I will think about it and get back.', 'Thanks, let me check my schedule.', 'Noted, thank you!']),
      created_at: t.toISOString(),
    });
  }

  return msgs;
}

function voiceThread(patient, appt, clinic) {
  const treatment = appt?.treatment || 'consultation';
  const daysAgo = appt ? Math.max(1, Math.floor((Date.now() - new Date(appt.created_at).getTime()) / 86400000) + 1) : weightedPastDay(1, 30);
  let t = addDays(new Date(), -daysAgo);
  t.setHours(10 + Math.floor(rand() * 8), Math.floor(rand() * 60), 0, 0);

  return [
    { role: 'user', content: `[Voice call] Patient called to enquire about ${treatment}.`, created_at: t.toISOString() },
    {
      role: 'assistant',
      content: `[Call summary] Discussed ${treatment} with ${patient.name.split(' ')[0]}. ${appt ? `Booked for ${formatSlot(appt.date, appt.time)}.` : 'Patient will call back to confirm.'}`,
      created_at: addMinutes(t.toISOString(), 3 + Math.floor(rand() * 5)),
    },
  ];
}

// --- Supabase helpers ---
async function batchInsert(supabase, table, rows, size = 100) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`${table} insert failed: ${error.message}`);
  }
}

async function wipeData(supabase) {
  console.log('Wiping patients, messages, appointments...');
  if (DRY_RUN) return;
  await supabase.from('messages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('appointments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('patients').delete().neq('id', '00000000-0000-0000-0000-000000000000');
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const today = dateStr(now);

  // Guard: require --wipe if data exists
  const { count: existingPatients } = await supabase
    .from('patients')
    .select('*', { count: 'exact', head: true });

  if (existingPatients > 0 && !WIPE) {
    console.error(
      `Found ${existingPatients} existing patients. Re-run with --wipe to replace data.\n` +
        '  node scripts/seed-data.js --wipe'
    );
    process.exit(1);
  }

  if (!WIPE && existingPatients === 0) {
    console.log('No existing data — proceeding without wipe.');
  }

  // --- Clinic ---
  const { data: clinic, error: clinicErr } = await supabase
    .from('clinics')
    .select('id, slug, name, services(*)')
    .eq('slug', CLINIC_SLUG)
    .single();

  if (clinicErr || !clinic) {
    console.error(`Clinic with slug "${CLINIC_SLUG}" not found. Create it in Supabase first.`);
    process.exit(1);
  }

  console.log(`Clinic: ${clinic.name} (${clinic.id})`);

  if (!DRY_RUN) {
    const { error: updateErr } = await supabase
      .from('clinics')
      .update(CLINIC_UPDATE)
      .eq('id', clinic.id);
    if (updateErr) throw new Error(`Clinic update failed: ${updateErr.message}`);
  }

  const clinicUpdated = { ...clinic, ...CLINIC_UPDATE };

  // Services / treatments
  let treatments = (clinic.services || [])
    .filter((s) => TREATMENT_FALLBACKS.some((t) => s.name.toLowerCase().includes(t.name.toLowerCase().split(' ')[0])))
    .map((s) => ({ name: s.name, duration_minutes: s.duration_minutes || 30, price_range: s.price_range }));

  if (treatments.length < 5) {
    treatments = TREATMENT_FALLBACKS.map((t) => ({ ...t, price_range: '—' }));
  }

  // Normalise to preferred display names where possible
  const preferredNames = TREATMENT_FALLBACKS.map((t) => t.name);
  treatments = preferredNames.map((name) => {
    const match = treatments.find((t) => t.name.toLowerCase().includes(name.toLowerCase().split(' ')[0]));
    return match ? { ...match, name } : { name, duration_minutes: pick([30, 45, 60]), price_range: '—' };
  });

  if (WIPE) await wipeData(supabase);

  // --- Patients (38) ---
  const usedPhones = new Set();
  const channels = shuffle([
    ...Array(27).fill('whatsapp'),
    ...Array(11).fill('voice'),
  ]);

  const patients = PATIENT_NAMES.map((name, i) => {
    const daysAgo = weightedPastDay(0, 44);
    const firstContact = addDays(now, -daysAgo);
    firstContact.setHours(8 + Math.floor(rand() * 12), Math.floor(rand() * 60), 0, 0);
    return {
      id: crypto.randomUUID(),
      phone: randomPhone(usedPhones),
      name,
      channel: channels[i],
      first_contact: firstContact.toISOString(),
      created_at: firstContact.toISOString(),
    };
  });

  // --- Appointment date buckets (52 total) ---
  const apptBuckets = [];

  // 2 today
  for (let i = 0; i < 2; i++) apptBuckets.push({ dayOffset: 0, future: true });

  // 6 in next 7 days (days +1 .. +6)
  for (let d = 1; d <= 6; d++) apptBuckets.push({ dayOffset: d, future: true });

  // ~9 in last 30 days (days -1 .. -29) — keeps analytics monthTotal ~17 with today+future
  const recentPastOffsets = shuffle(
    Array.from({ length: 29 }, (_, i) => -(i + 1))
  ).slice(0, 9);
  for (const off of recentPastOffsets) apptBuckets.push({ dayOffset: off, future: false });

  // Remaining ~35 in days -30 .. -45 (outside 30-day analytics window)
  while (apptBuckets.length < 52) {
    const off = -30 - Math.floor(rand() * 16); // -30 to -45
    apptBuckets.push({ dayOffset: off, future: false });
  }

  // Saturday weighting: replace ~8 random past slots with Saturdays
  const saturdayOffsets = [];
  for (let off = -45; off <= 6; off++) {
    if (addDays(now, off).getDay() === 6) saturdayOffsets.push(off);
  }
  const satPool = shuffle(saturdayOffsets);
  let satIdx = 0;
  for (let i = 0; i < apptBuckets.length && satIdx < satPool.length && satIdx < 10; i++) {
    if (!apptBuckets[i].future && rand() < 0.35) {
      apptBuckets[i] = { dayOffset: satPool[satIdx++], future: false };
    }
  }

  // Assign patients: ~6 with no appointments, rest 1-3 each
  const noApptPatients = new Set(shuffle(patients.map((p) => p.id)).slice(0, 6));
  const patientApptCounts = new Map();
  for (const p of patients) patientApptCounts.set(p.id, noApptPatients.has(p.id) ? 0 : 1);

  // Give extra appointments to ~10 patients (2-3 total)
  const eligible = patients.filter((p) => !noApptPatients.has(p.id));
  const multi = shuffle(eligible).slice(0, 10);
  for (const p of multi) {
    patientApptCounts.set(p.id, rand() < 0.4 ? 3 : 2);
  }

  // Build patient pool repeated by appt count
  const patientPool = [];
  for (const p of patients) {
    const n = patientApptCounts.get(p.id);
    for (let j = 0; j < n; j++) patientPool.push(p);
  }

  // Trim or pad pool to exactly 52
  while (patientPool.length < 52) {
    patientPool.push(pick(eligible));
  }
  patientPool.length = 52;
  const shuffledPool = shuffle(patientPool);

  const appointments = apptBuckets.map((bucket, i) => {
    const patient = shuffledPool[i];
    const treatment = pick(treatments);
    const apptDate = addDays(now, bucket.dayOffset);
    const date = dateStr(apptDate);
    const time = pick(TIME_SLOTS);
    const status = bucket.future ? 'booked' : pastStatus();
    const createdDay = bucket.future
      ? addDays(now, -Math.floor(rand() * 3))
      : addDays(apptDate, -Math.floor(rand() * 5) - 1);
    createdDay.setHours(10 + Math.floor(rand() * 8), Math.floor(rand() * 60), 0, 0);

    return {
      id: crypto.randomUUID(),
      clinic_id: clinic.id,
      patient_id: patient.id,
      date,
      time,
      treatment: treatment.name,
      duration_minutes: treatment.duration_minutes,
      status,
      booked_via: patient.channel,
      reminder_24h_sent: !bucket.future && status === 'completed',
      reminder_2h_sent: !bucket.future && status === 'completed',
      created_at: createdDay.toISOString(),
    };
  });

  // --- Messages (~340) ---
  const messages = [];
  const apptsByPatient = new Map();
  for (const a of appointments) {
    if (!apptsByPatient.has(a.patient_id)) apptsByPatient.set(a.patient_id, []);
    apptsByPatient.get(a.patient_id).push(a);
  }

  for (const patient of patients) {
    const patientAppts = apptsByPatient.get(patient.id) || [];

    if (patient.channel === 'voice') {
      const appt = patientAppts[0];
      for (const m of voiceThread(patient, appt, clinicUpdated)) {
        messages.push({ id: crypto.randomUUID(), patient_id: patient.id, ...m });
      }
      continue;
    }

    if (patientAppts.length === 0) {
      for (const m of enquiryOnlyThread(patient, clinicUpdated)) {
        messages.push({ id: crypto.randomUUID(), patient_id: patient.id, ...m });
      }
      continue;
    }

    // WhatsApp booking thread(s) — primary appt gets full thread, extras get shorter
    const sortedAppts = [...patientAppts].sort((a, b) => a.date.localeCompare(b.date));
    for (let j = 0; j < sortedAppts.length; j++) {
      const appt = sortedAppts[j];
      const svc = treatments.find((t) => t.name === appt.treatment) || treatments[0];
      const thread = j === 0
        ? bookingThread(patient, appt, svc, clinicUpdated)
        : bookingThread(patient, appt, svc, clinicUpdated).slice(0, 4);
      for (const m of thread) {
        messages.push({ id: crypto.randomUUID(), patient_id: patient.id, ...m });
      }
    }
  }

  // Cap future-dated messages
  const nowIso = new Date().toISOString();
  for (const m of messages) {
    if (m.created_at > nowIso) m.created_at = nowIso;
  }

  // Pad with realistic follow-ups to reach ~340 messages
  const FOLLOW_UPS = [
    { role: 'assistant', content: 'Hi! Just a reminder — your appointment is tomorrow. Reply CANCEL if you need to reschedule.' },
    { role: 'user', content: 'Thanks for the reminder, see you tomorrow!' },
    { role: 'user', content: 'Can I reach 15 minutes early for the paperwork?' },
    { role: 'assistant', content: 'Of course! Please arrive 10–15 minutes early. We look forward to seeing you.' },
    { role: 'assistant', content: 'Hope your visit went well! Please let us know if you have any post-treatment questions.' },
    { role: 'user', content: 'Visit went great, thank you Dr. Priya and team!' },
    { role: 'user', content: 'Is it normal to have slight sensitivity after the cleaning?' },
    { role: 'assistant', content: 'Yes, mild sensitivity for a day or two is normal after cleaning. If it persists beyond 3 days, do message us.' },
  ];

  const whatsappBooked = patients.filter(
    (p) => p.channel === 'whatsapp' && (apptsByPatient.get(p.id) || []).length > 0
  );

  let padIdx = 0;
  while (messages.length < 335 && padIdx < whatsappBooked.length * 4) {
    const patient = whatsappBooked[padIdx % whatsappBooked.length];
    const appts = apptsByPatient.get(patient.id) || [];
    const appt = appts[0];
    const fu = FOLLOW_UPS[Math.floor(rand() * FOLLOW_UPS.length)];
    const anchor = appt
      ? new Date(appt.date + 'T' + appt.time + ':00+05:30')
      : new Date(patient.first_contact);
    const offsetMins = fu.role === 'assistant' && fu.content.includes('reminder')
      ? -24 * 60 - Math.floor(rand() * 120)
      : Math.floor(rand() * 48 * 60);
    let ts = new Date(anchor.getTime() + offsetMins);
    if (ts > new Date()) ts = new Date(Date.now() - Math.floor(rand() * 7 * 86400000));

    messages.push({
      id: crypto.randomUUID(),
      patient_id: patient.id,
      role: fu.role,
      content: fu.content,
      created_at: ts.toISOString(),
    });
    padIdx++;
  }

  for (const m of messages) {
    if (m.created_at > nowIso) m.created_at = nowIso;
  }

  // --- Summary preview ---
  const waPatients = patients.filter((p) => p.channel === 'whatsapp').length;
  const voicePatients = patients.filter((p) => p.channel === 'voice').length;
  const todayCount = appointments.filter((a) => a.date === today).length;
  const upcoming7 = appointments.filter((a) => {
    const d = new Date(a.date + 'T00:00:00');
    const diff = (d - now) / 86400000;
    return diff >= 0 && diff <= 7;
  }).length;
  const thirtyDaysAgo = dateStr(addDays(now, -30));
  const monthAppts = appointments.filter((a) => a.date >= thirtyDaysAgo).length;
  const convRate = Math.round((monthAppts / patients.length) * 100);
  const waAppts = appointments.filter((a) => a.booked_via === 'whatsapp').length;

  console.log('\n--- Seed plan ---');
  console.log(`Patients:      ${patients.length} (${waPatients} WhatsApp, ${voicePatients} voice)`);
  console.log(`Appointments:  ${appointments.length}`);
  console.log(`Messages:      ${messages.length}`);
  console.log(`Today:         ${todayCount}`);
  console.log(`Next 7 days:   ${upcoming7}`);
  console.log(`Analytics window (30d): ${monthAppts} appts → ~${convRate}% conv. rate`);
  console.log(`Channel split: ${Math.round((waAppts / appointments.length) * 100)}% WA / ${100 - Math.round((waAppts / appointments.length) * 100)}% voice`);
  console.log(`No-appt patients: ${noApptPatients.size}`);

  if (DRY_RUN) {
    console.log('\n[dry-run] No data written.');
    return;
  }

  console.log('\nInserting...');
  await batchInsert(supabase, 'patients', patients);
  await batchInsert(supabase, 'appointments', appointments);
  await batchInsert(supabase, 'messages', messages);

  console.log('\n--- Verification ---');
  const tables = ['patients', 'appointments', 'messages'];
  for (const t of tables) {
    const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
    console.log(`  ${t}: ${count}`);
  }

  const { data: demoCheck } = await supabase.from('patients').select('name').ilike('name', '%demo%');
  console.log(`  "demo" in names: ${demoCheck?.length ? 'FOUND (unexpected)' : 'none ✓'}`);

  console.log(`  Conversion rate: ~${convRate}%`);
  console.log(`  Date range: ${appointments.reduce((min, a) => (a.date < min ? a.date : min), '9999')} → ${appointments.reduce((max, a) => (a.date > max ? a.date : max), '0000')}`);
  console.log('\nSeed complete.');
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
