# Memory Companion — Demo Guide

The fastest way to understand Memory Companion is the interactive demo page at **`/demo`**.

## Launch the demo

```bash
cd memory-companion
npm run dev
```

Open http://localhost:5173/demo and click **Reset Demo** to populate the agent with realistic seed data.

## What the demo covers

The demo is an 8-step wizard that walks you through the entire patient and caregiver experience.

| Step | What you see |
| ---- | ------------ |
| **1. Welcome** | Overview of Memory Companion and what each step covers |
| **2. Profile** | Patient identity (name, age, city, timezone, notes) stored for anti-hallucination retrieval |
| **3. People** | Family members, doctors, and caregivers with full contact info and relationship tags |
| **4. Medications** | Scheduled doses with dosage, instructions, prescriber, and active/inactive status |
| **5. Routines & Reminders** | Daily routines (walks, meals, appointments) and one-off or recurring reminders |
| **6. Morning Briefing** | Trigger a live briefing and see exactly what the patient receives — date, schedule, medications, and a mood check |
| **7. Admin Summary** | Caregiver dashboard view with weekly mood trends, medication adherence, recent events, and help requests |
| **8. Chat Preview** | Example grounded conversations showing how Mia retrieves facts from SQLite instead of hallucinating |

## Demo data

Clicking **Reset Demo** seeds the following profile:

- **Patient:** Jane Doe, 78, Porto, Europe/Lisbon
- **People:** Dr. Ana Silva (family physician), Maria Santos (daughter), José Ferreira (son)
- **Medications:** Lisinopril 10mg at 08:00, Metformin 500mg at 08:00 and 20:00
- **Routines:** Morning walk at 07:00 daily, Lunch with Maria at 12:30 on Sundays
- **Reminders:** Drink water every day at 10:00
- **Events:** Recent visit from Maria, morning mood entry

## Reset at any time

The **Reset Demo** button in the top-right of the demo page:

1. Deletes all data from every SQLite table
2. Cancels existing medication and reminder schedules
3. Re-inserts the fresh demo dataset above
4. Reloads the view so you see the new data immediately

## Switching views

While the demo is running you can switch to the real interfaces at any time:

- **Chat** — the actual patient-facing conversation UI
- **Admin** — the full data-management dashboard with CRUD on every table

Both connect to the same `CompanionAgent` instance, so data you see in the demo is live in chat and admin too.
