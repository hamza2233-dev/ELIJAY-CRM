# Elijay Marketing Solutions — Pay-Per-Call QA CRM

Next.js 14 (App Router) + Tailwind CSS + Framer Motion. Dark glassmorphism UI,
3 role-based portals (Admin / Publisher / Buyer), CSV ingestion, Gemini 1.5
Flash AI call-QA classification, and optional Google Sheets sync.

## ⚠️ Security note (read this first)

The key and password you shared in chat are **not** hardcoded anywhere in
this codebase — they're wired through environment variables instead. Please:

1. **Rotate the Gemini key** you pasted earlier at https://aistudio.google.com/apikey
   (treat any key that's been shared in a chat as compromised) and put the
   new one only in Vercel's Environment Variables UI / your local `.env.local`.
2. Pick a new admin password and put it in `ADMIN_PASSWORD`, not in code.
3. Never commit `.env.local` — it's already in `.gitignore`.

## 1. Local setup

```bash
npm install
cp .env.example .env.local
# edit .env.local with real values
npm run dev
```

Visit:
- `/` — landing page with Publisher / Buyer portal links
- `/publisher/login`
- `/buyer/login`
- `/admin-secret-1045-login` (intentionally not linked anywhere in the UI)

## 2. Required environment variables

| Variable | Purpose |
|---|---|
| `ADMIN_USERNAME` | Admin login username (defaults to `admin`) |
| `ADMIN_PASSWORD` | Admin login password — **required**, no default |
| `SESSION_SECRET` | Random 32+ char string used to sign session cookies |
| `GEMINI_API_KEY` | Gemini API key for AI call QA |
| `GOOGLE_SHEET_ID` | Target spreadsheet ID (optional — sync is skipped if unset) |
| `GOOGLE_SERVICE_ACCOUNT_KEY_BASE64` | Base64-encoded service-account JSON (optional) |

### Getting the Google service account key (only needed for Sheets sync)
1. Google Cloud Console → create a Service Account → enable the Sheets API.
2. Create a JSON key for it, then base64-encode the whole file:
   `base64 -i service-account.json | tr -d '\n'`
3. Share your Google Sheet with the service account's `client_email` as an Editor.
4. Paste the base64 string into `GOOGLE_SERVICE_ACCOUNT_KEY_BASE64`.

If you skip this, the app still works fully — QA results just live in the
app's own data store instead of syncing to Sheets.

## 3. How auth works

- **Admin**: single account from `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
- **Publisher**: username = password = their Publisher ID (e.g. `EINT1031P`).
  The ID must already exist in an uploaded CSV — publishers can't log in until
  admin has uploaded at least one call row for their ID.
- **Buyer**: same pattern, keyed off the `Target` column.

## 4. CSV format (unchanged from your spec)

```
Call Date, Has Recording, Campaign, Publisher, Caller ID, Number, Time To Call,
Is Duplicate, End Call Source, Time To Connect, Target, Revenue, Payout,
Duration, Recording, Transcription
```

- `Publisher` → Publisher ID
- `Target` → Buyer ID
- `Recording` → a URL to the audio file (used directly by the custom audio player)

Upload from `/admin/dashboard` → "Upload Call CSV". Rows are appended, not
replaced, so you can upload incrementally.

## 5. AI QA

From the admin dashboard, "Run AI QA" sends any `PENDING` calls to Gemini
1.5 Flash, one batch (15) at a time, to stay inside Vercel's serverless
function time limit and Gemini's free-tier rate limits — click it again to
keep going if there are more pending. Each call is classified into: `SALE`,
`CALLBACK`, `NOT INTERESTED`, `WRONG INTENT`, `CUSTOMER MISBEHAVE`,
`AGENT MISTAKE`, or `SHORT CALL`, with a reason and a 0–100 score.

## 6. ⚠️ Persistence on Vercel

Vercel's serverless functions have a **read-only filesystem** except `/tmp`,
and `/tmp` is **not shared** across function instances or redeploys. The
included `lib/store.ts` uses a JSON file so the app runs correctly out of the
box in local dev and for quick demos, but on Vercel that means:

- Uploaded data can disappear between requests if Vercel spins up a new
  instance, and will NOT survive a redeploy.
- This is fine for a demo/pilot, but **for real production use, swap
  `lib/store.ts` for a real database** (Vercel Postgres, Supabase, Neon,
  PlanetScale — any of them integrate cleanly with Vercel) or treat Google
  Sheets as your source of truth and read calls back from `lib/sheets.ts`
  instead of the JSON file. The rest of the app (auth, UI, AI QA, API routes)
  doesn't need to change — only the handful of functions in `lib/store.ts`.

## 7. Deploying to Vercel

```bash
npm i -g vercel   # if you don't have it
vercel
```

Then add all the environment variables from step 2 in the Vercel project's
Settings → Environment Variables, and redeploy.

## 8. Project structure

```
app/
  api/            → auth, calls, upload, classify route handlers
  admin/dashboard  publisher/dashboard  buyer/dashboard
  publisher/login  buyer/login  admin-secret-1045-login
components/        → all UI (glass cards, animated bg, audio player, table...)
lib/
  auth.ts          → login checks for the 3 roles
  session.ts       → signed cookie session
  store.ts         → data read/write (see persistence note above)
  csv.ts           → CSV → CallRecord parsing
  gemini.ts        → Gemini 1.5 Flash QA classification
  sheets.ts        → optional Google Sheets sync (ALL_CALLS, PUB_x, BUYER_x, DASHBOARD)
middleware.ts      → protects the 3 dashboard routes by role
```
