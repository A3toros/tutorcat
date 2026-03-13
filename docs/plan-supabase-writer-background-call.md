# Plan: Supabase writer function called by the background (fire-and-forget)

## Goal

- Add **one new Netlify function** that **writes to Supabase** (e.g. speech analytics, delivery/read-vs-speak results, or events). The Supabase **Storage bucket** used for this is named **`tutorcat`**.
- The **background function** (`run-speech-analysis-background`) **calls this new function without waiting** for completion (fire-and-forget). That keeps the background function fast and avoids blocking on Supabase writes.

---

## 1. Flow

1. **Background function** (`run-speech-analysis-background`) runs as today: loads job, runs feedback analysis, updates **Neon** (`speech_jobs`).
2. After it has finished its own work (and optionally when it has a result or delivery payload), it **triggers the new function** by sending a single **POST** request to the new function’s URL.
3. It **does not await** the response: fire the request and return. Optionally use `fetch(url, { method: 'POST', body: JSON.stringify(payload) }).catch(() => {})` or a similar pattern so the background handler does not wait.
4. The **new function** receives the payload (e.g. `jobId`, `result_summary`, `delivery`), and **writes to Supabase** (Storage bucket **`tutorcat`** and/or a table). It runs independently; if it fails, the main flow (Neon, client polling) is unchanged.

---

## 2. New function: what it does

- **Name (example)**: `write-speech-to-supabase` (or `speech-event-to-supabase`).
- **Trigger**: POST with body e.g. `{ jobId, status, result_json?, delivery?, ... }`.
- **Behaviour**: Validate body; use Supabase client to write to the **Storage bucket `tutorcat`** (e.g. upload object `{jobId}.json` with the payload) and/or insert into a Supabase table. Return 200/202. No need for the caller to read the response.
- **Auth (optional)**: If the function is public, consider an **internal secret** header (e.g. `x-internal-secret: process.env.INTERNAL_API_SECRET`) so only our backend can call it; the background function would set that header when calling.

---

## 3. How the background function calls it (no wait)

- **Base URL**: Use `process.env.URL` or `process.env.DEPLOY_PRIME_URL` (Netlify provides these) to build the function URL, e.g. `https://${domain}/.netlify/functions/write-speech-to-supabase`.
- **Fire-and-forget**: Do not `await` the `fetch`. Example:

```ts
// Inside run-speech-analysis-background, after updating Neon (e.g. on success or always):
const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
if (baseUrl) {
  const writerUrl = `${baseUrl}/.netlify/functions/write-speech-to-supabase`;
  fetch(writerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET || '' },
    body: JSON.stringify({ jobId, status: 'completed', result_json: feedback, delivery: feedback?.delivery }),
  }).catch(() => {}); // do not await; ignore errors
}
```

- The background function returns without waiting for the Supabase writer to finish.

---

## 4. Environment variables

### 4.1 New function: `write-speech-to-supabase` (writes to Supabase)

**Env names:** use **SUPABASE_PUBLISHABLE_KEY** (publishable key) and **SUPABASE_SECRET_KEY** (secret key). These are the current Supabase API key names; the old `anon` and `service_role` JWT-based keys are legacy.

| Env name | Description | Required |
|----------|-------------|----------|
| **SUPABASE_URL** | Supabase project URL (e.g. `https://xxxx.supabase.co`). From Supabase: Project Settings → API → Project URL. | Yes |
| **SUPABASE_PUBLISHABLE_KEY** | **Publishable key** (`sb_publishable_...`). Safe for client-side; for server-only writer we can use service role instead. From Supabase: Project Settings → API Keys → Publishable key. (Legacy: anon.) | Optional for server writer |
| **SUPABASE_SECRET_KEY** | **Secret key** (`sb_secret_...`); backend only, bypasses RLS. Use for server-side writes. From Supabase: Project Settings → API Keys → Secret key. (Legacy: service_role.) | Yes (for server writer) |
| **SUPABASE_DATABASE_URL** | Direct Postgres connection string (if the writer uses SQL instead of Supabase JS client). From Supabase: Project Settings → Database → Connection string (URI). Use “Transaction” or “Session” mode if needed. | Optional (only if writer uses raw SQL to Supabase Postgres) |

- Supabase now recommends **publishable key** and **secret key**; `anon` and `service_role` are legacy ([docs](https://supabase.com/docs/guides/api/api-keys)). For bucket uploads, **SUPABASE_URL** + **SUPABASE_SECRET_KEY** are enough.

### 4.2 Background function: calling the new function

| Env name | Description | Required |
|----------|-------------|----------|
| **URL** or **DEPLOY_PRIME_URL** | Site URL so the background function can build `https://<domain>/.netlify/functions/write-speech-to-supabase`. Set by Netlify; for local dev, set in `.env` (e.g. `http://localhost:8888`). | Yes (to trigger writer) |
| **INTERNAL_API_SECRET** | Optional shared secret; background function sends it in a header (e.g. `x-internal-secret`); writer function checks it so only our backend can call it. | Optional but recommended |

### 4.3 Summary

- **Writer function**: `SUPABASE_URL`, **SUPABASE_SECRET_KEY** (secret key; backend only); optionally `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_DATABASE_URL`, `INTERNAL_API_SECRET` (for verifying the caller).
- **Background function**: Already has `NEON_DATABASE_URL`, `OPENAI_API_KEY`; add use of `URL`/`DEPLOY_PRIME_URL` and optionally `INTERNAL_API_SECRET` for the fire-and-forget call.
- Use only **SUPABASE_PUBLISHABLE_KEY** and **SUPABASE_SECRET_KEY**; do not use legacy env names (`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY`).

---

## 5. Supabase Storage bucket and optional table

- **Storage bucket name: `tutorcat`**  
  Create a bucket named **`tutorcat`** in Supabase (Dashboard → Storage → New bucket). The writer function uploads each payload as an object, e.g. `{jobId}.json` or `events/{jobId}.json`, so we have a durable log without a table. Use **SUPABASE_SECRET_KEY** (secret key) so the function can upload.

- **Optional table** (e.g. `speech_events` or `speech_analytics`): columns such as `id`, `job_id` (UUID), `status`, `result_json` (JSONB), `delivery` (JSONB), `created_at`, optionally `user_id`, `lesson_id`. Create in Supabase if we want structured querying in addition to or instead of bucket objects. The writer can do both: upload to bucket **`tutorcat`** and insert into the table.

---

## 6. Implementation steps

| Step | Task |
|------|------|
| 1 | In Supabase Dashboard → Storage, create a bucket named **`tutorcat`**. Optionally create a table (e.g. `speech_events`) for structured querying. |
| 2 | Add new function `functions/write-speech-to-supabase.ts`: POST handler; read body; validate; init Supabase client with `SUPABASE_URL` + `SUPABASE_SECRET_KEY`; upload payload to bucket **`tutorcat`** (e.g. path `{jobId}.json`); optionally insert row into table; return 200/202. Optionally check `x-internal-secret` === `INTERNAL_API_SECRET`. |
| 3 | In `run-speech-analysis-background.ts`: after updating Neon, build writer URL from `URL`/`DEPLOY_PRIME_URL`; fire POST to `write-speech-to-supabase` with payload (jobId, status, result_json, delivery); do not await. |
| 4 | Set env vars in Netlify (and in `.env` for local): `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (secret key from Supabase API Keys); optionally `SUPABASE_PUBLISHABLE_KEY`, `INTERNAL_API_SECRET`; ensure `URL`/`DEPLOY_PRIME_URL` is available (Netlify sets these by default). |

---

## 7. Files to add/touch

- **New**: `functions/write-speech-to-supabase.ts` – POST handler, Supabase client upload to bucket **`tutorcat`** (and optional table insert), optional secret check.
- **Edit**: `functions/run-speech-analysis-background.ts` – fire-and-forget `fetch` to the new function after Neon update.
- **Supabase**: Create Storage bucket **`tutorcat`** (Dashboard → Storage). Optionally create table via SQL or migration.
- **Env**: Document and set `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (secret key); optionally `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_DATABASE_URL`, `INTERNAL_API_SECRET`.

---

## 8. References

- [Netlify background functions](https://docs.netlify.com/build/functions/background-functions/)
- [Supabase API keys](https://supabase.com/docs/guides/api/api-keys) – use **publishable key** (client) and **secret key** (backend); legacy `anon`/`service_role` keys are being phased out.
- [Supabase JS client](https://supabase.com/docs/reference/javascript/introduction) – use with `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
- [Supabase Storage](https://supabase.com/docs/guides/storage) – create bucket **`tutorcat`**; upload with `supabase.storage.from('tutorcat').upload(path, body)`.
- Supabase dashboard: Project Settings → API Keys (Publishable key, Secret key); Storage (bucket `tutorcat`); Database (connection string if needed).
