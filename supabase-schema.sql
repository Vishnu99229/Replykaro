-- ALREADY EXECUTED IN SUPABASE — DO NOT RUN AGAIN
-- This file is included for reference only

CREATE TABLE clinics (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  doctor_name TEXT NOT NULL,
  address TEXT,
  hours TEXT,
  phone TEXT,
  owner_phone TEXT,
  twilio_number TEXT,
  payment_methods TEXT,
  parking TEXT,
  additional_info TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id TEXT REFERENCES clinics(id),
  name TEXT NOT NULL,
  price_range TEXT NOT NULL,
  duration_minutes INTEGER DEFAULT 30
);

CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT UNIQUE NOT NULL,
  name TEXT,
  first_contact TIMESTAMPTZ DEFAULT NOW(),
  channel TEXT DEFAULT 'whatsapp',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id TEXT REFERENCES clinics(id),
  patient_id UUID REFERENCES patients(id),
  date DATE NOT NULL,
  time TEXT NOT NULL,
  treatment TEXT NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  status TEXT DEFAULT 'booked' CHECK (status IN ('booked', 'completed', 'cancelled', 'no_show')),
  booked_via TEXT DEFAULT 'whatsapp',
  reminder_24h_sent BOOLEAN DEFAULT FALSE,
  reminder_2h_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
