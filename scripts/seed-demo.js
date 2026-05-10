const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const CLINIC_ID = 'demo-clinic-123';

const INDIAN_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan',
  'Diya', 'Sanya', 'Aanya', 'Kavya', 'Ananya', 'Myra', 'Aarohi', 'Riya', 'Priya', 'Nisha',
  'Rahul', 'Rohit', 'Amit', 'Neha', 'Pooja', 'Sneha', 'Vikram', 'Raj', 'Simran', 'Kiran',
  'Siddharth', 'Aditi', 'Rohan', 'Shruti', 'Anil', 'Sunita', 'Prakash', 'Deepa', 'Suresh', 'Geeta',
  'Manish', 'Kritika', 'Nitin', 'Pallavi', 'Vishal', 'Swati', 'Tarun', 'Shweta', 'Varun', 'Ritu'
];

const TREATMENTS = [
  'Consultation', 'Cleaning', 'Root Canal', 'Whitening', 'Braces Consult', 'Extraction', 'Fillings'
];

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPhone() {
  const digits = Math.floor(1000000000 + Math.random() * 9000000000);
  return `+91${digits}`;
}

async function seed() {
  console.log('Starting seed process...');

  // 1. Clean up old demo data
  console.log('Cleaning up old demo data...');
  // The foreign keys have CASCADE on delete if set, but if not we delete in reverse order.
  // We'll delete clinic, which should fail if foreign keys aren't cascade. Let's delete manually.
  
  // We'll just delete appointments, messages, patients for the demo clinic.
  // Wait, patients are not tied to clinic_id directly! They are tied via appointments?
  // Schema says: `patients` don't have clinic_id. But they are generated for demo.
  // Let's delete our specific patients by checking if they belong to demo clinic in appointments?
  // Actually, let's just delete the clinic and see if it cascades, if not, we can find patients via appointments.
  
  const { data: demoAppts } = await supabase.from('appointments').select('patient_id').eq('clinic_id', CLINIC_ID);
  const patientIds = demoAppts ? [...new Set(demoAppts.map(a => a.patient_id))] : [];

  await supabase.from('appointments').delete().eq('clinic_id', CLINIC_ID);
  
  if (patientIds.length > 0) {
    // Delete messages for these patients
    // Since Supabase might have limit on in() size, we chunk it
    for (let i = 0; i < patientIds.length; i += 100) {
      await supabase.from('messages').delete().in('patient_id', patientIds.slice(i, i + 100));
    }
    // Delete the patients
    for (let i = 0; i < patientIds.length; i += 100) {
      await supabase.from('patients').delete().in('id', patientIds.slice(i, i + 100));
    }
  }

  // Also try deleting by 'Demo%' name to be safe if any left over without appointments
  await supabase.from('patients').delete().like('name', '%(Demo)');

  await supabase.from('clinics').delete().eq('id', CLINIC_ID);

  // 2. Insert Demo Clinic
  console.log('Inserting Demo Clinic...');
  await supabase.from('clinics').insert({
    id: CLINIC_ID,
    slug: 'demo-clinic',
    name: 'Demo Dental Clinic',
    doctor_name: 'Dr. Aisha Sharma',
    address: '123 Health Ave, Bangalore — Floor 2',
    phone: '+919876543210'
  });

  // 3. Generate Patients
  console.log('Generating Patients...');
  const patientsToInsert = [];
  const TOTAL_PATIENTS = 450;
  
  for (let i = 0; i < TOTAL_PATIENTS; i++) {
    patientsToInsert.push({
      id: crypto.randomUUID(),
      phone: randomPhone(),
      name: `${randomItem(INDIAN_NAMES)} ${randomItem(INDIAN_NAMES)} (Demo)`,
      channel: Math.random() > 0.3 ? 'whatsapp' : 'voice',
      created_at: randomDate(new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), new Date()).toISOString()
    });
  }
  
  // Insert patients in chunks
  for (let i = 0; i < patientsToInsert.length; i += 100) {
    await supabase.from('patients').insert(patientsToInsert.slice(i, i + 100));
  }

  // 4. Generate Messages (Conversations)
  console.log('Generating Messages...');
  const messagesToInsert = [];
  // 450 patients, let's say all 450 have a conversation so conversationCount = 450
  for (const p of patientsToInsert) {
    // User message
    messagesToInsert.push({
      id: crypto.randomUUID(),
      patient_id: p.id,
      role: 'user',
      content: 'Hi, I need to book an appointment.',
      created_at: randomDate(new Date(p.created_at), new Date()).toISOString()
    });
    // Assistant message (handled_by_ai)
    messagesToInsert.push({
      id: crypto.randomUUID(),
      patient_id: p.id,
      role: 'assistant',
      content: 'Sure, I can help you with that. What date works for you?',
      created_at: randomDate(new Date(p.created_at), new Date()).toISOString()
    });
  }
  
  for (let i = 0; i < messagesToInsert.length; i += 100) {
    await supabase.from('messages').insert(messagesToInsert.slice(i, i + 100));
  }

  // 5. Generate Appointments
  console.log('Generating Appointments...');
  const appointmentsToInsert = [];
  const today = new Date();
  
  // Distribute over last 30 days
  // We need ~160 appointments in the last 30 days.
  // To ensure the chart is non-empty for every date, we put at least 1-2 per day.
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    d.setHours(10, 0, 0, 0);
    
    // Base 2 appointments per day
    let countForDay = 2 + Math.floor(Math.random() * 4); // 2 to 5
    
    // Busiest day: make Mondays have more
    if (d.getDay() === 1) { // Monday
      countForDay += 5; // 7 to 10
    }
    
    // If it's today, we need 8-18 (let's say 14)
    if (i === 0) {
      countForDay = 14;
    }
    
    for (let j = 0; j < countForDay; j++) {
      const aptDate = new Date(d);
      aptDate.setHours(9 + Math.floor(Math.random() * 8), 0, 0, 0); // between 9 AM and 5 PM
      
      const p = randomItem(patientsToInsert);
      let channel = 'whatsapp';
      const r = Math.random();
      if (r > 0.65 && r <= 0.90) channel = 'voice';
      else if (r > 0.90) channel = 'web';

      appointmentsToInsert.push({
        id: crypto.randomUUID(),
        clinic_id: CLINIC_ID,
        patient_id: p.id,
        date: aptDate.toISOString().split('T')[0],
        time: aptDate.toTimeString().substring(0, 5),
        treatment: randomItem(TREATMENTS),
        duration_minutes: 30,
        status: i > 0 ? (Math.random() > 0.1 ? 'completed' : 'no_show') : 'booked',
        booked_via: channel,
        created_at: new Date(aptDate.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days prior
      });
    }
  }

  // Future appointments for the next 14 days (to pad "This Week" card)
  // We need enough so weekCount (last 7 days + today + future) is > 100.
  // Last 7 days + today gives us ~50. So we need ~70 future appointments.
  for (let i = 1; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    
    const countForDay = 5;
    
    for (let j = 0; j < countForDay; j++) {
      const aptDate = new Date(d);
      aptDate.setHours(9 + Math.floor(Math.random() * 8), 0, 0, 0);
      
      const p = randomItem(patientsToInsert);
      let channel = 'whatsapp';
      if (Math.random() > 0.7) channel = 'voice';

      appointmentsToInsert.push({
        id: crypto.randomUUID(),
        clinic_id: CLINIC_ID,
        patient_id: p.id,
        date: aptDate.toISOString().split('T')[0],
        time: aptDate.toTimeString().substring(0, 5),
        treatment: randomItem(TREATMENTS),
        duration_minutes: 30,
        status: 'booked',
        booked_via: channel,
        created_at: today.toISOString()
      });
    }
  }

  for (let i = 0; i < appointmentsToInsert.length; i += 100) {
    await supabase.from('appointments').insert(appointmentsToInsert.slice(i, i + 100));
  }

  console.log(`Successfully inserted:
  - 1 Demo Clinic
  - ${patientsToInsert.length} Patients
  - ${messagesToInsert.length} Messages
  - ${appointmentsToInsert.length} Appointments`);
  
  console.log('Seed completed.');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
