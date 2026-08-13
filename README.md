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

## Demo Data

To populate the dashboard and analytics pages with realistic demo data (patients, conversations, and appointments), run the included seed script:

```bash
npm run seed:demo
```

**Note**: This script connects to the Supabase instance defined by `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your root `.env` file. It inserts data for a single "Demo Clinic". 

To wipe the demo data, simply run the seed script again (it's idempotent and clears old demo rows before re-inserting) or manually delete the clinic with ID `demo-clinic-123` from your database (which will cascade to delete demo appointments and related data).

## BSP (WhatsApp Provider) Configuration

ReplyKaro uses a swappable adapter pattern for WhatsApp providers. Change providers by setting `BSP_PROVIDER` in your env.

### Supported providers
- `twilio` (default, production-ready)
- `gupshup` (stub — implementation pending)

### Adding a new BSP
1. Create `src/bsp/<name>.js` implementing the interface in `src/bsp/interface.js`.
2. Register it in `src/bsp/index.js`.
3. Add env vars for it in `.env.example`.
4. Set `BSP_PROVIDER=<name>` in Railway.

The rest of the app (webhooks, reminders, notifications) requires no changes.

## License

Private — All rights reserved.
