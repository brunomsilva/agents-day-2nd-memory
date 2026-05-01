# Memory Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Cloudflare Agents-powered AI memory companion with tool-gated fact retrieval, proactive scheduling, and medication tracking — demoed via React UI.

**Architecture:** One `CompanionAgent` (AIChatAgent) Durable Object per user owns all SQLite memory, handles chat, and runs scheduled proactive messages. A fire-and-forget Workers AI call extracts new facts from each user message in parallel with the response. All facts are accessed via retrieval tools — never from the system prompt — to prevent hallucination.

**Tech Stack:** TypeScript, Cloudflare Agents SDK (`agents`), Workers AI (`workers-ai-provider`, `@cf/moonshotai/kimi-k2.6`), Vercel AI SDK (`ai`), Zod, Vitest

---

## File Map

| File | Responsibility |
|---|---|
| `src/server.ts` | Worker entry point, `routeAgentRequest` |
| `src/types.ts` | All shared TypeScript types |
| `src/agents/companion.ts` | `CompanionAgent extends AIChatAgent` — all agent logic |
| `src/agents/caregiver.ts` | `CaregiverAgent extends Agent` — Phase C stub |
| `src/db/schema.ts` | SQL CREATE TABLE strings + `ALL_TABLES` array |
| `src/ai/prompts.ts` | `buildCompanionPrompt()`, `buildOnboardingPrompt()`, `buildExtractionPrompt()` |
| `src/ai/retrieval-tools.ts` | `makeRetrievalTools(agent)` — lookupPerson, getRecentEvents, getTodaySchedule, getMedications |
| `src/ai/extraction-tools.ts` | `makeExtractionTools(agent)` — addPerson, addEvent, saveProfile, addMedication, completeSetup |
| `src/handlers/help.ts` | `distressCheck()`, `buildHelpResponse()` |
| `src/handlers/grounding.ts` | `buildGroundingCard()` |
| `src/scheduling/medications.ts` | `parseMedicationTimes()`, `buildMedicationReminderText()`, `buildMedicationFollowUpText()` |
| `src/scheduling/summaries.ts` | `formatWeeklySummary()` |
| `src/app.tsx` | React UI — add notifications panel and action buttons |
| `tests/handlers/help.test.ts` | Unit tests for distress detection and help response |
| `tests/handlers/grounding.test.ts` | Unit tests for grounding card formatter |
| `tests/ai/prompts.test.ts` | Unit tests for prompt builders |
| `tests/scheduling/summaries.test.ts` | Unit tests for summary formatter |
| `vitest.config.ts` | Vitest config |
| `scripts/seed.ts` | Demo seed SQL generator |

---

## Task 1: Scaffold & Config

**Files:**
- Modify: `wrangler.jsonc`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create project from starter template**

```bash
npm create cloudflare@latest -- memory-companion --template cloudflare/agents-starter
cd memory-companion
```

Expected: project directory created with `src/server.ts`, `src/app.tsx`, `wrangler.jsonc`, `package.json`.

- [ ] **Step 2: Install additional dependencies**

```bash
npm install agents ai workers-ai-provider zod
npm install -D vitest
```

Expected: no errors, `node_modules` updated.

- [ ] **Step 3: Replace `wrangler.jsonc` with the following**

```jsonc
{
  "name": "memory-companion",
  "main": "src/server.ts",
  "compatibility_date": "2026-04-30",
  "compatibility_flags": ["nodejs_compat"],
  "ai": { "binding": "AI" },
  "assets": { "directory": "public" },
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

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Add scripts to `package.json`**

In the `"scripts"` section add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Generate env types**

```bash
npx wrangler types
```

Expected: `worker-configuration.d.ts` generated with `AI`, `CompanionAgent`, `CaregiverAgent` bindings.

- [ ] **Step 7: Verify dev server starts**

```bash
npm run dev
```

Expected: server starts. Open browser — starter chat UI loads.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold project with Cloudflare agents-starter"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

```typescript
export type OnboardingStep = 'name' | 'city' | 'timezone' | 'person' | 'medication' | 'done';

export type CompanionState = {
  setupComplete: boolean;
  onboardingStep: OnboardingStep;
  notifications: Notification[];
  medicationScheduleIds: Record<string, string>;
  summaryScheduleId?: string;
};

export type Notification = {
  id: string;
  type: 'briefing' | 'medication' | 'checkin';
  text: string;
  timestamp: string;
  medicationId?: number;
  actions: NotificationAction[];
};

export type NotificationAction = {
  label: string;
  value: string;
};

export type Profile = {
  name: string;
  age: number | null;
  city: string;
  timezone: string;
  notes: string | null;
  setup_complete: number;
};

export type Person = {
  id: number;
  name: string;
  relationship: string | null;
  notes: string | null;
  phone: string | null;
  last_mentioned_at: string | null;
};

export type Event = {
  id: number;
  occurred_on: string;
  description: string;
  type: 'event' | 'mood' | 'help_request' | 'system';
  source: 'user' | 'caregiver' | 'system';
};

export type Routine = {
  id: number;
  name: string;
  type: 'routine' | 'appointment' | 'task';
  scheduled_time: string | null;
  days: string | null;
  description: string | null;
  active: number;
};

export type Medication = {
  id: number;
  name: string;
  dosage: string | null;
  scheduled_times: string;
  instructions: string | null;
  prescriber: string | null;
  active: number;
};

export type MedicationLog = {
  id: number;
  medication_id: number;
  scheduled_for: string;
  status: 'taken' | 'skipped' | 'pending' | 'no_response';
  responded_at: string | null;
  source: 'user' | 'caregiver';
};

export type WeeklySummaryPayload = {
  profileName: string;
  weekStart: string;
  weekEnd: string;
  medicationAdherence: MedicationAdherence[];
  moods: string[];
  events: Event[];
  helpRequests: number;
};

export type MedicationAdherence = {
  name: string;
  taken: number;
  skipped: number;
  no_response: number;
  total: number;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared TypeScript types"
```

---

## Task 3: Database Schema

**Files:**
- Create: `src/db/schema.ts`

- [ ] **Step 1: Create `src/db/schema.ts`**

```typescript
export const CREATE_PROFILE = `
  CREATE TABLE IF NOT EXISTS profile (
    name           TEXT,
    age            INTEGER,
    city           TEXT,
    timezone       TEXT DEFAULT 'UTC',
    notes          TEXT,
    setup_complete INTEGER DEFAULT 0
  )
`;

export const CREATE_PEOPLE = `
  CREATE TABLE IF NOT EXISTS people (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL,
    relationship      TEXT,
    notes             TEXT,
    phone             TEXT,
    last_mentioned_at TEXT
  )
`;

export const CREATE_EVENTS = `
  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    occurred_on TEXT NOT NULL,
    description TEXT NOT NULL,
    type        TEXT DEFAULT 'event',
    source      TEXT DEFAULT 'user'
  )
`;

export const CREATE_ROUTINES = `
  CREATE TABLE IF NOT EXISTS routines (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    type           TEXT DEFAULT 'routine',
    scheduled_time TEXT,
    days           TEXT,
    description    TEXT,
    active         INTEGER DEFAULT 1
  )
`;

export const CREATE_MEDICATIONS = `
  CREATE TABLE IF NOT EXISTS medications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    dosage          TEXT,
    scheduled_times TEXT NOT NULL,
    instructions    TEXT,
    prescriber      TEXT,
    active          INTEGER DEFAULT 1
  )
`;

export const CREATE_MEDICATION_LOGS = `
  CREATE TABLE IF NOT EXISTS medication_logs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    medication_id  INTEGER NOT NULL,
    scheduled_for  TEXT NOT NULL,
    status         TEXT DEFAULT 'pending',
    responded_at   TEXT,
    source         TEXT DEFAULT 'user'
  )
`;

export const CREATE_CAREGIVER_LINKS = `
  CREATE TABLE IF NOT EXISTS caregiver_links (
    caregiver_telegram_id TEXT NOT NULL,
    access_level          TEXT DEFAULT 'write'
  )
`;

export const ALL_TABLES = [
  CREATE_PROFILE,
  CREATE_PEOPLE,
  CREATE_EVENTS,
  CREATE_ROUTINES,
  CREATE_MEDICATIONS,
  CREATE_MEDICATION_LOGS,
  CREATE_CAREGIVER_LINKS,
];
```

- [ ] **Step 2: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat: add database schema definitions"
```

---

## Task 4: Distress Detection (TDD)

**Files:**
- Create: `tests/handlers/help.test.ts`
- Create: `src/handlers/help.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/handlers/help.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { distressCheck, buildHelpResponse } from '../../src/handlers/help';

describe('distressCheck', () => {
  it('returns true for "I want to die"', () => {
    expect(distressCheck('I want to die')).toBe(true);
  });

  it('returns true for "I can\'t go on"', () => {
    expect(distressCheck("I can't go on")).toBe(true);
  });

  it('returns true for "I\'m in danger"', () => {
    expect(distressCheck("I'm in danger")).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(distressCheck('I WANT TO DIE')).toBe(true);
  });

  it('returns false for normal messages', () => {
    expect(distressCheck('What day is it today?')).toBe(false);
    expect(distressCheck('Who is Maria?')).toBe(false);
    expect(distressCheck('I need help finding my keys')).toBe(false);
  });

  it('returns true for "I can\'t do this anymore"', () => {
    expect(distressCheck("I can't do this anymore")).toBe(true);
  });
});

describe('buildHelpResponse', () => {
  it('includes the user name', () => {
    const result = buildHelpResponse('António', []);
    expect(result).toContain('António');
  });

  it('includes contact name and phone when provided', () => {
    const result = buildHelpResponse('António', [
      { id: 1, name: 'Maria', relationship: 'daughter', phone: '+351912345678', notes: null, last_mentioned_at: null },
    ]);
    expect(result).toContain('Maria');
    expect(result).toContain('+351912345678');
  });

  it('shows contact without phone when phone is null', () => {
    const result = buildHelpResponse('António', [
      { id: 1, name: 'Maria', relationship: 'daughter', phone: null, notes: null, last_mentioned_at: null },
    ]);
    expect(result).not.toContain('null');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../../src/handlers/help'`

- [ ] **Step 3: Implement `src/handlers/help.ts`**

```typescript
import type { Person } from '../types';

const DISTRESS_KEYWORDS = [
  "i want to die",
  "i can't go on",
  "i can't do this anymore",
  "i'm in danger",
  "i am in danger",
  "i want to hurt myself",
  "i want to end it",
  "i feel like dying",
];

export function distressCheck(message: string): boolean {
  const lower = message.toLowerCase();
  return DISTRESS_KEYWORDS.some(kw => lower.includes(kw));
}

export function buildHelpResponse(userName: string, contacts: Person[]): string {
  const lines = [
    `I'm here, ${userName}. You're safe.`,
    '',
    "Take a deep breath. You're not alone.",
  ];

  const withPhones = contacts.filter(p => p.phone);
  if (withPhones.length > 0) {
    lines.push('', 'People you can call right now:');
    for (const p of withPhones) {
      lines.push(`• ${p.name} (${p.relationship ?? 'contact'}): ${p.phone}`);
    }
  }

  lines.push(
    '',
    'If this is an emergency, please call your local emergency services (112 in Portugal, 911 in the US).',
  );

  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test
```

Expected: all 6 tests in `tests/handlers/help.test.ts` PASS.

- [ ] **Step 5: Commit**

```bash
git add src/handlers/help.ts tests/handlers/help.test.ts
git commit -m "feat: add distress detection and help response builder"
```

---

## Task 5: Grounding Card (TDD)

**Files:**
- Create: `tests/handlers/grounding.test.ts`
- Create: `src/handlers/grounding.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/handlers/grounding.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildGroundingCard } from '../../src/handlers/grounding';

describe('buildGroundingCard', () => {
  const base = {
    userName: 'António',
    city: 'Lisbon',
    dateStr: 'Thursday, 1 May 2026',
    timeStr: '10:23am',
    todayEvents: [] as { occurred_on: string; description: string }[],
    todayRoutines: [] as { name: string; scheduled_time: string | null }[],
    todayMedications: [] as { name: string; dosage: string | null; status: string }[],
    recentEvents: [] as { occurred_on: string; description: string }[],
  };

  it('includes name, city, date and time', () => {
    const card = buildGroundingCard(base);
    expect(card).toContain('Lisbon');
    expect(card).toContain('Thursday, 1 May 2026');
    expect(card).toContain('10:23am');
  });

  it('shows taken medication with check mark', () => {
    const card = buildGroundingCard({
      ...base,
      todayMedications: [{ name: 'Aricept', dosage: '5mg', status: 'taken' }],
    });
    expect(card).toContain('Aricept');
    expect(card).toContain('✅');
  });

  it('shows pending medication with pill emoji', () => {
    const card = buildGroundingCard({
      ...base,
      todayMedications: [{ name: 'Aricept', dosage: '5mg', status: 'pending' }],
    });
    expect(card).toContain('💊');
  });

  it('lists a routine with time', () => {
    const card = buildGroundingCard({
      ...base,
      todayRoutines: [{ name: 'Dr. Costa appointment', scheduled_time: '14:00' }],
    });
    expect(card).toContain('Dr. Costa');
    expect(card).toContain('14:00');
  });

  it('lists recent events', () => {
    const card = buildGroundingCard({
      ...base,
      recentEvents: [{ occurred_on: '2026-04-30', description: 'João visited for coffee' }],
    });
    expect(card).toContain('João visited for coffee');
  });

  it('has no undefined or null in output', () => {
    const card = buildGroundingCard(base);
    expect(card).not.toContain('undefined');
    expect(card).not.toContain('null');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../../src/handlers/grounding'`

- [ ] **Step 3: Implement `src/handlers/grounding.ts`**

```typescript
type GroundingMedication = { name: string; dosage: string | null; status: string };
type GroundingRoutine = { name: string; scheduled_time: string | null };
type GroundingEvent = { occurred_on: string; description: string };

export type GroundingCardInput = {
  userName: string;
  city: string;
  dateStr: string;
  timeStr: string;
  todayMedications: GroundingMedication[];
  todayRoutines: GroundingRoutine[];
  todayEvents: GroundingEvent[];
  recentEvents: GroundingEvent[];
};

export function buildGroundingCard(input: GroundingCardInput): string {
  const lines: string[] = [
    `Today is ${input.dateStr}. It's ${input.timeStr}.`,
    `You're at home in ${input.city}.`,
  ];

  if (input.todayMedications.length > 0) {
    lines.push('');
    for (const med of input.todayMedications) {
      const icon = med.status === 'taken' ? '✅' : '💊';
      const dose = med.dosage ? ` (${med.dosage})` : '';
      lines.push(`${icon} ${med.name}${dose}`);
    }
  }

  if (input.todayRoutines.length > 0) {
    lines.push('');
    for (const r of input.todayRoutines) {
      const time = r.scheduled_time ? `${r.scheduled_time} — ` : '';
      lines.push(`📋 ${time}${r.name}`);
    }
  }

  if (input.recentEvents.length > 0) {
    lines.push('', 'Recently:');
    for (const e of input.recentEvents.slice(0, 2)) {
      lines.push(`• ${e.description}`);
    }
  }

  return lines.join('\n').trimEnd();
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test
```

Expected: all 6 tests in `tests/handlers/grounding.test.ts` PASS.

- [ ] **Step 5: Commit**

```bash
git add src/handlers/grounding.ts tests/handlers/grounding.test.ts
git commit -m "feat: add grounding card builder"
```

---

## Task 6: System Prompts (TDD)

**Files:**
- Create: `tests/ai/prompts.test.ts`
- Create: `src/ai/prompts.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/ai/prompts.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildCompanionPrompt, buildOnboardingPrompt, buildExtractionPrompt } from '../../src/ai/prompts';

describe('buildCompanionPrompt', () => {
  it('includes name, city and date', () => {
    const prompt = buildCompanionPrompt('António', 'Lisbon', 'Thursday, 1 May 2026');
    expect(prompt).toContain('António');
    expect(prompt).toContain('Lisbon');
    expect(prompt).toContain('Thursday, 1 May 2026');
  });

  it('includes no-hallucination rules', () => {
    const prompt = buildCompanionPrompt('António', 'Lisbon', 'Thursday, 1 May 2026');
    expect(prompt).toContain('NO knowledge');
    expect(prompt).toContain('tool');
  });

  it('does not contain unfilled placeholders', () => {
    const prompt = buildCompanionPrompt('António', 'Lisbon', 'Thursday, 1 May 2026');
    expect(prompt).not.toContain('{name}');
    expect(prompt).not.toContain('{city}');
    expect(prompt).not.toContain('{date}');
  });
});

describe('buildOnboardingPrompt', () => {
  it('establishes Mia as the assistant name', () => {
    expect(buildOnboardingPrompt()).toContain('Mia');
  });

  it('instructs the model to be warm and brief', () => {
    expect(buildOnboardingPrompt()).toContain('warm');
  });
});

describe('buildExtractionPrompt', () => {
  it('instructs to extract facts', () => {
    expect(buildExtractionPrompt()).toContain('extract');
  });

  it('instructs not to respond with text', () => {
    expect(buildExtractionPrompt()).toContain('tool calls');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../../src/ai/prompts'`

- [ ] **Step 3: Implement `src/ai/prompts.ts`**

```typescript
export function buildCompanionPrompt(name: string, city: string, dateStr: string): string {
  return `You are a gentle, warm memory companion named Mia.

CRITICAL RULES — these override everything:
1. You have NO knowledge of this person beyond what tools return.
2. Never state a fact unless a tool explicitly returned it in this conversation.
3. If a tool returns no result, say: "I don't have that in my memory yet." Never guess or infer.
4. Never state a person's phone, address, or medication dose unless a tool returned it moments ago.
5. Never invent events, visits, or conversations.
6. When uncertain say: "I'm not sure — your family can help me add that."
7. Never say "I think" or "probably" about factual matters.
8. Keep responses short, calm, and warm. Never clinical.
9. Answer repeated questions without acknowledging the repetition.
10. Frame facts as "I have X listed as..." or "I have a record of..." — not as absolute truth.

Today is ${dateStr}. The user's name is ${name}. They are in ${city}.

Use your tools to look up people, recent events, today's schedule, and medications when asked.`;
}

export function buildOnboardingPrompt(): string {
  return `You are Mia, a gentle memory companion helping someone get set up.
Be warm, brief, and reassuring. One short acknowledgment, then the question.`;
}

export function buildExtractionPrompt(): string {
  return `You are a silent memory extraction assistant.

Read the user message and extract any new factual information worth storing using the available tools:
- New people mentioned → addPerson
- Events that happened → addEvent
- Profile updates (city change, new notes) → saveProfile
- New medications or routines → addMedication

If there is nothing new to extract, call no tools.
Do not respond with text — only tool calls.`;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test
```

Expected: all 7 tests in `tests/ai/prompts.test.ts` PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/prompts.ts tests/ai/prompts.test.ts
git commit -m "feat: add system prompt builders"
```

---

## Task 7: Retrieval Tools

**Files:**
- Create: `src/ai/retrieval-tools.ts`

- [ ] **Step 1: Create `src/ai/retrieval-tools.ts`**

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import type { AIChatAgent } from 'agents/ai-chat';
import type { Env } from '../server';

export function makeRetrievalTools(agent: AIChatAgent<Env>) {
  return {
    lookupPerson: tool({
      description: 'Look up a specific person by name. Call when the user asks about someone.',
      parameters: z.object({ name: z.string() }),
      execute: async ({ name }) => {
        const rows = agent.sql<{
          id: number; name: string; relationship: string | null;
          notes: string | null; phone: string | null;
        }>`SELECT id, name, relationship, notes, phone FROM people
           WHERE name LIKE ${'%' + name + '%'} LIMIT 1`;
        if (rows.length === 0) {
          return { found: false, message: `I don't have anyone named "${name}" in my memory.` };
        }
        return { found: true, ...rows[0] };
      },
    }),

    getRecentEvents: tool({
      description: 'Get events logged in recent days. Call when asked what happened recently or on a specific day.',
      parameters: z.object({ days: z.number().default(3) }),
      execute: async ({ days }) => {
        const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0];
        const events = agent.sql<{ occurred_on: string; description: string }>`
          SELECT occurred_on, description FROM events
          WHERE occurred_on >= ${cutoff}
          AND type = 'event'
          ORDER BY occurred_on DESC
          LIMIT 10`;
        if (events.length === 0) {
          return { found: false, message: 'Nothing recorded for this period.' };
        }
        return { found: true, events };
      },
    }),

    getTodaySchedule: tool({
      description: "Get today's routines, appointments, and medications. Call when asked about today's plan.",
      parameters: z.object({}),
      execute: async () => {
        const today = new Date().toISOString().split('T')[0];
        const dayName = new Date().toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();

        const routines = agent.sql<{
          name: string; type: string; scheduled_time: string | null; description: string | null;
        }>`SELECT name, type, scheduled_time, description FROM routines
           WHERE active = 1
           AND (days = 'daily' OR days LIKE ${'%' + dayName + '%'} OR days = ${today})`;

        const meds = agent.sql<{
          name: string; dosage: string | null; scheduled_times: string; instructions: string | null;
        }>`SELECT name, dosage, scheduled_times, instructions FROM medications WHERE active = 1`;

        return { routines, medications: meds };
      },
    }),

    getMedications: tool({
      description: "Get the user's medications and today's status for each.",
      parameters: z.object({}),
      execute: async () => {
        const today = new Date().toISOString().split('T')[0];
        const results = agent.sql<{
          name: string; dosage: string | null; scheduled_times: string;
          instructions: string | null; prescriber: string | null; status: string | null;
        }>`SELECT m.name, m.dosage, m.scheduled_times, m.instructions, m.prescriber, ml.status
           FROM medications m
           LEFT JOIN medication_logs ml
             ON ml.medication_id = m.id AND date(ml.scheduled_for) = ${today}
           WHERE m.active = 1`;
        if (results.length === 0) {
          return { found: false, message: 'No medications recorded.' };
        }
        return { found: true, medications: results };
      },
    }),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ai/retrieval-tools.ts
git commit -m "feat: add fact retrieval tools"
```

---

## Task 8: Extraction Tools

**Files:**
- Create: `src/ai/extraction-tools.ts`

- [ ] **Step 1: Create `src/ai/extraction-tools.ts`**

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import type { AIChatAgent } from 'agents/ai-chat';
import type { CompanionState } from '../types';
import type { Env } from '../server';

export function makeExtractionTools(agent: AIChatAgent<Env, CompanionState>) {
  return {
    addPerson: tool({
      description: 'Store a new person the user mentioned.',
      parameters: z.object({
        name: z.string(),
        relationship: z.string().optional(),
        notes: z.string().optional(),
        phone: z.string().optional(),
      }),
      execute: async ({ name, relationship, notes, phone }) => {
        const existing = agent.sql<{ id: number }>`
          SELECT id FROM people WHERE name = ${name} LIMIT 1`;
        if (existing.length > 0) {
          agent.sql`UPDATE people
                    SET relationship = ${relationship ?? null},
                        notes = ${notes ?? null},
                        phone = ${phone ?? null},
                        last_mentioned_at = datetime('now')
                    WHERE id = ${existing[0].id}`;
        } else {
          agent.sql`INSERT INTO people (name, relationship, notes, phone, last_mentioned_at)
                    VALUES (${name}, ${relationship ?? null}, ${notes ?? null}, ${phone ?? null}, datetime('now'))`;
        }
        return { stored: true };
      },
    }),

    addEvent: tool({
      description: 'Log something that happened.',
      parameters: z.object({
        description: z.string(),
        occurred_on: z.string().describe('ISO date YYYY-MM-DD, default to today if not specified'),
      }),
      execute: async ({ description, occurred_on }) => {
        agent.sql`INSERT INTO events (occurred_on, description, type, source)
                  VALUES (${occurred_on}, ${description}, 'event', 'user')`;
        return { stored: true };
      },
    }),

    saveProfile: tool({
      description: 'Save a profile field: name, city, timezone, age, or notes.',
      parameters: z.object({
        field: z.enum(['name', 'city', 'timezone', 'age', 'notes']),
        value: z.string(),
      }),
      execute: async ({ field, value }) => {
        const existing = agent.sql<{ name: string }>`SELECT name FROM profile LIMIT 1`;
        if (existing.length === 0) {
          agent.sql`INSERT INTO profile (name, city, timezone) VALUES ('', '', 'UTC')`;
        }
        if (field === 'name') agent.sql`UPDATE profile SET name = ${value}`;
        else if (field === 'city') agent.sql`UPDATE profile SET city = ${value}`;
        else if (field === 'timezone') agent.sql`UPDATE profile SET timezone = ${value}`;
        else if (field === 'age') agent.sql`UPDATE profile SET age = ${parseInt(value)}`;
        else if (field === 'notes') agent.sql`UPDATE profile SET notes = ${value}`;
        return { stored: true };
      },
    }),

    addMedication: tool({
      description: 'Store a medication the user takes.',
      parameters: z.object({
        name: z.string(),
        dosage: z.string().optional(),
        scheduled_times: z.string().describe('Comma-separated times e.g. "08:00" or "08:00,20:00"'),
        instructions: z.string().optional(),
        prescriber: z.string().optional(),
      }),
      execute: async ({ name, dosage, scheduled_times, instructions, prescriber }) => {
        agent.sql`INSERT INTO medications (name, dosage, scheduled_times, instructions, prescriber)
                  VALUES (${name}, ${dosage ?? null}, ${scheduled_times}, ${instructions ?? null}, ${prescriber ?? null})`;
        return { stored: true };
      },
    }),

  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ai/extraction-tools.ts
git commit -m "feat: add memory extraction tools"
```

---

## Task 9: CompanionAgent Core

**Files:**
- Create: `src/agents/companion.ts`
- Create: `src/agents/caregiver.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Create `src/agents/caregiver.ts`**

```typescript
import { Agent } from 'agents';
import type { Env } from '../server';

type CaregiverState = { linkedUserId?: string };

export class CaregiverAgent extends Agent<Env, CaregiverState> {
  initialState: CaregiverState = {};
}
```

- [ ] **Step 2: Create `src/agents/companion.ts`**

```typescript
import { AIChatAgent } from 'agents/ai-chat';
import { createWorkersAI } from 'workers-ai-provider';
import { streamText, generateText, convertToModelMessages } from 'ai';
import { ALL_TABLES } from '../db/schema';
import { buildCompanionPrompt, buildOnboardingPrompt, buildExtractionPrompt } from '../ai/prompts';
import { makeRetrievalTools } from '../ai/retrieval-tools';
import { makeExtractionTools } from '../ai/extraction-tools';
import { distressCheck, buildHelpResponse } from '../handlers/help';
import { buildGroundingCard } from '../handlers/grounding';
import { parseMedicationTimes, buildMedicationReminderText, buildMedicationFollowUpText } from '../scheduling/medications';
import { formatWeeklySummary } from '../scheduling/summaries';
import type {
  CompanionState, Profile, Person, Medication, Event,
  WeeklySummaryPayload, MedicationAdherence,
} from '../types';
import type { Env } from '../server';

export class CompanionAgent extends AIChatAgent<Env, CompanionState> {
  initialState: CompanionState = {
    setupComplete: false,
    onboardingStep: 'name',
    notifications: [],
    medicationScheduleIds: {},
  };

  async onStart() {
    for (const ddl of ALL_TABLES) {
      this.sql([ddl] as unknown as TemplateStringsArray);
    }

    const [profile] = this.sql<{ setup_complete: number }>`
      SELECT setup_complete FROM profile LIMIT 1`;
    if (profile?.setup_complete === 1 && !this.state.setupComplete) {
      this.setState({ ...this.state, setupComplete: true });
    }

    const existing = await this.getSchedules();
    if (existing.length === 0) {
      await this.schedule('0 8 * * *', 'morningBriefing', {});
      await this.schedule('0 19 * * *', 'eveningCheckin', {});
    }

    if (profile?.setup_complete === 1) {
      await this.scheduleMedicationReminders();
    }
  }

  async onChatMessage() {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const model = workersai('@cf/moonshotai/kimi-k2.6');

    const lastMessage = this.messages[this.messages.length - 1];
    const userText = typeof lastMessage?.content === 'string' ? lastMessage.content : '';

    if (distressCheck(userText)) {
      const [profile] = this.sql<Profile>`SELECT * FROM profile LIMIT 1`;
      const people = this.sql<Person>`
        SELECT * FROM people
        WHERE relationship IN ('daughter','son','spouse','partner','wife','husband')
        LIMIT 3`;
      this.sql`INSERT INTO events (occurred_on, description, type, source)
               VALUES (date('now'), 'Help request triggered', 'help_request', 'system')`;
      return new Response(
        buildHelpResponse(profile?.name ?? 'friend', people),
        { headers: { 'Content-Type': 'text/plain' } },
      );
    }

    if (!this.state.setupComplete) {
      return this.handleOnboardingMessage(userText, model);
    }

    const isGroundingRequest = /what('s| is) today|where am i|what day/i.test(userText);
    if (isGroundingRequest) {
      const [profile] = this.sql<Profile>`SELECT * FROM profile LIMIT 1`;
      const { meds, routines, recentEvents } = this.buildGroundingData();
      const now = new Date();
      const card = buildGroundingCard({
        userName: profile?.name ?? '',
        city: profile?.city ?? '',
        dateStr: now.toLocaleDateString('en-GB', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        }),
        timeStr: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        todayMedications: meds.map(m => ({
          name: m.name, dosage: m.dosage, status: m.status ?? 'pending',
        })),
        todayRoutines: routines,
        todayEvents: [],
        recentEvents,
      });
      return new Response(card, { headers: { 'Content-Type': 'text/plain' } });
    }

    const [profile] = this.sql<Profile>`SELECT * FROM profile LIMIT 1`;
    const today = new Date().toLocaleDateString('en-GB', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    this.extractAndStoreMemory(userText, model).catch(() => {});

    return streamText({
      model,
      messages: convertToModelMessages(this.messages),
      system: buildCompanionPrompt(profile?.name ?? '', profile?.city ?? '', today),
      tools: makeRetrievalTools(this),
      maxSteps: 3,
    }).toUIMessageStreamResponse();
  }

  private buildGroundingData() {
    const todayDate = new Date().toISOString().split('T')[0];
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();

    const meds = this.sql<{ name: string; dosage: string | null; status: string | null }>`
      SELECT m.name, m.dosage, ml.status
      FROM medications m
      LEFT JOIN medication_logs ml
        ON ml.medication_id = m.id AND date(ml.scheduled_for) = ${todayDate}
      WHERE m.active = 1`;

    const routines = this.sql<{ name: string; scheduled_time: string | null }>`
      SELECT name, scheduled_time FROM routines
      WHERE active = 1
      AND (days = 'daily' OR days LIKE ${'%' + dayName + '%'} OR days = ${todayDate})`;

    const recentEvents = this.sql<{ occurred_on: string; description: string }>`
      SELECT occurred_on, description FROM events
      WHERE type = 'event'
      ORDER BY occurred_on DESC LIMIT 2`;

    return { meds, routines, recentEvents };
  }

  private parseTimezone(input: string): string {
    const lower = input.toLowerCase();
    if (lower.includes('lisbon') || lower.includes('portugal')) return 'Europe/Lisbon';
    if (lower.includes('london') || lower.includes('uk')) return 'Europe/London';
    if (lower.includes('new york') || lower.includes('eastern')) return 'America/New_York';
    if (lower.includes('los angeles') || lower.includes('pacific')) return 'America/Los_Angeles';
    if (input.includes('/')) return input.trim();
    return 'UTC';
  }

  private async handleOnboardingMessage(
    userText: string,
    model: ReturnType<ReturnType<typeof createWorkersAI>>,
  ): Promise<Response> {
    const step = this.state.onboardingStep;
    const sys = buildOnboardingPrompt();

    switch (step) {
      case 'name': {
        if (userText.trim()) {
          const existing = this.sql<{ name: string }>`SELECT name FROM profile LIMIT 1`;
          if (existing.length === 0) {
            this.sql`INSERT INTO profile (name, city, timezone) VALUES ('', '', 'UTC')`;
          }
          this.sql`UPDATE profile SET name = ${userText.trim()}`;
          this.setState({ ...this.state, onboardingStep: 'city' });
          return streamText({
            model,
            prompt: `The user's name is "${userText.trim()}". Acknowledge warmly, then ask what city they live in.`,
            system: sys,
          }).toUIMessageStreamResponse();
        }
        return streamText({
          model,
          prompt: 'Greet the user as Mia and ask for their name.',
          system: sys,
        }).toUIMessageStreamResponse();
      }

      case 'city': {
        this.sql`UPDATE profile SET city = ${userText.trim()}`;
        this.setState({ ...this.state, onboardingStep: 'timezone' });
        return streamText({
          model,
          prompt: `City saved as "${userText.trim()}". Acknowledge, then ask for their timezone. Suggest: Europe/Lisbon, America/New_York, Europe/London, or they can say their city again.`,
          system: sys,
        }).toUIMessageStreamResponse();
      }

      case 'timezone': {
        const tz = this.parseTimezone(userText);
        this.sql`UPDATE profile SET timezone = ${tz}`;
        this.setState({ ...this.state, onboardingStep: 'person' });
        return streamText({
          model,
          prompt: `Timezone set to "${tz}". Acknowledge, then ask about one important person in their life — name and relationship (e.g. daughter, doctor).`,
          system: sys,
        }).toUIMessageStreamResponse();
      }

      case 'person': {
        await generateText({
          model,
          prompt: userText,
          system: buildExtractionPrompt(),
          tools: { addPerson: makeExtractionTools(this).addPerson },
          maxSteps: 2,
        });
        this.setState({ ...this.state, onboardingStep: 'medication' });
        return streamText({
          model,
          prompt: 'Person saved. Acknowledge warmly, then ask if they take any regular medications — name and time of day. They can say "no" to skip.',
          system: sys,
        }).toUIMessageStreamResponse();
      }

      case 'medication': {
        const skipped = /^(no|none|nope|not really|i don't|i do not)/i.test(userText.trim());
        if (!skipped) {
          await generateText({
            model,
            prompt: userText,
            system: buildExtractionPrompt(),
            tools: { addMedication: makeExtractionTools(this).addMedication },
            maxSteps: 2,
          });
        }
        this.sql`UPDATE profile SET setup_complete = 1`;
        this.setState({ ...this.state, setupComplete: true, onboardingStep: 'done' });
        await this.scheduleMedicationReminders();
        return streamText({
          model,
          prompt: "Setup complete. Give a warm one-sentence welcome. Let them know they can type anything or ask 'what's today?' to get oriented.",
          system: sys,
        }).toUIMessageStreamResponse();
      }

      default:
        return new Response('Setup already complete.', { status: 200 });
    }
  }

  private async extractAndStoreMemory(
    text: string,
    model: ReturnType<ReturnType<typeof createWorkersAI>>,
  ) {
    if (!text.trim()) return;
    await generateText({
      model,
      prompt: text,
      system: buildExtractionPrompt(),
      tools: makeExtractionTools(this),
      maxSteps: 3,
    });
  }

  async morningBriefing(_payload: Record<string, never>) {
    const [profile] = this.sql<Profile>`SELECT * FROM profile LIMIT 1`;
    if (!profile?.setup_complete) return;

    const today = new Date();
    const dateStr = today.toLocaleDateString('en-GB', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const dayName = today.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
    const todayDate = today.toISOString().split('T')[0];

    const meds = this.sql<{ name: string; dosage: string | null; instructions: string | null }>`
      SELECT name, dosage, instructions FROM medications WHERE active = 1`;
    const routines = this.sql<{ name: string; scheduled_time: string | null }>`
      SELECT name, scheduled_time FROM routines
      WHERE active = 1
      AND (days = 'daily' OR days LIKE ${'%' + dayName + '%'} OR days = ${todayDate})`;

    const medLines = meds
      .map(m => `💊 ${m.name}${m.dosage ? ` (${m.dosage})` : ''}${m.instructions ? ' — ' + m.instructions : ''}`)
      .join('\n');
    const routineLines = routines
      .map(r => `📋 ${r.scheduled_time ? r.scheduled_time + ' — ' : ''}${r.name}`)
      .join('\n');

    const text = [
      `Good morning, ${profile.name}! 🌅`,
      '',
      `Today is ${dateStr}.`,
      `You're at home in ${profile.city}.`,
      medLines ? '\n' + medLines : '',
      routineLines ? '\n' + routineLines : '',
      '',
      'How are you feeling this morning?',
    ].filter(Boolean).join('\n');

    const notification = {
      id: crypto.randomUUID(),
      type: 'briefing' as const,
      text,
      timestamp: new Date().toISOString(),
      actions: [
        { label: '😊 Good', value: 'good' },
        { label: '😐 Okay', value: 'okay' },
        { label: '😔 Not great', value: 'not_great' },
      ],
    };

    this.setState({ ...this.state, notifications: [...this.state.notifications, notification] });
  }

  async eveningCheckin(_payload: Record<string, never>) {
    const [profile] = this.sql<Profile>`SELECT * FROM profile LIMIT 1`;
    if (!profile?.setup_complete) return;

    const notification = {
      id: crypto.randomUUID(),
      type: 'checkin' as const,
      text: `Good evening, ${profile.name}! How was your day? Is there anything you'd like me to remember?`,
      timestamp: new Date().toISOString(),
      actions: [],
    };

    this.setState({ ...this.state, notifications: [...this.state.notifications, notification] });
  }

  async scheduleMedicationReminders() {
    const meds = this.sql<Medication>`SELECT * FROM medications WHERE active = 1`;
    const ids: Record<string, string> = {};

    for (const med of meds) {
      const times = parseMedicationTimes(med.scheduled_times);
      for (const time of times) {
        const key = `${med.id}:${time}`;
        if (!this.state.medicationScheduleIds[key]) {
          const [hour, minute] = time.split(':');
          const cron = `${minute} ${hour} * * *`;
          const scheduleId = await this.schedule(cron, 'medicationReminder', {
            medicationId: med.id,
            scheduledTime: time,
          });
          ids[key] = scheduleId;
        }
      }
    }

    this.setState({
      ...this.state,
      medicationScheduleIds: { ...this.state.medicationScheduleIds, ...ids },
    });
  }

  async medicationReminder({ medicationId, scheduledTime }: { medicationId: number; scheduledTime: string }) {
    const [med] = this.sql<Medication>`SELECT * FROM medications WHERE id = ${medicationId} LIMIT 1`;
    if (!med) return;

    const scheduledFor = new Date().toISOString();
    this.sql`INSERT INTO medication_logs (medication_id, scheduled_for, status)
             VALUES (${medicationId}, ${scheduledFor}, 'pending')`;
    const [logRow] = this.sql<{ id: number }>`SELECT last_insert_rowid() as id`;

    const notification = {
      id: crypto.randomUUID(),
      type: 'medication' as const,
      text: buildMedicationReminderText(med),
      timestamp: new Date().toISOString(),
      medicationId,
      actions: [
        { label: '✅ I took it', value: 'taken' },
        { label: '⏰ 30 more minutes', value: 'later' },
        { label: '❓ Not sure', value: 'unsure' },
      ],
    };

    this.setState({ ...this.state, notifications: [...this.state.notifications, notification] });

    await this.schedule(
      new Date(Date.now() + 45 * 60 * 1000),
      'medicationFollowUp',
      { medicationId, logId: logRow?.id, notificationId: notification.id },
    );
  }

  async medicationFollowUp({
    medicationId, logId, notificationId,
  }: { medicationId: number; logId: number; notificationId: string }) {
    const [log] = this.sql<{ status: string }>`
      SELECT status FROM medication_logs WHERE id = ${logId} LIMIT 1`;
    if (log?.status !== 'pending') return;

    this.sql`UPDATE medication_logs SET status = 'no_response' WHERE id = ${logId}`;

    const [med] = this.sql<{ name: string }>`
      SELECT name FROM medications WHERE id = ${medicationId} LIMIT 1`;
    if (!med) return;

    const followUp = {
      id: crypto.randomUUID(),
      type: 'medication' as const,
      text: buildMedicationFollowUpText(med.name),
      timestamp: new Date().toISOString(),
      medicationId,
      actions: [
        { label: '✅ I took it', value: 'taken' },
        { label: '❌ I skipped it', value: 'skipped' },
      ],
    };

    this.setState({
      ...this.state,
      notifications: [
        ...this.state.notifications.filter(n => n.id !== notificationId),
        followUp,
      ],
    });
  }

  callable_recordMood = async (mood: string, notificationId: string) => {
    this.sql`INSERT INTO events (occurred_on, description, type, source)
             VALUES (date('now'), ${`Morning mood: ${mood}`}, 'mood', 'system')`;
    this.setState({
      ...this.state,
      notifications: this.state.notifications.filter(n => n.id !== notificationId),
    });
  };

  callable_acknowledgeMedication = async (
    medicationId: number,
    logId: number,
    status: string,
    notificationId: string,
  ) => {
    if (status === 'taken' || status === 'skipped') {
      this.sql`UPDATE medication_logs
               SET status = ${status}, responded_at = datetime('now')
               WHERE medication_id = ${medicationId} AND status = 'pending'`;
    } else if (status === 'later') {
      await this.schedule(
        new Date(Date.now() + 30 * 60 * 1000),
        'medicationReminder',
        { medicationId, scheduledTime: '' },
      );
    }
    this.setState({
      ...this.state,
      notifications: this.state.notifications.filter(n => n.id !== notificationId),
    });
  };

  callable_dismissNotification = async (notificationId: string) => {
    this.setState({
      ...this.state,
      notifications: this.state.notifications.filter(n => n.id !== notificationId),
    });
  };

  callable_getWeeklySummary = async (): Promise<string> => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    const [profile] = this.sql<{ name: string }>`SELECT name FROM profile LIMIT 1`;

    const adherenceRows = this.sql<{ name: string; status: string; count: number }>`
      SELECT m.name, ml.status, COUNT(*) as count
      FROM medication_logs ml
      JOIN medications m ON m.id = ml.medication_id
      WHERE date(ml.scheduled_for) >= ${weekAgo}
      GROUP BY m.name, ml.status`;

    const medMap: Record<string, MedicationAdherence> = {};
    for (const row of adherenceRows) {
      if (!medMap[row.name]) {
        medMap[row.name] = { name: row.name, taken: 0, skipped: 0, no_response: 0, total: 0 };
      }
      const key = row.status as keyof Pick<MedicationAdherence, 'taken' | 'skipped' | 'no_response'>;
      if (key in medMap[row.name]) medMap[row.name][key] += row.count;
      medMap[row.name].total += row.count;
    }

    const moodRows = this.sql<{ description: string }>`
      SELECT description FROM events
      WHERE type = 'mood' AND occurred_on >= ${weekAgo}`;
    const moods = moodRows.map(r => r.description.replace('Morning mood: ', ''));

    const events = this.sql<Event>`
      SELECT * FROM events
      WHERE type = 'event' AND occurred_on >= ${weekAgo}
      ORDER BY occurred_on`;

    const [helpRow] = this.sql<{ count: number }>`
      SELECT COUNT(*) as count FROM events
      WHERE type = 'help_request' AND occurred_on >= ${weekAgo}`;

    const payload: WeeklySummaryPayload = {
      profileName: profile?.name ?? 'User',
      weekStart: weekAgo,
      weekEnd: today,
      medicationAdherence: Object.values(medMap),
      moods,
      events,
      helpRequests: helpRow?.count ?? 0,
    };

    return formatWeeklySummary(payload);
  };

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/seed')) {
      this.sql`INSERT OR IGNORE INTO profile (name, age, city, timezone, notes, setup_complete)
               VALUES ('António', 78, 'Lisbon', 'Europe/Lisbon', 'Retired teacher, loves chess', 1)`;
      this.sql`INSERT OR IGNORE INTO people (name, relationship, notes, phone) VALUES
               ('Maria', 'daughter', 'Lives in Porto, calls every Sunday', '+351912000001')`;
      this.sql`INSERT OR IGNORE INTO people (name, relationship, notes, phone) VALUES
               ('Dr. Costa', 'doctor', 'Family doctor at Clínica São João', '+351213000001')`;
      this.sql`INSERT OR IGNORE INTO medications (name, dosage, scheduled_times, instructions, prescriber) VALUES
               ('Aricept', '5mg, 1 tablet', '08:00', 'take with breakfast', 'Dr. Costa')`;
      this.sql`INSERT OR IGNORE INTO routines (name, type, scheduled_time, days, description) VALUES
               ('Walk in the park', 'routine', '10:00', 'daily', 'Jardim da Estrela')`;
      this.sql`INSERT OR IGNORE INTO events (occurred_on, description, type, source) VALUES
               (date('now', '-1 days'), 'João visited for coffee in the afternoon', 'event', 'user')`;
      this.setState({ ...this.state, setupComplete: true });
      await this.scheduleMedicationReminders();
      return new Response('Seeded', { status: 200 });
    }
    if (url.pathname.endsWith('/briefing')) {
      await this.morningBriefing({} as Record<string, never>);
      return new Response('Briefing triggered', { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  }
}
```

- [ ] **Step 3: Replace `src/server.ts`**

```typescript
import { routeAgentRequest } from 'agents';
import { CompanionAgent } from './agents/companion';
import { CaregiverAgent } from './agents/caregiver';

export { CompanionAgent, CaregiverAgent };

export interface Env {
  AI: Ai;
  CompanionAgent: DurableObjectNamespace;
  CaregiverAgent: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    return (await routeAgentRequest(request, env)) ??
      new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 4: Create `src/scheduling/medications.ts`**

```typescript
import type { Medication } from '../types';

export function parseMedicationTimes(scheduled_times: string): string[] {
  return scheduled_times.split(',').map(t => t.trim()).filter(Boolean);
}

export function buildMedicationReminderText(med: Medication): string {
  const dose = med.dosage ? ` (${med.dosage})` : '';
  const prescriber = med.prescriber ? ` Dr. ${med.prescriber} prescribed this.` : '';
  const instruction = med.instructions ? `\n${med.instructions}.` : '';
  return `Time for your ${med.name}${dose}. 💊${prescriber}${instruction}`;
}

export function buildMedicationFollowUpText(medName: string): string {
  return `Just checking in — did you get a chance to take your ${medName}? No rush, just want to make sure you're okay.`;
}
```

- [ ] **Step 5: Create `src/scheduling/summaries.ts`**

```typescript
import type { WeeklySummaryPayload } from '../types';

export function formatWeeklySummary(payload: WeeklySummaryPayload): string {
  const lines = [
    `📋 Weekly summary for ${payload.profileName}`,
    `${payload.weekStart} to ${payload.weekEnd}`,
    '',
  ];

  if (payload.medicationAdherence.length > 0) {
    lines.push('💊 Medications');
    for (const med of payload.medicationAdherence) {
      const missed = med.no_response > 0 ? ` — missed ${med.no_response} day(s)` : ' ✅';
      lines.push(`• ${med.name}: took ${med.taken}/${med.total}${missed}`);
    }
    lines.push('');
  }

  if (payload.moods.length > 0) {
    const moodCounts = payload.moods.reduce<Record<string, number>>((acc, m) => {
      acc[m] = (acc[m] ?? 0) + 1;
      return acc;
    }, {});
    const moodStr = Object.entries(moodCounts)
      .map(([mood, count]) => `${mood} (${count}x)`)
      .join(', ');
    lines.push('😊 Mood check-ins');
    lines.push(`• ${moodStr}`);
    lines.push('');
  }

  if (payload.events.length > 0) {
    lines.push('📅 This week');
    for (const e of payload.events) {
      lines.push(`• ${e.occurred_on}: ${e.description}`);
    }
    lines.push('');
  }

  if (payload.helpRequests > 0) {
    lines.push(`🆘 Help requests: ${payload.helpRequests}`);
  }

  return lines.join('\n').trimEnd();
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx wrangler types && npm run dev
```

Expected: server starts, no TypeScript errors in the console.

- [ ] **Step 7: Commit**

```bash
git add src/agents/companion.ts src/agents/caregiver.ts src/server.ts \
        src/scheduling/medications.ts src/scheduling/summaries.ts
git commit -m "feat: add CompanionAgent with full scheduling and medication flow"
```

---

## Task 10: Weekly Summary Tests

**Files:**
- Create: `tests/scheduling/summaries.test.ts`

- [ ] **Step 1: Create `tests/scheduling/summaries.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { formatWeeklySummary } from '../../src/scheduling/summaries';
import type { WeeklySummaryPayload } from '../../src/types';

describe('formatWeeklySummary', () => {
  const base: WeeklySummaryPayload = {
    profileName: 'António',
    weekStart: '2026-04-28',
    weekEnd: '2026-05-04',
    medicationAdherence: [],
    moods: [],
    events: [],
    helpRequests: 0,
  };

  it('includes the user name and date range', () => {
    const result = formatWeeklySummary(base);
    expect(result).toContain('António');
    expect(result).toContain('2026-04-28');
    expect(result).toContain('2026-05-04');
  });

  it('shows medication adherence with fraction', () => {
    const result = formatWeeklySummary({
      ...base,
      medicationAdherence: [{ name: 'Aricept', taken: 6, skipped: 0, no_response: 1, total: 7 }],
    });
    expect(result).toContain('Aricept');
    expect(result).toContain('6/7');
  });

  it('shows mood summary', () => {
    const result = formatWeeklySummary({ ...base, moods: ['good', 'good', 'not_great'] });
    expect(result).toContain('good');
    expect(result).toContain('2x');
  });

  it('shows events with date', () => {
    const result = formatWeeklySummary({
      ...base,
      events: [{
        id: 1, occurred_on: '2026-05-01', description: 'João visited',
        type: 'event', source: 'user',
      }],
    });
    expect(result).toContain('João visited');
    expect(result).toContain('2026-05-01');
  });

  it('has no undefined or null in output', () => {
    const result = formatWeeklySummary(base);
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('null');
  });
});
```

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected:
```
✓ tests/handlers/help.test.ts (6 tests)
✓ tests/handlers/grounding.test.ts (6 tests)
✓ tests/ai/prompts.test.ts (7 tests)
✓ tests/scheduling/summaries.test.ts (5 tests)

Test Files  4 passed (4)
Tests       24 passed (24)
```

- [ ] **Step 3: Commit**

```bash
git add tests/scheduling/summaries.test.ts
git commit -m "test: add weekly summary formatter tests"
```

---

## Task 11: React Notifications Panel

**Files:**
- Modify: `src/app.tsx`

- [ ] **Step 1: Read the current `src/app.tsx`**

Before editing, read it to understand the existing structure. Find: where the main chat container is, what imports exist, and whether `useAgent` is already imported.

- [ ] **Step 2: Add `useAgent` import and state wiring**

At the top of `src/app.tsx`, ensure these imports exist (add if missing):

```typescript
import { useAgent, useAgentChat } from 'agents/react';
import type { CompanionState, Notification } from './types';
```

Inside the main component, add agent state access alongside the existing `useAgentChat` hook:

```typescript
const agent = useAgent<CompanionAgent, CompanionState>({
  agent: 'CompanionAgent',
  name: 'default',
});
```

- [ ] **Step 3: Add `NotificationCard` component**

Add this component definition inside `src/app.tsx`, above the main export:

```typescript
function NotificationCard({
  notification,
  agent,
}: {
  notification: Notification;
  agent: ReturnType<typeof useAgent>;
}) {
  return (
    <div style={{
      background: '#f0f7ff',
      border: '1px solid #c0d8f0',
      borderRadius: 12,
      padding: '16px',
      marginBottom: '8px',
    }}>
      <p style={{ margin: '0 0 12px', whiteSpace: 'pre-line', fontSize: 15, lineHeight: 1.5 }}>
        {notification.text}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {notification.actions.map(action => (
          <button
            key={action.value}
            onClick={async () => {
              if (notification.type === 'briefing') {
                await (agent.stub as any).callable_recordMood(action.value, notification.id);
              } else if (notification.type === 'medication') {
                await (agent.stub as any).callable_acknowledgeMedication(
                  notification.medicationId,
                  0,
                  action.value,
                  notification.id,
                );
              } else {
                await (agent.stub as any).callable_dismissNotification(notification.id);
              }
            }}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#2563eb',
              color: 'white',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {action.label}
          </button>
        ))}
        {notification.actions.length === 0 && (
          <button
            onClick={async () => {
              await (agent.stub as any).callable_dismissNotification(notification.id);
            }}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid #ccc',
              background: 'white', cursor: 'pointer', fontSize: 14,
            }}
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add notification panel to the JSX**

In the main component's return, add the panel above the chat input area:

```tsx
{(agent.state?.notifications?.length ?? 0) > 0 && (
  <div style={{ padding: '8px 16px', borderBottom: '1px solid #eee', maxHeight: 300, overflowY: 'auto' }}>
    {agent.state!.notifications.map(n => (
      <NotificationCard key={n.id} notification={n} agent={agent} />
    ))}
  </div>
)}
```

- [ ] **Step 5: Manual test — notifications panel**

```bash
npm run dev
```

In a second terminal:
```bash
curl http://localhost:8787/agents/CompanionAgent/default/seed
curl http://localhost:8787/agents/CompanionAgent/default/briefing
```

Open browser. A morning briefing card should appear with mood buttons. Tap a button — card disappears.

- [ ] **Step 6: Commit**

```bash
git add src/app.tsx
git commit -m "feat: add notifications panel to React UI"
```

---

## Task 12: Golden Path Demo Test

- [ ] **Step 1: Seed and verify onboarding is skipped**

```bash
curl http://localhost:8787/agents/CompanionAgent/default/seed
```

Open `http://localhost:5173` — should show chat UI without onboarding prompt.

- [ ] **Step 2: Test grounding card**

Type: `what's today?`

Expected: structured card with date, city, Aricept medication entry, walk routine. No AI preamble.

- [ ] **Step 3: Test safe fact retrieval**

Type: `Who is Maria?`

Expected: agent calls `lookupPerson`, responds with "I have Maria listed as your daughter — she lives in Porto and calls every Sunday."

- [ ] **Step 4: Test hallucination guard**

Type: `Who is Pedro?`

Expected: "I don't have anyone named Pedro in my memory." No fabricated details.

- [ ] **Step 5: Test recent events**

Type: `What did I do yesterday?`

Expected: agent calls `getRecentEvents`, returns João's coffee visit. No invented events.

- [ ] **Step 6: Trigger and interact with morning briefing**

```bash
curl http://localhost:8787/agents/CompanionAgent/default/briefing
```

Expected: notification card appears in UI. Tap "😊 Good". Card disappears. Verify mood was stored by asking: `How was I feeling this morning?` — agent should call `getRecentEvents` and find the mood log.

- [ ] **Step 7: Test weekly summary**

Open browser console and run:
```javascript
// In browser console via the agent stub — or add a temporary /summary dev endpoint
fetch('/agents/CompanionAgent/default/summary').then(r => r.text()).then(console.log)
```

Add temporary dev endpoint to `onRequest` in `companion.ts`:
```typescript
if (url.pathname.endsWith('/summary')) {
  const summary = await this.callable_getWeeklySummary();
  return new Response(summary, { status: 200 });
}
```

Expected: formatted summary with medication adherence and any logged events.

- [ ] **Step 8: Commit final state**

```bash
git add -A
git commit -m "chore: all tests passing, golden path verified, MVP complete"
```

---

## Self-Review — Spec Coverage

| Spec requirement | Implemented in |
|---|---|
| `CompanionAgent extends AIChatAgent` | Task 9 |
| `CaregiverAgent` stub with Phase C seam | Task 9 |
| All 7 SQLite tables | Task 3 |
| Anti-hallucination: tool-gated fact retrieval | Tasks 7, 9 |
| No facts in system prompt (only name/city/date) | Task 6 |
| Fact attribution language in prompt | Task 6 |
| Onboarding: state machine (deterministic steps, AI for phrasing only) | Task 9 |
| Morning briefing cron | Task 9 |
| Evening check-in cron | Task 9 |
| Grounding card ("what's today?") | Task 9 |
| Medication reminders with inline buttons | Task 9 |
| 45-minute medication follow-up | Task 9 |
| `medication_logs` tracking | Task 9 |
| Distress detection (keyword, no AI call) | Task 4 |
| Hard-coded help response with contacts | Task 4 |
| Mood recording → events table | Task 9 |
| Weekly summary (auto cron seam + `callable_getWeeklySummary`) | Task 9, 10 |
| React notifications panel | Task 11 |
| `caregiver_links` table (Phase C seam) | Task 3 |
| Demo seed via `/seed` endpoint | Task 9 |
| Fire-and-forget memory extraction | Task 9 |
