# GameStreamer — Setup Guide

## What you have
- `/api/games.js` — create and list games
- `/api/game/[id]/play.js` — submit a natural language play (calls Claude Haiku)
- `/api/game/[id]/state.js` — get current game state
- `/public/scorer.html` — scorekeeper UI (phone-friendly)
- `/public/viewer.html` — viewer UI with live video + score

---

## Step 1 — Run the database schema

1. Open your Supabase project: https://supabase.com/dashboard/project/izddxiligsqzbnorcwlf
2. Click **SQL Editor** in the left sidebar
3. Click **New query**
4. Paste the contents of `schema.sql`
5. Click **Run**

---

## Step 2 — Get your Anthropic API key

1. Go to https://console.anthropic.com
2. Create an account / sign in
3. Go to **API Keys** → **Create key**
4. Copy the key (starts with `sk-ant-`)

---

## Step 3 — Get your Supabase service role key

1. Supabase dashboard → Settings → API Keys → **service_role** → Reveal
2. Copy it (needed for server-side writes)

---

## Step 4 — Deploy to Vercel

```bash
# Install dependencies
npm install

# Install Vercel CLI
npm install -g vercel

# Deploy (first time sets up project)
vercel

# Set environment variables
vercel env add SUPABASE_URL
# → https://izddxiligsqzbnorcwlf.supabase.co

vercel env add SUPABASE_ANON_KEY
# → eyJhbGci... (your anon key)

vercel env add SUPABASE_SERVICE_KEY
# → your service_role key

vercel env add ANTHROPIC_API_KEY
# → sk-ant-...

# Deploy to production
vercel --prod
```

---

## Step 5 — Use it

### Scorekeeper (at the field)
Open: `https://your-app.vercel.app/scorer.html`
- Enter team names → Start Game
- Type plays in plain English → Submit
- Use voice input (🎤 button) for hands-free scoring

### Viewers (at home)
Share link: `https://your-app.vercel.app/viewer.html?game=GAMEID`
- The game ID appears in the scorer UI after creating a game
- Real-time score updates via Supabase
- Supports YouTube Live, HLS streams, or any stream URL

### Streaming (YouTube Live)
1. Install **Larix Broadcaster** on your phone (free, iOS/Android)
2. Go to YouTube Studio → Go Live → copy stream key
3. In Larix: add connection → `rtmp://a.rtmp.youtube.com/live2` + stream key
4. Start streaming
5. In scorer UI: paste the YouTube watch URL as the stream URL

---

## Cost estimate
- Supabase: Free
- Vercel hosting: Free
- Claude Haiku: ~$0.03/game
- YouTube Live: Free
- **Total: ~$0.03/game**
