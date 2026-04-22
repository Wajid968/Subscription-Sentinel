# Subscription Sentinel

> Track every recurring expense. Get reminded before you're charged. Visualize your spending.

A premium, full-featured subscription tracker built with **vanilla HTML, CSS & JavaScript** on the frontend and **Supabase** (PostgreSQL, Auth, Edge Functions) on the backend.

---

## ✨ Features

| Feature | Details |
|---|---|
| 🔐 Authentication | Email + password via Supabase Auth. Fully protected. |
| 📋 CRUD | Add, edit, delete subscriptions with a beautiful modal form |
| 📊 Dashboard | Monthly/yearly cost totals, active count, upcoming renewals |
| 🎨 Category Chart | Doughnut chart showing spending by category (Chart.js) |
| ⚡ Urgency Badges | Visual alerts for subscriptions renewing within 7 days |
| 🔔 Email Reminders | Supabase Edge Function sends emails 3 days before renewal |
| 📥 CSV Export | Export all subscriptions to a CSV file |
| 🌙 Dark Mode | Premium dark UI with glassmorphism & micro-animations |

---

## 📁 Project Structure

```
d:\supabase\
├── index.html                          ← Main app (single page)
├── css/
│   └── styles.css                      ← All styles
├── js/
│   ├── config.js                       ← Supabase credentials (edit this!)
│   └── app.js                          ← All application logic
└── supabase/
    ├── schema.sql                      ← Run in Supabase SQL Editor
    └── functions/
        └── send-reminders/
            └── index.ts               ← Edge Function (Deno/TypeScript)
```

---

## 🚀 Setup & Deployment

### Step 1 – Create a Supabase Project

1. Go to [app.supabase.com](https://app.supabase.com) and create a new project.
2. Wait for the database to provision.
3. Copy your credentials from **Project Settings → API**:
   - **Project URL** (e.g. `https://xyzabc.supabase.co`)
   - **anon / public key** (starts with `eyJ...`)

---

### Step 2 – Run the SQL Schema

1. In Supabase, open **SQL Editor → New Query**.
2. Paste the entire contents of `supabase/schema.sql`.
3. Click **Run**.

This creates:
- `public.subscriptions` table with RLS
- `public.reminder_logs` table with RLS
- All Row Level Security policies
- Performance indexes
- `updated_at` trigger via `moddatetime`

---

### Step 3 – Configure the Frontend

Open `js/config.js` and replace the placeholder values:

```js
const SUPABASE_URL  = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON = 'eyJ...YOUR-ANON-KEY...';
```

> ⚠️ The anon key is **safe to expose** in the browser — Row Level Security ensures users can only access their own data.

---

### Step 4 – Run Locally

Simply open `index.html` in a browser. No build step needed!

```bash
# Option A: Double-click index.html in File Explorer

# Option B: Use a simple local server (recommended to avoid CORS issues)
npx serve .
# or
python -m http.server 8080
```

Navigate to `http://localhost:8080`.

---

### Step 5 – Setup Email Reminders (Optional)

#### 5a. Get a Resend API Key

1. Sign up at [resend.com](https://resend.com).
2. Verify your domain (or use the test domain for development).
3. Create an API key.

#### 5b. Install Supabase CLI

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR-PROJECT-REF
```

#### 5c. Add the Resend secret

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxx
```

#### 5d. Update the From Email

In `supabase/functions/send-reminders/index.ts`, change:
```ts
const FROM_EMAIL = 'reminders@yourdomain.com';
```

Also update `YOUR_APP_URL` in the email template to point to your deployed app.

#### 5e. Deploy the Edge Function

```bash
supabase functions deploy send-reminders
```

#### 5f. Schedule Daily Runs with pg_cron

In Supabase **SQL Editor**, run:

```sql
-- Enable pg_cron extension (only needed once)
create extension if not exists pg_cron;

-- Schedule send-reminders to run every day at 8:00 AM UTC
select cron.schedule(
  'daily-reminders',
  '0 8 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT.supabase.co/functions/v1/send-reminders',
    headers := '{"Authorization": "Bearer YOUR-ANON-KEY", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
```

> Replace `YOUR-PROJECT` and `YOUR-ANON-KEY` with your actual values.

#### Test the Edge Function Manually

```bash
curl -X POST https://YOUR-PROJECT.supabase.co/functions/v1/send-reminders \
  -H "Authorization: Bearer YOUR-ANON-KEY" \
  -H "Content-Type: application/json"
```

---

### Step 6 – Deploy the Frontend

Since this is a static site (HTML + CSS + JS), you can host it anywhere:

#### Netlify (Easiest)
1. Drag and drop the project folder to [netlify.com/drop](https://netlify.com/drop).

#### Vercel
```bash
npx vercel --prod
```

#### GitHub Pages
1. Push to a GitHub repo.
2. Settings → Pages → Deploy from branch (`main` / root).

---

## 🔒 Security Notes

- **Row Level Security (RLS)** is enabled on all tables. Users can only ever read, write, or delete their own data.
- The **anon key** is safe to use in the browser because RLS enforces ownership.
- The **service role key** is only used in the Edge Function (server-side) and never exposed to users.
- All user input is HTML-escaped before rendering to prevent XSS.

---

## 🗃️ Database Schema

### `public.subscriptions`

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | uuid | References `auth.users` |
| `name` | text | Service name (e.g. "Netflix") |
| `amount` | decimal(10,2) | Subscription cost |
| `billing_cycle` | text | `monthly`, `yearly`, `weekly`, `quarterly` |
| `next_billing_date` | date | Next charge date |
| `category` | text | Entertainment, Software, etc. |
| `notes` | text | Optional notes |
| `active` | boolean | Is subscription active? |
| `created_at` | timestamptz | Auto-set |
| `updated_at` | timestamptz | Auto-updated via trigger |

### `public.reminder_logs`

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | uuid | References `auth.users` |
| `subscription_id` | uuid | References `subscriptions` |
| `billing_date` | date | The billing date reminded about |
| `sent_at` | timestamptz | When the reminder was sent |

---

## 📦 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3 (custom), Vanilla JavaScript |
| Auth & Database | Supabase (PostgreSQL + Supabase Auth) |
| Charts | Chart.js 4 (CDN) |
| Email | Resend API |
| Edge Functions | Supabase Edge Functions (Deno) |

---

## 🛠️ Customization

### Adding New Categories
In `index.html`, add `<option>` entries to the `#sub-category` select.
In `js/app.js`, add the color to `CAT_COLORS`.
In `css/styles.css`, add a `.cat-YourCategory` class.

### Changing the Reminder Window
In `supabase/functions/send-reminders/index.ts`, change:
```ts
in3Days.setDate(in3Days.getDate() + 3); // Change 3 to any number of days
```

---

## 📜 License

MIT — free for personal and commercial use.
