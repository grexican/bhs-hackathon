# BHS Unified Dashboard — Proof-of-Concept Build Plan

> **Goal:** One student logs into one dashboard, connects all their school sources, and an
> AI ("read" via the Anthropic API) scans everything — emails, Instagram reels, YouTube
> videos + transcripts, Classroom, Calendar, Drive — and surfaces only what *that student*
> cares about. Filters out the noise.

This plan reflects three decisions made up front:
- **Auth model:** Real OAuth, live data (no fakes).
- **AI pipeline:** Server-side, classify/summarize **in batch on ingest**, cache in SQLite.
- **POC scope (day one):** **Google core + AI filter** — Classroom + Calendar + Drive + the
  interests/relevance engine. Gmail, YouTube, Instagram, Buzz are sequenced fast-follows.

---

## 1. Source feasibility (final)

| Source | API | Auth path | Student self-connect? | POC phase |
|---|---|---|---|---|
| Google Classroom | Classroom API (REST) | Google OAuth | ✅ Yes | **Phase 1** |
| Google Calendar (school + personal) | Calendar API | Google OAuth ×2 accounts | ✅ Yes | **Phase 1** |
| Google Drive | Drive API | Google OAuth | ✅ Yes | **Phase 1** |
| Gmail (school) | Gmail API (readonly) | Google OAuth | ⚠️ Yes, but Workspace admin may need to allowlist app | **Phase 3** |
| YouTube | Data API v3 + transcript | API key (public) / OAuth | ✅ Yes | **Phase 4** |
| BHS News Instagram | Graph API **Business Discovery** | Your Meta app + FB Page | ⚠️ Only if @BHSNews is a **Business/Creator** account | **Phase 4** |
| Accelerate Education (**Buzz**) | **xLi / DLAP** command API | Token login; **domain creds from school IT** | ❌ Admin-gated | **Phase 5** |
| Veracross | REST (Auth + Data API) | **Domain creds from school IT** | ❌ Admin-gated | **Phase 5** |
| WhatsApp | Cloud API (broadcast only) | Business number school controls | ❌ Can't read personal/group chats | **Deferred** |

### Accelerate Education = Agilix Buzz (researched)
Accelerate's courses are **hosted on the Agilix Buzz LMS**. Buzz exposes the **xLi / DLAP API**
(command-based, token auth):
- **`Login2`** → returns a session token.
- **`ListEnrollments`** → a user's course enrollments.
- **`GetGradebook` / list assignments** → grades and coursework.
- **`GetCommandToken` / `GetCommandTokenInfo`** → scoped tokens for integrations.
- Live API console at `api.agilixbuzz.com/apiconsole`; docs at `api.agilixbuzz.com/docs/`.
- Also supports **LTI 1.3 / SSO**.

**Verdict:** A real, capable API — but access is **domain-level credentials issued by the BHS
Buzz administrator**. A student cannot self-authorize. This is a "BHS IT grants us a service
account" item, identical in shape to Veracross. Build it in Phase 5 once creds exist; until
then it's blocked on a person, not on technology.

### WhatsApp reality check
The Cloud API only receives messages sent **to a business number you control**, via webhooks.
There is **no API for personal WhatsApp** and reading group chats violates ToS. WhatsApp is
in-scope **only** if BHS runs an official broadcast number. Otherwise: deferred.

---

## 2. Architecture

One Google OAuth grant unlocks five sources (Classroom, Calendar, Drive, Gmail, YouTube). The
server normalizes *every* source into a single `feed_item` shape, runs each new item through
**one Anthropic classification pipeline**, and the dashboard just renders the scored feed.

```
  ┌──────────────────────────────────────────────────────┐
  │  CLIENT  (React + Vite, apps/client)                  │
  │   • "Connect Google" button (OAuth)                   │
  │   • Interests setup (subjects, clubs, mute topics)    │
  │   • Unified feed, ranked by relevance                 │
  └───────────────────────┬──────────────────────────────┘
                          │  {ok,data} JSON
  ┌───────────────────────▼──────────────────────────────┐
  │  SERVER  (Express + better-sqlite3, apps/server)      │
  │                                                       │
  │   /auth/google      OAuth, store refresh tokens       │
  │   /connections      which sources a student linked    │
  │   /interests        student's filter profile          │
  │   /feed             read cached, scored feed items     │
  │   /ingest (cron)    pull sources → classify → store   │
  │                                                       │
  │   fetchers/         classroom.ts calendar.ts drive.ts │
  │                     gmail.ts youtube.ts instagram.ts  │
  │                     buzz.ts                            │
  │   ai/classify.ts    ← Anthropic API (batch, on ingest)│
  └───────────────────────┬──────────────────────────────┘
        ┌─────────┬────────┼────────┬─────────┬───────────┐
   Classroom  Calendar  Drive    Gmail    YouTube     Buzz/VC
   API        API       API      API      Data API    (Phase 5)
```

### The unifier: one SQLite table
Every source collapses into the same row shape (matches the repo's `todos.ts` pattern):

```sql
CREATE TABLE feed_item (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL,        -- hardcode 1 for POC (no auth, per CLAUDE.md)
  source        TEXT NOT NULL,           -- 'classroom' | 'gmail' | 'youtube' | ...
  source_id     TEXT NOT NULL,           -- dedupe key from the source
  title         TEXT NOT NULL,
  body          TEXT,                    -- email text, transcript, caption, description
  url           TEXT,
  occurred_at   TEXT NOT NULL,           -- ISO timestamp
  deadline      TEXT,                    -- nullable; set when AI detects a due date
  -- AI-derived (filled on ingest):
  is_school     INTEGER,                 -- 1/0: school-related?
  category      TEXT,                    -- 'assignment'|'event'|'announcement'|'news'|...
  tags          TEXT,                    -- JSON array of subjects/topics
  summary       TEXT,                    -- one-line AI summary
  relevance     INTEGER,                 -- 0-100 vs the student's interests
  created_at    TEXT NOT NULL,
  UNIQUE(user_id, source, source_id)     -- idempotent ingest
);

CREATE TABLE connection (                 -- one row per linked account
  id INTEGER PRIMARY KEY, user_id INTEGER, source TEXT,
  access_token TEXT, refresh_token TEXT, expires_at TEXT, meta TEXT
);

CREATE TABLE interests (                   -- the student's filter profile
  user_id INTEGER PRIMARY KEY, profile TEXT  -- JSON: {subjects:[], clubs:[], mute:[], free_text:""}
);
```

The dashboard query is then trivial: `SELECT * FROM feed_item WHERE user_id=1 AND
relevance >= ? ORDER BY COALESCE(deadline, occurred_at)`.

---

## 3. The AI "reading" pipeline (the heart of the POC)

**Where it runs:** server-side, in the `/ingest` job, in **batch on arrival**. The Anthropic
key never touches the browser. Results are cached on the row, so loading the feed is a pure DB
read (cheap + fast).

**One classifier, reused by every source.** Each raw item becomes a small prompt; the model
returns structured JSON we store directly:

```ts
// apps/server/src/ai/classify.ts — turns raw source text into structured, scored feed rows.
// Uses Anthropic tool-use / JSON output so the result is machine-readable, not prose.
async function classify(item: RawItem, interests: InterestProfile) {
  // Model: claude-haiku-4-5 for cheap high-volume triage; escalate to sonnet only if needed.
  // Returns: { is_school, category, tags[], summary, relevance, deadline? }
}
```

What "reading" means per source:
- **Email** → feed the subject + body; classifier decides school-related, extracts deadlines,
  summarizes, scores vs interests. (This is the headline feature.)
- **YouTube** → pull video title + description, **fetch the transcript/captions**, summarize the
  transcript, tag it. (Captions: official Data API `captions.download` needs owner permission;
  for public BHS videos use a transcript service / `youtube-transcript-api`-style fetch. Note
  these rely on undocumented internals and can break — wrap in try/catch and degrade to
  description-only.)
- **Instagram reels/posts** → caption + media metadata via Business Discovery; summarize caption,
  classify as news/event. (Reel *video* content isn't transcribed by the API — we work from the
  caption and any text.)
- **Classroom / Calendar / Drive** → already structured; the AI mainly scores **relevance** and
  normalizes into the feed, rather than extracting from prose.

**Cost control (CLAUDE.md budget rule):**
- Default to **Haiku** for triage; it's plenty for "is this school-related + score 0–100."
- **Dedupe before calling** the API (the `UNIQUE` constraint + a "have we classified this
  source_id?" check) so we never re-pay for the same item.
- Batch multiple items per request where possible.
- Cap transcript length sent to the model (e.g. first ~4k chars + we summarize).

---

## 4. Phased build

### Phase 0 — Scaffolding + the one thing that proves the concept (Day 1 morning)
- Add the three tables above to the server (follow the existing migration/`db` pattern).
- `POST /interests` + a simple client form (subjects, clubs, free-text "what I care about",
  mute list).
- Stub `/feed` reading from `feed_item`.
- **Seed one source end-to-end with the AI** so the pipeline is real from hour one. (Calendar is
  the easiest first fetcher.)

### Phase 1 — Google core (Day 1) ✅ the demo-able MVP
- `GET /auth/google` → OAuth consent → store refresh token in `connection`.
  Scopes: `classroom.announcements.readonly`, `classroom.coursework.me.readonly`,
  `calendar.readonly`, `drive.metadata.readonly` (+ `drive.readonly` if reading file text).
- Fetchers: `classroom.ts`, `calendar.ts`, `drive.ts` → normalize → `classify()` → upsert.
- Client: "Connect Google" button + unified feed ranked by relevance + an interests panel.
- **This is a complete, impressive demo with zero school cooperation.** Ship + commit here.

### Phase 2 — Tune the filter (Day 1 evening)
- Iterate the classifier prompt on real Classroom/Calendar/Drive data.
- Add UI controls: relevance threshold slider, mute a topic, "why am I seeing this?" (show the
  AI's summary + tags).

### Phase 3 — Gmail + AI triage (Day 2 morning) — the wow feature
- Add scope `gmail.readonly`; fetcher `gmail.ts` (list recent → get message → classify).
- **Start the BHS IT conversation now:** Workspace for Education may require **admin
  allowlisting** of the OAuth app before it can read student mail. Build it; expect to request
  approval.

### Phase 4 — Public feeds (Day 2)
- **YouTube:** `youtube.ts` — channel uploads via Data API (API key), fetch transcript, classify.
- **Instagram:** **first confirm @BHSNews is a Business/Creator account.** If yes: create a Meta
  app + connect a Facebook Page, use **Business Discovery** (`business_discovery.media`) to read
  recent posts by username; classify captions. If it's a personal account, this path is closed.

### Phase 5 — System of record (post-event / when creds land)
- **Buzz (Accelerate):** `buzz.ts` — `Login2` with school-issued domain creds → `ListEnrollments`,
  `GetGradebook`, assignments → normalize as `category:'assignment'` with real deadlines.
- **Veracross:** Auth API → Data API for schedule/grades/attendance.
- Both blocked on **BHS IT issuing credentials** — not on us.

### Deferred — WhatsApp
Only if BHS commits to an official broadcast number. Otherwise out.

---

## 5. Secrets & config (per CLAUDE.md: `.env`, gitignored)
```
ANTHROPIC_API_KEY=        # the "reading" brain
GOOGLE_CLIENT_ID=         # Classroom/Calendar/Drive/Gmail/YouTube OAuth
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
YOUTUBE_API_KEY=          # public read (optional; OAuth also works)
META_APP_ID=              # Instagram Business Discovery (Phase 4)
META_APP_SECRET=
BUZZ_DOMAIN= BUZZ_USER= BUZZ_PASSWORD=    # Phase 5, from BHS IT
VERACROSS_CLIENT_ID= VERACROSS_CLIENT_SECRET=  # Phase 5, from BHS IT
```
Read them via `process.env.*` in `apps/server/src/`. Never commit `.env`.

---

## 6. Open items needing a human (not code)
1. **Confirm @BHSNews Instagram is Business/Creator** (binary: easy vs blocked).
2. **BHS IT: Workspace OAuth allowlisting** for Gmail reading (Phase 3 gate).
3. **BHS IT: Buzz domain API credentials** + **Veracross API credentials** (Phase 5 gate).
4. **WhatsApp:** is there (or will there be) an official broadcast number? If no → stays deferred.

---

## 7. What's feasible vs not — one-liner

- **Feasible now, no permission needed:** Classroom, Calendar (school + personal), Drive,
  YouTube, the whole AI filter. → **This is your POC.**
- **Feasible but needs a permission/approval:** Gmail (Workspace allowlist), Instagram (account
  must be Business), Buzz + Veracross (school-issued API creds).
- **Not feasible as imagined:** reading personal/group **WhatsApp** — broadcast-only or nothing.

**Sources:** [Agilix Buzz xLi/DLAP API docs](https://api.agilixbuzz.com/docs/), [Buzz API console](https://api.agilixbuzz.com/apiconsole), [Accelerate runs on Buzz (curriculum guide)](https://s3-us-west-2.amazonaws.com/static.accelerate.education/Accelerate+Teacher+Curriculum+Guide_Buzz.pdf), [Veracross API docs](https://api-docs.veracross.com/), [Google Classroom API scopes](https://developers.google.com/workspace/classroom/guides/auth), [YouTube captions API](https://developers.google.com/youtube/v3/docs/captions), [Instagram Business Discovery](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery/), [WhatsApp Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform).
