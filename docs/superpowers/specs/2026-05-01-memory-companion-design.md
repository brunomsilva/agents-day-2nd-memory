# Memory Companion — Design Spec

**Date:** 2026-05-01
**Status:** Approved
**Hackathon:** 6 hours, solo, TypeScript

---

## Overview

A Cloudflare Agents-powered AI companion for people experiencing early memory decline, mild cognitive impairment, or general forgetfulness. The system supports memory, reduces anxiety, reinforces identity, and helps users stay oriented in daily life.

The companion is proactive, not just reactive. It reaches out with grounding information, medication reminders, and gentle check-ins — without waiting for the user to ask.

**Hackathon interface:** Local React UI (Cloudflare Agents starter)
**Production interface:** Telegram (added as a transport adapter post-hackathon)

---

## Architecture

```
React UI (useAgentChat) ──────────────────────────────────┐
                                                           ▼
Telegram webhook (production) ──▶ Worker (routeAgentRequest)
                                                           │
                              ┌────────────────────────────┤
                              ▼                            ▼
                   CompanionAgent (AIChatAgent)    CaregiverAgent (Agent)
                   one per patient user             one per caregiver (Phase C)
                   ├─ this.sql (SQLite)             ├─ linkedUserId
                   ├─ this.setState({ role })       └─ calls @callable() on CompanionAgent
                   └─ this.schedule()
                              │
               On message: Promise.all([
                 generateResponse(),       ── Workers AI
                 extractAndStoreMemory()   ── Workers AI (parallel)
               ])
```

**Two Durable Object classes:**
- `CompanionAgent extends AIChatAgent` — one per user. Owns all memory, handles all messages, runs scheduled proactive interactions.
- `CaregiverAgent extends Agent` — one per caregiver (Phase C). Holds `linkedUserId`, calls `@callable()` methods on the patient's `CompanionAgent` to read/write memory.

**Transport adapters are separate from agent logic.** The React UI uses `useAgentChat`. Telegram uses an `onRequest()` handler that parses Telegram updates and calls the same agent methods. The `CompanionAgent` is unaware of which transport is in use.

**Workers AI** (`@cf/meta/llama-3.1-8b-instruct`) — no external API key, runs on Cloudflare infrastructure.

---

## Memory Model

### SQLite Schema

```sql
-- Single row, user identity
CREATE TABLE profile (
  name      TEXT,
  age       INTEGER,
  city      TEXT,
  timezone  TEXT DEFAULT 'UTC',
  notes     TEXT,
  setup_complete INTEGER DEFAULT 0
);

-- Important people in the user's life
CREATE TABLE people (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  relationship     TEXT,          -- "daughter", "doctor", "neighbour"
  notes            TEXT,          -- "calls every Sunday", "lives in Porto"
  phone            TEXT,
  last_mentioned_at TEXT
);

-- Timestamped log of what happened
CREATE TABLE events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_on TEXT NOT NULL,       -- "2026-05-01"
  description TEXT NOT NULL,
  type        TEXT DEFAULT 'event', -- 'event' | 'mood' | 'help_request' | 'system'
  source      TEXT DEFAULT 'user'   -- 'user' | 'caregiver' | 'system'
);

-- Recurring schedule items
CREATE TABLE routines (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  type           TEXT DEFAULT 'routine', -- 'routine' | 'appointment' | 'task'
  scheduled_time TEXT,                   -- "09:30"
  days           TEXT,                   -- "daily" | "mon,wed,fri" | "2026-05-03"
  description    TEXT,
  active         INTEGER DEFAULT 1
);

-- Medications
CREATE TABLE medications (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,   -- "Aricept"
  dosage          TEXT,            -- "5mg, 1 tablet"
  scheduled_times TEXT,            -- "08:00,20:00" comma-separated
  instructions    TEXT,            -- "take with food"
  prescriber      TEXT,            -- "Dr. Silva"
  active          INTEGER DEFAULT 1
);

-- Per-dose acknowledgment tracking
CREATE TABLE medication_logs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  medication_id  INTEGER NOT NULL,
  scheduled_for  TEXT NOT NULL,    -- ISO datetime
  status         TEXT DEFAULT 'pending', -- 'taken' | 'skipped' | 'pending' | 'no_response'
  responded_at   TEXT,
  source         TEXT DEFAULT 'user'  -- 'user' | 'caregiver'
);

-- Caregiver link seam (Phase C — table exists from day one)
CREATE TABLE caregiver_links (
  caregiver_telegram_id TEXT NOT NULL,
  access_level          TEXT DEFAULT 'write'  -- 'read' | 'write'
);
```

### What AIChatAgent Handles
Conversation history is persisted automatically in `this.messages`. No custom table needed.

### Memory Extraction (Parallel)
On every user message, a second Workers AI call runs concurrently with the chat response. It receives the raw message and a set of write-only tools (`addPerson`, `addEvent`, `updateProfile`, `addRoutine`, `addMedication`). If nothing is worth storing, it calls no tools. No side effects, no noise.

---

## Anti-Hallucination Architecture

**Core principle:** the system prompt contains no facts about the user. Facts are only accessible via tool calls that read from SQLite. If the database has no record, the model has no answer.

### System Prompt

```
You are a gentle, warm memory companion. Your name is Mia.

CRITICAL RULES — these override everything:
1. You have NO knowledge of this person beyond what tools return.
2. Never state a fact unless a tool explicitly returned it in this conversation.
3. If a tool returns no result, say: "I don't have that in my memory yet."
   Never guess, infer, or fill gaps with plausible-sounding information.
4. Never state a person's phone, address, or medication dose unless a tool
   returned it moments ago in this conversation.
5. Never invent events, visits, or conversations.
6. When uncertain say: "I'm not sure — your family can help me add that."
7. Never say "I think" or "probably" about factual matters.
8. Keep responses short, calm, and warm. Never clinical.
9. Answer repeated questions without acknowledging the repetition.

Today is {date}. The user's name is {name}. They are in {city}.
```

Only date, name, and city are in the prompt — the minimum needed to ground every interaction. All other facts require a tool call.

### Fact Retrieval Tools

```typescript
lookupPerson(name)       // SELECT from people WHERE name LIKE
getRecentEvents(days)    // SELECT from events WHERE occurred_on >= date('now', '-N days')
getTodaySchedule()       // routines + medications + today's events
getMedications()         // medications JOIN medication_logs for today's status
```

Each tool returns `{ found: false, message: "..." }` when the database has no record. The model uses that message verbatim rather than filling the gap.

### Fact Attribution Language

| Avoid | Use instead |
|---|---|
| "Maria is your daughter" | "I have Maria listed as your daughter" |
| "You had a doctor's appointment yesterday" | "I have a record of a doctor's appointment yesterday" |
| "Your Aricept is 5mg" | "I have your Aricept recorded as 5mg — Dr. Silva prescribed it" |
| "I think João visited last week" | "I don't have a visit from João in my records for last week" |

---

## Proactive Scheduling

Schedules are registered in `onStart()` and persist in SQLite across restarts.

```typescript
async onStart() {
  const existing = await this.getSchedules();
  if (existing.length === 0) {
    await this.schedule("0 8 * * *",  "morningBriefing", {});
    await this.schedule("0 19 * * *", "eveningCheckin",  {});
  }
}
```

Medication schedules are created dynamically when a medication is added. Each stores its schedule ID in state for cancellation/update.

### Four Scheduled Interactions

| Trigger | Content |
|---|---|
| 8:00am daily | Date, day's schedule, morning medications |
| Per medication time | Dose reminder with acknowledgment buttons |
| +45 min if no response | Gentle follow-up for unanswered medication |
| 7:00pm daily | Evening check-in, log the day |

### Morning Briefing Structure (always the same — predictability is the feature)

```
Good morning, António!

Today is Thursday, 1 May 2026.
You're at home in Lisbon.

📋 Today:
• 08:00 — Aricept (5mg, with breakfast)
• 14:00 — Dr. Costa appointment (Clínica São João)
• Maria usually calls on Thursday evenings

How are you feeling this morning?
[😊 Good]  [😐 Okay]  [😔 Not great]
```

Mood response is stored as an event with `type = 'mood'`.

### Medication Reminder

```
Time for your Aricept (5mg, 1 tablet). 💊
Dr. Silva prescribed this — take it with breakfast.

[✅ I took it]  [⏰ Remind me in 30 min]  [❓ I'm not sure]
```

"I'm not sure" response tells the user where the medication is kept (from `instructions` field), then logs `status = 'pending'` and reschedules a follow-up.

---

## UX Layers

### Hackathon (React UI)
Standard `useAgentChat` interface from the Cloudflare Agents starter. Free text input. Scheduled messages appear in the chat timeline. Buttons rendered as quick-reply chips via the AI SDK's UI message format.

### Production (Telegram)

**Layer 1 — Persistent reply keyboard (always visible):**
```
[📋 What's today?]  [👥 Who's who?]
[💊 My medications]  [🆘 I need help]
```

**Layer 2 — Inline buttons for decisions:**
Used for medication confirmations, mood check-ins, yes/no prompts. User never needs to type for these interactions.

**Layer 3 — Free text and voice:**
Any typed message or voice note routes to the `AIChatAgent`. Voice notes are transcribed via Workers AI Whisper (`@cf/openai/whisper`) before processing — same pipeline as text.

### "What's today?" — grounding card (most important interaction)

```
Today is Thursday, 1 May 2026. It's 10:23am.
You're at home in Lisbon.

This morning: Aricept ✅
This afternoon: Dr. Costa at 2pm
This evening: Maria often calls on Thursdays

Yesterday: João visited for coffee.
```

Short. No questions. No prompts. Just grounding information, sourced entirely from SQL.

### Onboarding (AI-driven, no forms)

```
Agent: Welcome! I'm Mia, your memory companion.
       What's your name?

User:  António

Agent: Nice to meet you, António! What city do you live in?
```

The AI extracts structured data from each answer and writes it to `profile` via tool calls. No parsing logic.

---

## Caregiver Integration (Phase C)

### Phase C Architecture

`CaregiverAgent` is a separate Durable Object with a `linkedUserId`. It gets a stub to the patient's `CompanionAgent` and calls `@callable()` methods to read/write memory. The patient agent has no direct dependency on the caregiver agent — the link is one-directional at the data layer.

### Weekly Summaries

**Automatic:** cron schedule on the `CompanionAgent`, configurable via `setupSummarySchedule(caregiverTelegramId, cron)`. Default: `"0 9 * * 1"` (Monday 9am). Changing frequency = one method call, no redeployment.

**Manual:** caregiver sends `/summary`. `CaregiverAgent` calls `getWeeklySummary()` on the patient stub and receives the same payload immediately.

### Summary Content

Sourced entirely from SQL — no AI inference about facts:
- Medication adherence per drug (took / skipped / no_response counts)
- Mood check-in responses for the week
- Events logged (user and caregiver-sourced)
- Notable help requests

Workers AI formats the raw SQL data into readable prose. It summarizes only what exists in the rows.

### Summary Example

```
📋 Weekly summary for António — 28 Apr to 4 May

💊 Medications
• Aricept (morning): took 6/7 — missed Wednesday
• Aspirin (evening): took 7/7 ✅

😊 Mood
• Mostly Good or Okay — Not great on Tuesday and Wednesday

📅 This week
• Mon: João visited for coffee
• Wed: Doctor appointment with Dr. Costa
• Fri: Maria called in the evening
```

---

## Emotional Layer

**The system prompt handles tone.** No intent classifier needed. Three rules embedded in every prompt:

1. Never acknowledge repetition. Answer every repeated question as if it's the first time.
2. Acknowledge the feeling before the fact. Validate first, then orient.
3. If not in the database, say so — never guess.

### Hard-coded handlers (no AI call, no hallucination risk)

**"I need help" button:**
```typescript
async handleHelpRequest() {
  const [profile] = this.sql`SELECT * FROM profile LIMIT 1`;
  const people    = this.sql`
    SELECT * FROM people
    WHERE relationship IN ('daughter','son','spouse','partner')
    LIMIT 3
  `;
  // Returns fixed template with profile name + people list
  // No model call
}
```

**Distress detection:** keyword-based check (e.g. "I want to die", "I'm in danger", "I can't go on") runs before any AI call. On match: skip the model entirely, send fixed response with emergency contacts, log as `type = 'help_request'`.

---

## Failure Modes

| Risk | Mitigation |
|---|---|
| AI fabricates a person or event | Tool-gated fact retrieval — model has no other source |
| Wrong data entered by caregiver | Agent says "I have X listed as..." not absolute fact |
| Medication reminder ignored | Follow-up after 45 min, then `no_response`. Phase C alerts caregiver after 2 consecutive misses |
| Timezone drift on schedules | Store `timezone` in profile, apply UTC offset when creating crons |
| User asks "who are you?" | Fixed response — never claims to be human |
| Harmful medical advice | Medication info comes only from database fields — dosage, instructions, prescriber |
| Crisis message | Hard-coded response, no model call, emergency contacts surfaced immediately |

---

## MVP Build Order — 6 Hours

| Hour | Build | Safe to cut |
|---|---|---|
| 1 | Scaffold (`npm create cloudflare`), `CompanionAgent` Durable Object, schema init in `onStart()` | — |
| 2 | Onboarding flow (profile → first person → timezone), fact retrieval tools wired to SQLite | Voice onboarding |
| 3 | `AIChatAgent` wired with anti-hallucination prompt + fact retrieval tools, free text working | — |
| 4 | "What's today?" handler, morning briefing cron, evening check-in | Evening check-in |
| 5 | Medications table, scheduled reminder, acknowledgment buttons, `medication_logs` write | Multi-medication (one is enough for demo) |
| 6 | Memory extraction parallel call, demo scenario seed script, caregiver summary stub | Caregiver summary (pitch as Phase C) |

### Non-negotiable for the demo
- Morning briefing fires and reads correctly from SQL
- "What's today?" returns grounding card
- Medication reminder with acknowledgment buttons
- Free text conversation with memory context
- No hallucinated facts under any test input

### Pitch as Phase C
- Telegram transport adapter
- Caregiver linking and weekly summaries
- Voice note transcription
- Multi-caregiver access levels

---

## Differentiation

Generic assistants answer questions. This system:
- Reaches out first — the user doesn't have to remember to ask
- Is grounded in a personal, curated memory model — not general knowledge
- Architecturally cannot hallucinate facts about the user
- Is designed for repetition tolerance, not efficiency
- Gives caregivers passive visibility without surveillance
- Gets richer over time as more facts are added

---

## Key Packages

```bash
npm create cloudflare@latest -- --template cloudflare/agents-starter
npm install agents ai workers-ai-provider zod
```

```jsonc
// wrangler.jsonc additions
{
  "ai": { "binding": "AI" },
  "durable_objects": {
    "bindings": [
      { "name": "CompanionAgent", "class_name": "CompanionAgent" },
      { "name": "CaregiverAgent", "class_name": "CaregiverAgent" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["CompanionAgent", "CaregiverAgent"] }
  ]
}
```
