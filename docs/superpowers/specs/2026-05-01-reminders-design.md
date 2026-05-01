# Reminders Feature — Design Spec

**Date:** 2026-05-01  
**Status:** Approved

## Overview

Users can set one-time and recurring reminders via natural conversation. Mia detects reminder intent (explicit or implied) during the main chat pass and calls tool functions to persist and schedule the reminder. When a reminder fires, a notification card appears in the UI. Users can list and cancel reminders via chat.

The system prompt is updated to include the current time (not just date), so the model can reason accurately about when reminders should fire.

## Data Model

New `reminders` table, created in `CompanionAgent.onStart()`:

```sql
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,       -- human-readable description, e.g. "call John"
  type TEXT NOT NULL,        -- 'once' | 'recurring'
  schedule_id TEXT NOT NULL, -- Cloudflare Agents schedule ID for cancellation
  scheduled_for TEXT,        -- ISO 8601 datetime, populated for type='once'
  recurrence TEXT,           -- encoded as "days:mon,wed time:15:00" for type='recurring'
  active INTEGER DEFAULT 1
)
```

`schedule_id` is stored immediately after `this.schedule()` returns so `cancelReminder` can call `this.cancelSchedule(schedule_id)`.

## Tools

Three new tools added to `makeRetrievalTools()` in `src/ai/retrieval-tools.ts`. All three receive the agent instance via closure (same pattern as existing tools).

### `setReminder`

**Parameters:**
- `label: string` — what to remind about
- `datetime?: string` — ISO 8601 local datetime for one-time reminders (e.g. `"2026-05-02T15:00:00"`)
- `recurring?: { days: string[], time: string }` — for recurring reminders (e.g. `{ days: ["monday", "wednesday"], time: "15:00" }`)

Exactly one of `datetime` or `recurring` must be provided.

**Behaviour:**
1. Converts `recurring.days` + `recurring.time` → standard cron expression internally (model never generates cron).
2. Calls `this.schedule(dateOrCron, "reminderFired", { reminderId: <pending> })`.  
   Because the row ID is needed in the payload but doesn't exist until after INSERT, the approach is: INSERT first with a placeholder `schedule_id`, schedule with `reminderId`, then UPDATE `schedule_id` with the returned schedule's id.
3. Returns a confirmation string: `"Reminder set: call John on Monday at 15:00"`.

### `listReminders`

No parameters. Reads `SELECT * FROM reminders WHERE active = 1` and returns a human-readable numbered list with each reminder's `id`, `label`, type, and when it fires. Returns `"You have no active reminders."` if empty.

### `cancelReminder`

**Parameters:**
- `id: number` — SQLite row ID from `listReminders` output

Calls `this.cancelSchedule(schedule_id)`, sets `active = 0`, returns confirmation.

## System Prompt Changes

`buildCompanionPrompt` signature changes from `(dateStr: string)` to `(dateStr: string, timeStr: string)`.

The prompt gains:
```
Today is ${dateStr}. The current time is ${timeStr}.
```

One new rule added to the CRITICAL RULES list:
> When you detect that the user wants a reminder — explicit ("remind me") or implied ("I need to call...") — call `setReminder`. When asked about existing reminders, call `listReminders`. When asked to cancel one, call `cancelReminder` with the ID shown by `listReminders`.

The call site in `companion.ts` passes both strings:
```typescript
const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
system: buildCompanionPrompt(today, timeStr),
```

## Scheduling & Notification

### `reminderFired` callback

```typescript
async reminderFired({ reminderId }: { reminderId: number }) {
  const [reminder] = this.sql<Reminder>`SELECT * FROM reminders WHERE id = ${reminderId}`;
  if (!reminder || !reminder.active) return;

  const notification: Notification = {
    id: crypto.randomUUID(),
    type: "reminder",
    text: `⏰ Reminder: ${reminder.label}`,
    timestamp: new Date().toISOString(),
    actions: [{ label: "✅ Got it", value: "dismiss" }]
  };
  this.setState({ ...this.state, notifications: [...this.state.notifications, notification] });

  if (reminder.type === "once") {
    await this.sql`UPDATE reminders SET active = 0 WHERE id = ${reminderId}`;
  }
  // recurring: cron re-fires automatically, no re-schedule needed
}
```

### Type changes

- `Notification.type` gains `"reminder"` as a valid value.
- `app.tsx` `onAction` handler: for `type === "reminder"`, calls `agent.stub.dismissNotification(n.id)` (existing callable, no new callable needed).

## Error Handling

- `setReminder` with neither `datetime` nor `recurring`: return `{ error: "Please provide either a date/time or a recurrence pattern." }`.
- `setReminder` with both `datetime` and `recurring` provided: `datetime` takes precedence; the reminder is treated as one-time.
- `cancelReminder` with unknown ID or already-inactive reminder: return `"No active reminder found with that ID."`.
- `reminderFired` for a missing or inactive reminder: early return, no notification pushed.

## Out of Scope

- Snooze / "remind me again in 10 minutes" — deferred to a future iteration.
- Reminder editing — cancel and re-create.
- Telegram transport — Phase C.
