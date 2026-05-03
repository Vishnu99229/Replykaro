# ReplyKaro — AI Receptionist for Clinics

AI-powered WhatsApp receptionist for dental and aesthetic clinics in India. Handles patient queries, quotes pricing, and books appointments 24/7.

## Features

- 🤖 **AI-Powered Responses** — Claude handles patient conversations naturally
- 📅 **Appointment Booking** — Checks Google Calendar and books slots instantly
- 💬 **WhatsApp Integration** — Connects via Twilio WhatsApp API
- 🔔 **Auto Reminders** — Sends 24h and 2h appointment reminders
- 🗄️ **Patient History** — Stores conversations and patient data in Supabase
- 🚩 **Human Escalation** — Flags complex queries for clinic staff

## Tech Stack

- **Runtime**: Node.js (CommonJS)
- **Framework**: Express.js
- **AI**: Anthropic Claude (claude-sonnet-4-20250514)
- **Messaging**: Twilio WhatsApp API
- **Database**: Supabase (PostgreSQL)
- **Calendar**: Google Calendar API
- **Scheduling**: node-cron
- **Hosting**: Railway

## Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/Vishnu99229/replykaro.git
   cd replykaro
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

3. Run locally:
   ```bash
   npm run dev
   ```

## Deployment (Railway)

1. Connect GitHub repo to Railway
2. Add all environment variables from `.env.example`
3. Deploy
4. Set Twilio WhatsApp webhook to: `https://<railway-url>/webhook/whatsapp` (POST)

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Health check |
| POST | `/webhook/whatsapp` | Twilio WhatsApp incoming messages |
| POST | `/webhook/status` | Twilio message status callbacks |

## License

Private — All rights reserved.
