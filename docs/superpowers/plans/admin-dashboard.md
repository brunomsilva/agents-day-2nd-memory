# Admin Dashboard — View & Edit SQLite Data

## Context
The Memory Companion app has 7 SQLite tables managed by `CompanionAgent` (profile, people, events, routines, medications, medication_logs, caregiver_links). Currently the only UI is the patient-facing chat. This adds a developer/caregiver admin view that connects to the same `CompanionAgent` DO instance and exposes full CRUD on those tables.

---

## Approach
Three-file change: add `@callable()` methods to the agent (backend), create a new `admin.tsx` component, and wire a view toggle into `app.tsx`. No new dependencies; no router needed.

---

## Critical Files
- `memory-companion/src/agents/companion.ts` — add ~25 callable methods before `onRequest()` (line 640)
- `memory-companion/src/admin.tsx` — create: tabbed dashboard component
- `memory-companion/src/app.tsx` — add view switcher (Chat / Admin) at the bottom `App` function
- `memory-companion/src/types.ts` — read-only reference for all type definitions

---

## Step 1 — Add @callable() methods to CompanionAgent

Insert before `async onRequest(...)` at line 640.

**Rules from CLAUDE.md:**
- SELECT reads are synchronous: `const rows = [...this.sql\`SELECT ...\`]`
- Writes (INSERT/UPDATE/DELETE) must be `await`ed
- Template literals must be inline

### Profile (2 methods)
```typescript
@callable()
async getProfileData(): Promise<Profile | null> {
  const [row] = this.sql<Profile>`SELECT * FROM profile LIMIT 1`;
  return row ?? null;
}

@callable()
async saveProfileData(data: Partial<Omit<Profile, "setup_complete">>): Promise<void> {
  if (data.name !== undefined)
    await this.sql`UPDATE profile SET name = ${data.name}`;
  if (data.age !== undefined)
    await this.sql`UPDATE profile SET age = ${data.age}`;
  if (data.city !== undefined)
    await this.sql`UPDATE profile SET city = ${data.city}`;
  if (data.timezone !== undefined)
    await this.sql`UPDATE profile SET timezone = ${data.timezone}`;
  if (data.notes !== undefined)
    await this.sql`UPDATE profile SET notes = ${data.notes}`;
}
```

### People (4 methods)
```typescript
@callable()
async listPeople(): Promise<Person[]> {
  return [...this.sql<Person>`SELECT * FROM people ORDER BY name`];
}
@callable()
async createPerson(data: Omit<Person, "id" | "last_mentioned_at">): Promise<void> {
  await this.sql`INSERT INTO people (name, relationship, notes, phone, last_mentioned_at)
    VALUES (${data.name}, ${data.relationship ?? null}, ${data.notes ?? null}, ${data.phone ?? null}, datetime('now'))`;
}
@callable()
async updatePersonById(id: number, data: Partial<Omit<Person, "id">>): Promise<void> {
  if (data.name !== undefined) await this.sql`UPDATE people SET name = ${data.name} WHERE id = ${id}`;
  if (data.relationship !== undefined) await this.sql`UPDATE people SET relationship = ${data.relationship} WHERE id = ${id}`;
  if (data.notes !== undefined) await this.sql`UPDATE people SET notes = ${data.notes} WHERE id = ${id}`;
  if (data.phone !== undefined) await this.sql`UPDATE people SET phone = ${data.phone} WHERE id = ${id}`;
}
@callable()
async deletePersonById(id: number): Promise<void> {
  await this.sql`DELETE FROM people WHERE id = ${id}`;
}
```

### Events (3 methods)
```typescript
@callable()
async listEvents(limit = 50): Promise<Event[]> {
  return [...this.sql<Event>`SELECT * FROM events ORDER BY occurred_on DESC LIMIT ${limit}`];
}
@callable()
async createEvent(data: Omit<Event, "id">): Promise<void> {
  await this.sql`INSERT INTO events (occurred_on, description, type, source)
    VALUES (${data.occurred_on}, ${data.description}, ${data.type ?? 'event'}, ${data.source ?? 'user'})`;
}
@callable()
async deleteEventById(id: number): Promise<void> {
  await this.sql`DELETE FROM events WHERE id = ${id}`;
}
```

### Routines (4 methods)
```typescript
@callable()
async listRoutines(): Promise<Routine[]> {
  return [...this.sql<Routine>`SELECT * FROM routines ORDER BY name`];
}
@callable()
async createRoutine(data: Omit<Routine, "id">): Promise<void> {
  await this.sql`INSERT INTO routines (name, type, scheduled_time, days, description, active)
    VALUES (${data.name}, ${data.type ?? 'routine'}, ${data.scheduled_time ?? null}, ${data.days ?? null}, ${data.description ?? null}, ${data.active ?? 1})`;
}
@callable()
async updateRoutineById(id: number, data: Partial<Omit<Routine, "id">>): Promise<void> {
  if (data.name !== undefined) await this.sql`UPDATE routines SET name = ${data.name} WHERE id = ${id}`;
  if (data.type !== undefined) await this.sql`UPDATE routines SET type = ${data.type} WHERE id = ${id}`;
  if (data.scheduled_time !== undefined) await this.sql`UPDATE routines SET scheduled_time = ${data.scheduled_time} WHERE id = ${id}`;
  if (data.days !== undefined) await this.sql`UPDATE routines SET days = ${data.days} WHERE id = ${id}`;
  if (data.description !== undefined) await this.sql`UPDATE routines SET description = ${data.description} WHERE id = ${id}`;
  if (data.active !== undefined) await this.sql`UPDATE routines SET active = ${data.active} WHERE id = ${id}`;
}
@callable()
async deleteRoutineById(id: number): Promise<void> {
  await this.sql`DELETE FROM routines WHERE id = ${id}`;
}
```

### Medications (4 methods)
```typescript
@callable()
async listMedications(): Promise<Medication[]> {
  return [...this.sql<Medication>`SELECT * FROM medications ORDER BY name`];
}
@callable()
async createMedication(data: Omit<Medication, "id">): Promise<void> {
  await this.sql`INSERT INTO medications (name, dosage, scheduled_times, instructions, prescriber, active)
    VALUES (${data.name}, ${data.dosage ?? null}, ${data.scheduled_times}, ${data.instructions ?? null}, ${data.prescriber ?? null}, ${data.active ?? 1})`;
  this.scheduleMedicationReminders();
}
@callable()
async updateMedicationById(id: number, data: Partial<Omit<Medication, "id">>): Promise<void> {
  if (data.name !== undefined) await this.sql`UPDATE medications SET name = ${data.name} WHERE id = ${id}`;
  if (data.dosage !== undefined) await this.sql`UPDATE medications SET dosage = ${data.dosage} WHERE id = ${id}`;
  if (data.scheduled_times !== undefined) await this.sql`UPDATE medications SET scheduled_times = ${data.scheduled_times} WHERE id = ${id}`;
  if (data.instructions !== undefined) await this.sql`UPDATE medications SET instructions = ${data.instructions} WHERE id = ${id}`;
  if (data.prescriber !== undefined) await this.sql`UPDATE medications SET prescriber = ${data.prescriber} WHERE id = ${id}`;
  if (data.active !== undefined) await this.sql`UPDATE medications SET active = ${data.active} WHERE id = ${id}`;
}
@callable()
async deleteMedicationById(id: number): Promise<void> {
  await this.sql`DELETE FROM medications WHERE id = ${id}`;
}
```

### Medication Logs (1 method — read-only)
```typescript
@callable()
async listMedicationLogs(limit = 100): Promise<(MedicationLog & { medication_name: string | null })[]> {
  return [...this.sql<MedicationLog & { medication_name: string | null }>`
    SELECT ml.*, m.name as medication_name
    FROM medication_logs ml
    LEFT JOIN medications m ON m.id = ml.medication_id
    ORDER BY ml.scheduled_for DESC
    LIMIT ${limit}`];
}
```

---

## Step 2 — Create src/admin.tsx

New file. Connects to `CompanionAgent` via the same `useAgent` hook as chat. Tabbed layout with 6 sections.

### Imports
```typescript
import { useState, useEffect, useCallback } from "react";
import { useAgent } from "agents/react";
import type { CompanionAgent } from "./server";
import type { CompanionState, Profile, Person, Event, Routine, Medication, MedicationLog } from "./types";
import { Badge, Button, Surface, Text } from "@cloudflare/kumo";
import {
  UserIcon, UsersIcon, CalendarIcon, ClockIcon,
  PillIcon, ClipboardTextIcon, PlusIcon, PencilSimpleIcon,
  TrashIcon, CheckIcon, XIcon, ArrowClockwiseIcon,
  SunIcon, MoonIcon
} from "@phosphor-icons/react";
```

### Key design decisions
- Use `useAgent({ agent: "CompanionAgent", onOpen: () => setConnected(true), onClose: () => setConnected(false) })`
- Load data only after `connected` becomes true (guard with `useEffect` on `[connected, activeTab]`)
- **Inline edit**: `editingId` + `editDraft` state per tab; row renders as input fields when `editingId === row.id`
- **Delete**: `window.confirm()` before calling stub
- **`active` field**: stored as `number` (0/1) in SQLite — render as `Badge` ("Active"/"Inactive"), send `1`/`0`
- **Routine `type` enum**: `"routine" | "appointment" | "task"` — use `<select>` in add/edit forms
- **Event `type`**: `"event" | "mood" | "help_request" | "system"` — use `<select>`
- **MedLogs**: read-only table, no add/edit/delete

### Tab structure
```
Tabs: Profile | People | Events | Routines | Medications | Med Logs
  ProfileTab     — single-row form, all fields editable
  PeopleTab      — table + add row + inline edit/delete
  EventsTab      — table + add row (type+source selects) + delete only
  RoutinesTab    — table + add row + inline edit/delete + active toggle
  MedicationsTab — table + add row + inline edit/delete + active toggle
  MedLogsTab     — read-only table (medication_name, scheduled_for, status badge, responded_at)
```

### Nav tab buttons
```tsx
const TABS = [
  { id: "profile",     label: "Profile",     icon: <UserIcon size={14} /> },
  { id: "people",      label: "People",      icon: <UsersIcon size={14} /> },
  { id: "events",      label: "Events",      icon: <CalendarIcon size={14} /> },
  { id: "routines",    label: "Routines",    icon: <ClockIcon size={14} /> },
  { id: "medications", label: "Medications", icon: <PillIcon size={14} /> },
  { id: "medlogs",     label: "Med Logs",    icon: <ClipboardTextIcon size={14} /> },
];
```
Render as `Button variant="primary"` (active tab) or `variant="outline"` (inactive).

### Data loading pattern
```typescript
const loadTab = useCallback(async (tab) => {
  if (!connected) return;
  setLoading(true);
  try {
    switch (tab) {
      case "profile":    setProfile(await agent.stub.getProfileData()); break;
      case "people":     setPeople(await agent.stub.listPeople()); break;
      case "events":     setEvents(await agent.stub.listEvents(50)); break;
      case "routines":   setRoutines(await agent.stub.listRoutines()); break;
      case "medications":setMedications(await agent.stub.listMedications()); break;
      case "medlogs":    setMedLogs(await agent.stub.listMedicationLogs(100)); break;
    }
  } finally { setLoading(false); }
}, [agent, connected]);

useEffect(() => { loadTab(activeTab); }, [connected, activeTab, loadTab]);
```

---

## Step 3 — Modify src/app.tsx

**Only change the `App` function at the bottom of the file.** All other code stays untouched.

Add import at top of file:
```typescript
import { AdminDashboard } from "./admin";
```

Replace the `App` export:
```tsx
type AppView = "chat" | "admin";

export default function App() {
  const [view, setView] = useState<AppView>("chat");
  return (
    <Toasty>
      {/* View switcher — fixed top-right, z-50 so it floats above both views */}
      <div className="fixed top-3 right-20 z-50 flex gap-1 bg-kumo-base border border-kumo-line rounded-lg p-1 shadow-sm">
        <Button size="sm" variant={view === "chat" ? "primary" : "ghost"}
          onClick={() => setView("chat")} icon={<ChatCircleDotsIcon size={14} />}>Chat</Button>
        <Button size="sm" variant={view === "admin" ? "primary" : "ghost"}
          onClick={() => setView("admin")} icon={<GearIcon size={14} />}>Admin</Button>
      </div>
      <Suspense fallback={<div className="flex items-center justify-center h-screen text-kumo-inactive">Loading...</div>}>
        {view === "chat" ? <Chat /> : <AdminDashboard />}
      </Suspense>
    </Toasty>
  );
}
```

`useState`, `ChatCircleDotsIcon`, and `GearIcon` are already imported in `app.tsx`. No other imports needed besides `AdminDashboard`.

---

## Verification

```bash
cd memory-companion
npm run dev           # start dev server
```

1. Open http://localhost:5173 — Chat tab should work exactly as before
2. Click **Admin** — dashboard should appear
3. Click **Profile** tab — profile data loads (seed first via `/agents/CompanionAgent/default/seed` if empty)
4. Edit a profile field, save — verify change persists (reload page or switch tabs)
5. Click **People** — list loads; add a person; delete a person
6. Click **Medications** — add a medication; verify `scheduleMedicationReminders()` is called (no errors)
7. Click **Med Logs** — read-only table shows joined medication name
8. Run `npm run check` — must pass lint + type check before claiming done

---

## Gotchas to Watch

| Issue | Fix |
|-------|-----|
| `this.sql` returns iterator (not array) for SELECT | Always spread: `[...this.sql\`...\`]` or destructure `[first] = this.sql\`...\`` |
| Forgetting `await` on writes | Silently drops data — every INSERT/UPDATE/DELETE needs `await` |
| `active` is `number` not `boolean` | Send `1`/`0`, not `true`/`false` |
| agent.stub calls before WebSocket open | Guard with `connected` state; load only after `onOpen` fires |
| `medication_name` not in `MedicationLog` type | Use `MedicationLog & { medication_name: string \| null }` inline in admin.tsx |
| `createMedication` needs reminder scheduling | Call `this.scheduleMedicationReminders()` at end of that callable |
