## Goal

Create a **public (no login)** page at a root URL that is **not linked anywhere in the UI**. The page lists audio recordings stored in **Supabase Storage** with an inline player, paging controls (25/50/100 per page), and two lines of classification buttons per recording.

We must also persist **every button press** (event log) and maintain **live per-recording statistics** shown next to each recording. Additionally, we must store **Whisper JSON logs** in a new DB table; these logs correspond to the same base name as the audio recording, but with a `.json` extension in Supabase Storage.

## Proposed URL / UX

- Route: `/recordings` (App Router page at `src/app/recordings/page.tsx`)
- Not linked from landing or nav.
- UI:
  - Top controls: per-page select (25/50/100), page nav (Prev/Next), search by filename (optional).
  - Each row:
    - Filename + derived base key (filename without extension)
    - Audio player (loads a signed URL on demand)
    - Line 1 buttons (required selection intent):
      - `Reading` / `Speaking` / `Not sure`
      - hint: “Please pick one option.”
    - Line 2 buttons (optional suspicion source):
      - `AI` / `Google translate`
      - hint: “Please choose those options only if you suspect it (optional).”
    - Live counters displayed near the row (reading/speaking/not sure/ai/google_translate)

## Storage assumptions

- Bucket: `tutorcat`
- Audio files are stored as `${baseKey}.{webm|mp4|ogg|m4a|wav|mp3}` (existing code already uses several formats).
- Whisper logs (new requirement) are stored as `${baseKey}.json` in the same bucket/root.
  - We will ingest them into Postgres as JSONB (by baseKey).

## Backend architecture

Use Netlify Functions (already used in this repo) to avoid exposing Supabase service keys to the browser.

### Endpoints (Netlify Functions)

1) `GET /.netlify/functions/public-list-recordings?page=&limit=`
- Lists storage objects filtered to audio extensions.
- Returns `{ items: [{ filename, baseKey }], page, limit, hasMore }`

2) `GET /.netlify/functions/public-get-recording-stats?baseKeys=a,b,c`
- Returns aggregate stats for a page worth of baseKeys.

3) `POST /.netlify/functions/public-track-recording`
- Body: `{ baseKey, group: "mode"|"suspect", choice: string, sessionId?: string }`
- Inserts an immutable event row (audit log) and increments the aggregate stats row (upsert + atomic increment).

4) `POST /.netlify/functions/public-sync-whisper-log`
- Body: `{ baseKey }`
- Downloads `${baseKey}.json` from Supabase Storage (if exists) and upserts into `whisper_logs` table.

## Database schema (new migration)

### 1) `recording_button_events`
- One row per button press.
- Columns:
  - `id uuid pk default gen_random_uuid()`
  - `base_key text not null`
  - `group text not null` (mode|suspect)
  - `choice text not null`
  - `session_id text null`
  - `created_at timestamptz not null default now()`

Indexes:
- `(base_key, created_at desc)`
- `(group, choice, created_at desc)`

### 2) `recording_button_stats`
- One row per base_key, counters updated atomically.
- Columns:
  - `base_key text pk`
  - `reading_count bigint not null default 0`
  - `speaking_count bigint not null default 0`
  - `not_sure_count bigint not null default 0`
  - `ai_count bigint not null default 0`
  - `google_translate_count bigint not null default 0`
  - `updated_at timestamptz not null default now()`

### 3) `whisper_logs`
- Stores ingested Whisper JSON by base_key.
- Columns:
  - `base_key text pk`
  - `storage_filename text not null` (e.g. `${base_key}.json`)
  - `payload jsonb not null`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`

## Security / constraints

- Public page is “link-only” via obscurity (no UI link), **not** real access control.
- Supabase keys remain server-side (functions).
- If you later want real protection, we can add a simple shared secret token in querystring or header.

## Implementation steps

1) Add DB migration SQL under `supabase/migrations/`.
2) Implement Netlify functions: list recordings, track button press + stats, stats fetch, whisper log sync.
3) Implement `src/app/recordings/page.tsx` UI:
   - paging (25/50/100)
   - per-row buttons calling `public-track-recording`
   - fetch stats for the current page and refresh on press
   - player that requests signed URL on demand
4) Smoke test locally with `netlify dev` and verify stats update live.

