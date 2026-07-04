# Commonplace

A reading companion PWA: track books, take notes, photograph pages to capture
quotes (transcribed by Claude), keep a reading log, and weave notes across
books into shared themes. Data syncs across devices via Supabase.

## Architecture

- **Frontend:** React + Vite, installable as a PWA (Add to Home Screen)
- **Data & auth:** Supabase (Postgres with row-level security, magic-link sign-in)
- **AI:** Supabase Edge Function proxies to the Anthropic API — your API key
  lives server-side as a secret and requests require a signed-in user

## Setup

### 1. Supabase project

1. Create a project at https://supabase.com (free tier is fine)
2. In the SQL editor, run the contents of `supabase/schema.sql`
3. In Authentication → Providers, ensure **Email** is enabled (magic links are on by default)
4. In Authentication → URL Configuration, add your dev URL (`http://localhost:5173`)
   and later your production URL to the redirect allow list

### 2. Edge function (Anthropic proxy)

Requires the Supabase CLI (`npm i -g supabase`), then from this directory:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   # from console.anthropic.com
supabase functions deploy claude
```

### 3. Frontend

```bash
cp .env.example .env    # fill in your Supabase URL + anon key (Project Settings → API)
npm install
npm run dev             # http://localhost:5173
```

### 4. Deploy

Any static host works. With Vercel:

```bash
npm i -g vercel
vercel                  # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY as env vars
```

Then add your production URL to the Supabase auth redirect allow list (step 1.4).

### 5. Install on iPhone

Open the deployed URL in Safari → Share → **Add to Home Screen**. The app runs
full-screen with its own icon; the camera flow works through the standard photo
picker.

## Costs

- Supabase free tier covers personal use comfortably
- Anthropic API: transcribing a page or weaving themes costs roughly a cent or
  less per call with Sonnet; expect pocket change per month of active use

## Notes

- The anon key in the frontend is safe to expose by design; row-level security
  means it can only ever read/write the signed-in user's own rows.
- The Anthropic key is never in the frontend — only in the Edge Function secret.
- The Edge Function verifies the Supabase JWT automatically, so strangers can't
  spend your API credits.
