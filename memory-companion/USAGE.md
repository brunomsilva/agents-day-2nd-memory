# Memory Companion — How to Use

Mia is an AI companion for people with early memory decline. She remembers people,
events, routines, and medications, sends a morning briefing and evening check-in,
and reminds you to take your medications.

This file is the user/operator manual. For architecture and design rationale, see
`docs/superpowers/specs/2026-05-01-memory-companion-design.md`.

## 1. Prerequisites

- Node 20+
- A Cloudflare account (only required for `npm run deploy`; local dev works without one)
- All commands run from the `memory-companion/` directory

```bash
cd memory-companion
npm install
```

## 2. Run it locally

```bash
npm run dev
```

Open http://localhost:5173. The Vite dev server runs the React UI; the Cloudflare
Worker (the Mia agent) runs in the same process via the Cloudflare vite plugin.

State is stored in a local SQLite-backed Durable Object — it persists across
restarts of `npm run dev` but lives in the local `.wrangler/` cache.

## 3. First conversation — onboarding

The first time you connect, Mia walks you through five short steps. Just answer
each prompt in the chat input.

| Step | Mia asks                               | What she stores                                                                     |
| ---- | -------------------------------------- | ----------------------------------------------------------------------------------- |
| 1    | Your name                              | `profile.name`                                                                      |
| 2    | Your city                              | `profile.city`                                                                      |
| 3    | Your timezone                          | `profile.timezone` (accepts "Lisbon", "London", "New York", "LA", or `Region/City`) |
| 4    | One important person                   | a row in `people` (name + relationship)                                             |
| 5    | A regular medication (or "no" to skip) | a row in `medications` with scheduled times                                         |

After step 5, setup is marked complete and medication reminders are scheduled.

> **Skipping onboarding for a demo.** Hit `POST /agents/companion-agent/<id>/seed`
> (see §7) to drop in a demo profile (António in Lisbon, daughter Maria, family
> doctor, one medication, one routine, one recent event) and jump straight to the
> daily-use experience.

## 4. Daily use

### 4a. Free chat

Type anything. Mia replies in short, warm messages. Two things run in parallel
on every message:

- **The reply.** Mia answers, calling retrieval tools (`lookupPerson`,
  `getRecentEvents`, `getTodaySchedule`, `getMedications`) when she needs facts.
- **A silent memory extraction pass.** New people, events, profile updates, and
  medications you mention get saved automatically.

If a fact isn't in her memory, Mia will say _"I don't have that in my memory yet."_
That's by design — she will never guess or invent details. If you want her to
remember something, just tell her.

### 4b. The grounding card — "What's today?"

Ask any of:

- "What's today?"
- "What is today?"
- "Where am I?"
- "What day is it?"

She returns a structured card with the date, your city, today's medications and
their status, today's routines, and your two most recent events. This is the
fastest way to re-orient if you're confused.

### 4c. Morning briefing (08:00 daily)

A notification card appears at the top of the screen with:

- A friendly greeting
- Today's date and your city
- Today's medications (💊) and routines (📋)
- Three mood buttons: **😊 Good · 😐 Okay · 😔 Not great**

Tapping a mood logs an event of type `mood` and clears the card.

### 4d. Evening check-in (19:00 daily)

A short "How was your day? Anything you'd like me to remember?" card. There are
no buttons — just reply in chat and the extraction pass will save anything new.

### 4e. Medication reminders

For each medication time you set, a reminder card appears at that time with
three buttons:

- **✅ I took it** → logged as `taken`
- **⏰ 30 more minutes** → reschedules a fresh reminder in 30 minutes
- **❓ Not sure** → leaves the entry pending

If you don't respond within **45 minutes**, Mia automatically follows up once with
_"I noticed you didn't respond — did you take your `<med>`?"_ and two buttons
(**✅ I took it / ❌ I skipped it**). After that, the entry is marked `no_response`.

### 4f. Help / distress detection

If you type something matching a distress phrase ("I want to die", "I can't go on",
"I'm in danger", etc.), Mia bypasses the AI entirely and replies with a fixed
grounding message that includes your closest family contacts' phone numbers and
local emergency numbers (112 / 911). The event is also logged for caregivers.

This check runs **before** any model call and cannot be disabled by prompt
wording.

## 5. The header controls

| Control         | What it does                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Connection dot  | Green = WebSocket connected, red = disconnected (auto-reconnects)                                                               |
| 🐛 Debug toggle | Shows the raw JSON for each message — useful when debugging tool calls                                                          |
| Theme toggle    | Light/dark mode (persisted in localStorage)                                                                                     |
| MCP             | Add external Model Context Protocol servers as extra tools (advanced)                                                           |
| 🗑 Clear        | Wipes the chat history. **This does not delete stored memories** — profile, people, events, medications, and schedules survive. |

## 6. Voice (Phase C — not yet built)

Voice notes via Telegram and the caregiver-summary panel are pitched but not in
this build. Demo paths today are chat-only.

## 7. Operator / demo endpoints

These are mounted on the agent and are useful for demos and tests. Replace
`<id>` with whatever ID `useAgent` is using (default in the starter is
`default`):

```bash
# Seed a demo profile (António, Lisbon)
curl -X POST http://localhost:5173/agents/companion-agent/<id>/seed

# Trigger the morning briefing immediately (don't wait for 08:00)
curl -X POST http://localhost:5173/agents/companion-agent/<id>/briefing

# Get the formatted weekly summary (caregiver-style)
curl http://localhost:5173/agents/companion-agent/<id>/summary
```

## 8. Common tasks during development

```bash
npm run dev          # Vite dev server (UI + Worker on http://localhost:5173)
npm run check        # oxfmt + oxlint + tsc — run before claiming work is done
npm test             # vitest run
npm run test:watch   # vitest in watch mode
npm run types        # regenerate env.d.ts after editing wrangler.jsonc
npm run deploy       # vite build && wrangler deploy
```

## 9. Where things live

```
src/
  agents/
    companion.ts      # CompanionAgent — onboarding, chat, briefings, meds
    caregiver.ts      # CaregiverAgent stub (Phase C)
  ai/
    prompts.ts        # System prompts (companion / onboarding / extraction)
    retrieval-tools.ts  # lookupPerson, getRecentEvents, getTodaySchedule, getMedications
    extraction-tools.ts # addPerson, addEvent, saveProfile, addMedication
  db/schema.ts        # CREATE TABLE statements (mirrored in onStart)
  handlers/
    grounding.ts      # "What's today?" card
    help.ts           # Distress keyword check + emergency response
  scheduling/
    medications.ts    # parseMedicationTimes, reminder/follow-up text
    summaries.ts      # Weekly caregiver summary
  app.tsx             # React UI (chat + notification cards)
  server.ts           # Worker entry — routes to the agent
  types.ts            # CompanionState, Profile, Person, Notification, ...
```

## 10. Troubleshooting

- **"I don't have that in my memory yet" for things you just told Mia.** The
  extraction pass is fire-and-forget and runs in parallel with the reply. If the
  reply finishes first, the next message will see the new fact. Send a
  follow-up.
- **Schedules didn't fire.** They register inside `onStart()` only if no
  schedules exist. If you change the cron strings in code, run the dev server
  fresh — existing schedules persist.
- **Decorator error on `@callable()`.** Don't enable `experimentalDecorators`
  in `tsconfig.json` — the codebase relies on the standard TC39 decorators
  configured in the starter.
- **A medication has no reminder.** Check that it has a `scheduled_times` value
  ("08:00", "08:00,20:00", etc.) and that `setup_complete = 1` in `profile`.
  Reminders are scheduled in `scheduleMedicationReminders()`, which is called
  from `onStart()` only if setup is complete.
