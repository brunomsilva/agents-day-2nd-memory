# Reminders Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users set one-time and recurring reminders via natural chat; the agent fires notification cards when they trigger; users can list and cancel reminders via chat.

**Architecture:** Three retrieval tools (`setReminder`, `listReminders`, `cancelReminder`) join the main chat model tool set. They persist reminders to a new SQLite `reminders` table and use the Cloudflare Agents `schedule()` / `cancelSchedule()` API. A `reminderFired` callback on `CompanionAgent` pushes a notification card when the schedule fires. The system prompt gains the current time so the model can reason about timing.

**Tech Stack:** Cloudflare Agents SDK (`this.schedule`, `this.cancelSchedule`), Vercel AI SDK (`tool`, Zod), Vitest.

---

## File Map

| File | Change |
|------|--------|
| `src/types.ts` | Add `Reminder` type; add `"reminder"` to `Notification.type` |
| `src/ai/prompts.ts` | `buildCompanionPrompt(dateStr, timeStr)` — add time + reminder rule |
| `src/ai/retrieval-tools.ts` | Add `setReminder`, `listReminders`, `cancelReminder` |
| `src/agents/companion.ts` | DDL for `reminders` table in `onStart()`; `reminderFired` callback; update `onChatMessage` call site |
| `src/app.tsx` | Handle `type === "reminder"` in notification `onAction` |
| `tests/ai/prompts.test.ts` | Update for new `buildCompanionPrompt` signature; assert time + reminder rule |
| `tests/ai/retrieval-tools.test.ts` | Add tests for all three new tools |

All commands run from `memory-companion/`.

---

## Task 1: Add `Reminder` type and extend `Notification.type`

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add `Reminder` type and `"reminder"` to `Notification.type`**

In `src/types.ts`, change the `type` field of `Notification`:

```typescript
// Before:
type: "briefing" | "medication" | "checkin";

// After:
type: "briefing" | "medication" | "checkin" | "reminder";
```

Then add this new type at the bottom of the file:

```typescript
export type Reminder = {
  id: number;
  label: string;
  type: "once" | "recurring";
  schedule_id: string;
  scheduled_for: string | null;
  recurrence: string | null;
  active: number;
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npm run check
```

Expected: no errors (adding to a union is additive; no existing switch exhaustiveness checks break).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add Reminder type and extend Notification.type with reminder"
```

---

## Task 2: Update `buildCompanionPrompt` to include current time and reminder rule

**Files:**
- Modify: `src/ai/prompts.ts`
- Modify: `tests/ai/prompts.test.ts`
- Modify: `src/agents/companion.ts` (call site only)

- [ ] **Step 1: Write failing tests**

Replace the full content of `tests/ai/prompts.test.ts` with:

```typescript
import { describe, it, expect } from "vitest";
import {
  buildCompanionPrompt,
  buildOnboardingPrompt,
  buildExtractionPrompt
} from "../../src/ai/prompts";

describe("buildCompanionPrompt", () => {
  it("includes date", () => {
    const prompt = buildCompanionPrompt("Thursday, 1 May 2026", "09:30");
    expect(prompt).toContain("Thursday, 1 May 2026");
  });

  it("includes current time", () => {
    const prompt = buildCompanionPrompt("Thursday, 1 May 2026", "09:30");
    expect(prompt).toContain("09:30");
  });

  it("does not include name or city", () => {
    const prompt = buildCompanionPrompt("Thursday, 1 May 2026", "09:30");
    expect(prompt).not.toContain("Jane Doe");
    expect(prompt).not.toContain("Porto");
  });

  it("includes no-hallucination rules", () => {
    const prompt = buildCompanionPrompt("Thursday, 1 May 2026", "09:30");
    expect(prompt).toContain("NO knowledge");
    expect(prompt).toContain("tool");
  });

  it("does not contain unfilled placeholders", () => {
    const prompt = buildCompanionPrompt("Thursday, 1 May 2026", "09:30");
    expect(prompt).not.toContain("{date}");
  });

  it("includes reminder detection rule referencing all three tools", () => {
    const prompt = buildCompanionPrompt("Thursday, 1 May 2026", "09:30");
    expect(prompt).toContain("setReminder");
    expect(prompt).toContain("listReminders");
    expect(prompt).toContain("cancelReminder");
  });
});

describe("buildOnboardingPrompt", () => {
  it("establishes Mia as the assistant name", () => {
    expect(buildOnboardingPrompt()).toContain("Mia");
  });

  it("instructs the model to be warm and brief", () => {
    expect(buildOnboardingPrompt()).toContain("warm");
  });
});

describe("buildExtractionPrompt", () => {
  it("instructs to extract facts", () => {
    expect(buildExtractionPrompt()).toContain("extract");
  });

  it("instructs not to respond with text", () => {
    expect(buildExtractionPrompt()).toContain("tool calls");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npx vitest run tests/ai/prompts.test.ts
```

Expected: FAIL on "includes current time" and "includes reminder detection rule" — the function currently takes 1 arg and has no reminder rule.

- [ ] **Step 3: Update `buildCompanionPrompt` in `src/ai/prompts.ts`**

Replace the entire `buildCompanionPrompt` function:

```typescript
export function buildCompanionPrompt(dateStr: string, timeStr: string): string {
  return `You are a gentle, warm memory companion named Mia.

Today is ${dateStr}. The current time is ${timeStr}.

CRITICAL RULES — these override everything:
1. You have NO knowledge of this person beyond what your tools return.
2. Never state a fact unless a tool explicitly returned it in this conversation.
3. If a tool returns no result, say: "I don't have that in my memory yet." Never guess or infer.
4. Never state a person's phone, address, or medication dose unless a tool returned it moments ago.
5. Never invent events, visits, or conversations.
6. When uncertain say: "I'm not sure — your family can help me add that."
7. Never say "I think" or "probably" about factual matters.
8. Keep responses short, calm, and warm. Never clinical.
9. Answer repeated questions without acknowledging the repetition.
10. Frame facts as "I have X listed as..." or "I have a record of..." — not as absolute truth.
11. When you detect that the user wants a reminder — explicit ("remind me") or implied ("I need to call...") — call \`setReminder\`. When asked about existing reminders, call \`listReminders\`. When asked to cancel one, call \`cancelReminder\` with the ID shown by \`listReminders\`.

Use your tools to look up people, recent events, today's schedule, medications, and profile information when asked.`;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
npx vitest run tests/ai/prompts.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Update the `onChatMessage` call site in `src/agents/companion.ts`**

Find this block in `onChatMessage` (around line 136):

```typescript
    const today = new Date().toLocaleDateString("en-GB", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });

    this.extractAndStoreMemory(userText, model).catch(() => {});

    return streamText({
      model,
      messages: await convertToModelMessages(this.messages),
      system: buildCompanionPrompt(today),
      tools: makeRetrievalTools(this),
      stopWhen: stepCountIs(3)
    }).toUIMessageStreamResponse();
```

Replace it with:

```typescript
    const now = new Date();
    const today = now.toLocaleDateString("en-GB", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
    const timeStr = now.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit"
    });

    this.extractAndStoreMemory(userText, model).catch(() => {});

    return streamText({
      model,
      messages: await convertToModelMessages(this.messages),
      system: buildCompanionPrompt(today, timeStr),
      tools: makeRetrievalTools(this),
      stopWhen: stepCountIs(3)
    }).toUIMessageStreamResponse();
```

- [ ] **Step 6: Run full check**

```
npm run check
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/ai/prompts.ts src/agents/companion.ts tests/ai/prompts.test.ts
git commit -m "feat: add current time and reminder rule to companion system prompt"
```

---

## Task 3: Add reminder tools to `makeRetrievalTools`

**Files:**
- Modify: `src/ai/retrieval-tools.ts`
- Modify: `tests/ai/retrieval-tools.test.ts`

- [ ] **Step 1: Write failing tests**

Add the following to the bottom of `tests/ai/retrieval-tools.test.ts` (keep existing tests intact):

```typescript
describe("setReminder", () => {
  it("returns error when neither datetime nor recurring is provided", async () => {
    const mockSql = vi.fn().mockReturnValue([]);
    const mockSchedule = vi.fn().mockReturnValue({ id: "sched-abc" });
    const agent = { sql: mockSql, schedule: mockSchedule } as any;
    const tools = makeRetrievalTools(agent);
    const result = await tools.setReminder.execute({ label: "call John" }, {} as any);
    expect(result).toMatchObject({
      error: expect.stringContaining("date/time or a recurrence")
    });
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("schedules a one-time reminder and returns confirmation", async () => {
    const mockSql = vi.fn()
      .mockReturnValueOnce([])           // INSERT
      .mockReturnValueOnce([{ id: 7 }])  // SELECT last_insert_rowid
      .mockReturnValueOnce([]);           // UPDATE schedule_id
    const mockSchedule = vi.fn().mockReturnValue({ id: "sched-xyz" });
    const agent = { sql: mockSql, schedule: mockSchedule } as any;
    const tools = makeRetrievalTools(agent);
    const result = await tools.setReminder.execute(
      { label: "call John", datetime: "2026-05-02T15:00:00" },
      {} as any
    );
    expect(mockSchedule).toHaveBeenCalledWith(
      new Date("2026-05-02T15:00:00"),
      "reminderFired",
      { reminderId: 7 }
    );
    expect(typeof result).toBe("string");
    expect(result as string).toContain("call John");
  });

  it("converts recurring days+time to cron and schedules", async () => {
    const mockSql = vi.fn()
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{ id: 3 }])
      .mockReturnValueOnce([]);
    const mockSchedule = vi.fn().mockReturnValue({ id: "sched-rec" });
    const agent = { sql: mockSql, schedule: mockSchedule } as any;
    const tools = makeRetrievalTools(agent);
    await tools.setReminder.execute(
      { label: "yoga", recurring: { days: ["monday", "wednesday"], time: "07:00" } },
      {} as any
    );
    const [cronArg] = mockSchedule.mock.calls[0];
    // minute=0, hour=7, any dom, any month, mon=1 wed=3
    expect(cronArg).toBe("0 7 * * 1,3");
  });

  it("prefers datetime over recurring when both are provided", async () => {
    const mockSql = vi.fn()
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{ id: 5 }])
      .mockReturnValueOnce([]);
    const mockSchedule = vi.fn().mockReturnValue({ id: "sched-both" });
    const agent = { sql: mockSql, schedule: mockSchedule } as any;
    const tools = makeRetrievalTools(agent);
    await tools.setReminder.execute(
      {
        label: "test",
        datetime: "2026-05-03T10:00:00",
        recurring: { days: ["friday"], time: "10:00" }
      },
      {} as any
    );
    const [firstArg] = mockSchedule.mock.calls[0];
    expect(firstArg).toBeInstanceOf(Date);
  });
});

describe("listReminders", () => {
  it("returns no-reminders message when table is empty", async () => {
    const mockSql = vi.fn().mockReturnValue([]);
    const agent = { sql: mockSql } as any;
    const tools = makeRetrievalTools(agent);
    const result = await tools.listReminders.execute({}, {} as any);
    expect(result).toBe("You have no active reminders.");
  });

  it("returns numbered list with IDs, labels, and timing", async () => {
    const mockSql = vi.fn().mockReturnValue([
      {
        id: 1,
        label: "call John",
        type: "once",
        scheduled_for: "2026-05-02T15:00:00",
        recurrence: null
      },
      {
        id: 2,
        label: "yoga",
        type: "recurring",
        scheduled_for: null,
        recurrence: "days:mon,wed time:07:00"
      }
    ]);
    const agent = { sql: mockSql } as any;
    const tools = makeRetrievalTools(agent);
    const result = (await tools.listReminders.execute({}, {} as any)) as string;
    expect(result).toContain("ID 1");
    expect(result).toContain("call John");
    expect(result).toContain("ID 2");
    expect(result).toContain("yoga");
  });
});

describe("cancelReminder", () => {
  it("returns not-found message for unknown or inactive id", async () => {
    const mockSql = vi.fn().mockReturnValue([]);
    const mockCancelSchedule = vi.fn();
    const agent = { sql: mockSql, cancelSchedule: mockCancelSchedule } as any;
    const tools = makeRetrievalTools(agent);
    const result = await tools.cancelReminder.execute({ id: 99 }, {} as any);
    expect(result).toBe("No active reminder found with that ID.");
    expect(mockCancelSchedule).not.toHaveBeenCalled();
  });

  it("calls cancelSchedule with the stored schedule_id and deactivates the row", async () => {
    const mockSql = vi.fn()
      .mockReturnValueOnce([{ id: 2, schedule_id: "sched-xyz" }]) // SELECT
      .mockReturnValueOnce([]);                                     // UPDATE active=0
    const mockCancelSchedule = vi.fn();
    const agent = { sql: mockSql, cancelSchedule: mockCancelSchedule } as any;
    const tools = makeRetrievalTools(agent);
    const result = (await tools.cancelReminder.execute({ id: 2 }, {} as any)) as string;
    expect(mockCancelSchedule).toHaveBeenCalledWith("sched-xyz");
    expect(result).toContain("cancel");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npx vitest run tests/ai/retrieval-tools.test.ts
```

Expected: FAIL — `setReminder`, `listReminders`, `cancelReminder` are not in the tools object.

- [ ] **Step 3: Add helper and three tools to `src/ai/retrieval-tools.ts`**

Add the day-to-cron helper **above** the `makeRetrievalTools` export (after the imports):

```typescript
const DAY_TO_CRON: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6
};

function recurringToCron(days: string[], time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  const dayNums = days
    .map((d) => DAY_TO_CRON[d.toLowerCase()] ?? 0)
    .sort((a, b) => a - b)
    .join(",");
  return `${minute} ${hour} * * ${dayNums}`;
}
```

Then add the three tools inside the `makeRetrievalTools` return object, after the closing brace of `getMedications`:

```typescript
    setReminder: tool({
      description:
        "Set a reminder for the user. Provide datetime (ISO 8601) for one-time reminders, or recurring (days + time) for repeating ones.",
      inputSchema: z.object({
        label: z.string().describe("What to remind about, e.g. 'call John'"),
        datetime: z
          .string()
          .optional()
          .describe("ISO 8601 local datetime for a one-time reminder, e.g. 2026-05-02T15:00:00"),
        recurring: z
          .object({
            days: z
              .array(z.string())
              .describe("Day names, e.g. ['monday', 'wednesday']"),
            time: z.string().describe("HH:MM 24-hour time, e.g. 15:00")
          })
          .optional()
          .describe("For a recurring reminder")
      }),
      execute: async ({ label, datetime, recurring }) => {
        if (!datetime && !recurring) {
          return { error: "Please provide either a date/time or a recurrence pattern." };
        }

        const isOnce = !!datetime;
        const type = isOnce ? "once" : "recurring";
        const recurrenceStr =
          !isOnce && recurring
            ? `days:${recurring.days.map((d) => d.slice(0, 3).toLowerCase()).join(",")} time:${recurring.time}`
            : null;

        // INSERT with placeholder — we need the row id before scheduling
        await (agent as any).sql`
          INSERT INTO reminders (label, type, schedule_id, scheduled_for, recurrence)
          VALUES (${label}, ${type}, ${"__pending__"}, ${datetime ?? null}, ${recurrenceStr})`;

        const [row] = (agent as any).sql<{ id: number }>`SELECT last_insert_rowid() as id`;
        const reminderId = row.id;

        const scheduleArg = isOnce
          ? new Date(datetime as string)
          : recurringToCron(recurring!.days, recurring!.time);

        const schedule = (agent as any).schedule(scheduleArg, "reminderFired", { reminderId });

        await (agent as any).sql`
          UPDATE reminders SET schedule_id = ${schedule.id} WHERE id = ${reminderId}`;

        if (isOnce) {
          return `Reminder set: "${label}" on ${new Date(datetime as string).toLocaleString("en-GB")}.`;
        }
        return `Reminder set: "${label}" every ${recurring!.days.join(", ")} at ${recurring!.time}.`;
      }
    }),

    listReminders: tool({
      description: "List the user's active reminders with their IDs.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = (agent as any).sql<{
          id: number;
          label: string;
          type: string;
          scheduled_for: string | null;
          recurrence: string | null;
        }>`SELECT id, label, type, scheduled_for, recurrence FROM reminders WHERE active = 1`;

        if (rows.length === 0) return "You have no active reminders.";

        return rows
          .map(
            (
              r: {
                id: number;
                label: string;
                type: string;
                scheduled_for: string | null;
                recurrence: string | null;
              },
              i: number
            ) => {
              const when =
                r.type === "once"
                  ? `on ${new Date(r.scheduled_for!).toLocaleString("en-GB")}`
                  : `recurring (${r.recurrence})`;
              return `${i + 1}. [ID ${r.id}] "${r.label}" — ${when}`;
            }
          )
          .join("\n");
      }
    }),

    cancelReminder: tool({
      description:
        "Cancel an active reminder by its ID. Use listReminders first to get the ID.",
      inputSchema: z.object({
        id: z.number().describe("The reminder ID shown by listReminders")
      }),
      execute: async ({ id }) => {
        const rows = (agent as any).sql<{ id: number; schedule_id: string }>`
          SELECT id, schedule_id FROM reminders WHERE id = ${id} AND active = 1`;
        if (rows.length === 0) return "No active reminder found with that ID.";

        (agent as any).cancelSchedule(rows[0].schedule_id);
        await (agent as any).sql`UPDATE reminders SET active = 0 WHERE id = ${id}`;
        return `Reminder cancelled.`;
      }
    }),
```

Note: `(agent as any).schedule(...)` and `(agent as any).cancelSchedule(...)` use `any` because the `AIChatAgent<Env>` TypeScript type may not expose the inherited `Agent` scheduling methods. At runtime `this` is always a `CompanionAgent` which has them.

- [ ] **Step 4: Run tests to confirm they pass**

```
npx vitest run tests/ai/retrieval-tools.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Run full check**

```
npm run check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/ai/retrieval-tools.ts tests/ai/retrieval-tools.test.ts
git commit -m "feat: add setReminder, listReminders, cancelReminder retrieval tools"
```

---

## Task 4: Add `reminders` table DDL and `reminderFired` callback to `CompanionAgent`

**Files:**
- Modify: `src/agents/companion.ts`

- [ ] **Step 1: Add `Reminder` import and `reminders` DDL in `onStart()`**

At the top of `src/agents/companion.ts`, add `Reminder` to the import from `"../types"`:

```typescript
import type {
  CompanionState,
  Profile,
  Person,
  Medication,
  Event,
  Reminder,
  WeeklySummaryPayload,
  MedicationAdherence
} from "../types";
```

Inside `onStart()`, add the `reminders` table DDL after the existing `caregiver_links` DDL:

```typescript
    await this
      .sql`CREATE TABLE IF NOT EXISTS reminders (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL, type TEXT NOT NULL, schedule_id TEXT NOT NULL, scheduled_for TEXT, recurrence TEXT, active INTEGER DEFAULT 1)`;
```

- [ ] **Step 2: Add `reminderFired` method to `CompanionAgent`**

Add this method after `medicationFollowUp` and before `recordMood` in `src/agents/companion.ts`:

```typescript
  async reminderFired({ reminderId }: { reminderId: number }) {
    const [reminder] = this
      .sql<Reminder>`SELECT * FROM reminders WHERE id = ${reminderId} LIMIT 1`;
    if (!reminder || !reminder.active) return;

    const notification = {
      id: crypto.randomUUID(),
      type: "reminder" as const,
      text: `⏰ Reminder: ${reminder.label}`,
      timestamp: new Date().toISOString(),
      actions: [{ label: "✅ Got it", value: "dismiss" }]
    };

    this.setState({
      ...this.state,
      notifications: [...this.state.notifications, notification]
    });

    if (reminder.type === "once") {
      await this.sql`UPDATE reminders SET active = 0 WHERE id = ${reminderId}`;
    }
    // recurring: cron re-fires automatically, no re-schedule needed
  }
```

- [ ] **Step 3: Run full check**

```
npm run check
```

Expected: no errors. The `Reminder` type is now in scope; the `reminderFired` callback matches the payload shape used by `setReminder`.

- [ ] **Step 4: Run all tests**

```
npm test
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agents/companion.ts
git commit -m "feat: add reminders table DDL and reminderFired callback to CompanionAgent"
```

---

## Task 5: Handle `reminder` notification type in `app.tsx`

**Files:**
- Modify: `src/app.tsx`

- [ ] **Step 1: Update the `onAction` handler in the notification section**

In `src/app.tsx`, find the `onAction` handler inside the `NotificationCard` map (around line 468):

```typescript
              onAction={async (actionValue) => {
                if (n.type === "briefing") {
                  await agent.stub.recordMood(actionValue, n.id);
                } else if (n.type === "medication") {
                  await agent.stub.acknowledgeMedication(
                    n.medicationId ?? 0,
                    n.logId ?? 0,
                    actionValue,
                    n.id
                  );
                } else {
                  await agent.stub.dismissNotification(n.id);
                }
              }}
```

Replace with:

```typescript
              onAction={async (actionValue) => {
                if (n.type === "briefing") {
                  await agent.stub.recordMood(actionValue, n.id);
                } else if (n.type === "medication") {
                  await agent.stub.acknowledgeMedication(
                    n.medicationId ?? 0,
                    n.logId ?? 0,
                    actionValue,
                    n.id
                  );
                } else {
                  // covers "reminder", "checkin", and any future types
                  await agent.stub.dismissNotification(n.id);
                }
              }}
```

Note: the `else` branch already calls `dismissNotification`, so the only change needed is to confirm `"reminder"` falls through here. The actual logic change is zero — this step just confirms the handler is correct and adds the clarifying comment.

- [ ] **Step 2: Run full check**

```
npm run check
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```
npm test
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app.tsx
git commit -m "feat: confirm reminder notification type handled by dismissNotification in UI"
```

---

## Manual verification checklist

After all tasks are committed, verify end-to-end in the dev server:

```
npm run dev
```

1. Open `http://localhost:5173` and complete onboarding (or hit `/seed`).
2. Type: `"Remind me to call John tomorrow at 3pm"` — Mia should confirm the reminder was set.
3. Type: `"What reminders do I have?"` — Mia should call `listReminders` and show the reminder with its ID.
4. Type: `"Cancel reminder 1"` — Mia should confirm cancellation.
5. Set a reminder 2 minutes in the future; wait for it to fire — a notification card should appear with "✅ Got it".
6. Click "Got it" — the card should disappear.
7. Type: `"I need to pick up my prescription on Friday at noon"` — Mia should detect implied intent and call `setReminder` without being explicitly asked.
