import { tool } from "ai";
import { z } from "zod";
import type { AIChatAgent } from "@cloudflare/ai-chat";

const DAY_TO_CRON: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
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

export function makeRetrievalTools(agent: AIChatAgent<Env>) {
  return {
    lookupPerson: tool({
      description:
        "Look up a specific person by name. Call when the user asks about someone.",
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => {
        const rows = agent.sql<{
          id: number;
          name: string;
          relationship: string | null;
          notes: string | null;
          phone: string | null;
          email: string | null;
          address: string | null;
        }>`SELECT id, name, relationship, notes, phone, email, address FROM people
           WHERE name LIKE ${"%" + name + "%"} LIMIT 1`;
        if (rows.length === 0) {
          return {
            found: false,
            message: `I don't have anyone named "${name}" in my memory.`
          };
        }
        return { found: true, ...rows[0] };
      }
    }),

    getRecentEvents: tool({
      description:
        "Get events logged in recent days. Call when asked what happened recently or on a specific day.",
      inputSchema: z.object({ days: z.number().default(3) }),
      execute: async ({ days }) => {
        const cutoff = new Date(Date.now() - days * 86_400_000)
          .toISOString()
          .split("T")[0];
        const events = agent.sql<{ occurred_on: string; description: string }>`
          SELECT occurred_on, description FROM events
          WHERE occurred_on >= ${cutoff}
          AND type = 'event'
          ORDER BY occurred_on DESC
          LIMIT 10`;
        if (events.length === 0) {
          return { found: false, message: "Nothing recorded for this period." };
        }
        return { found: true, events };
      }
    }),

    getTodaySchedule: tool({
      description:
        "Get today's routines, appointments, and medications. Call when asked about today's plan.",
      inputSchema: z.object({}),
      execute: async () => {
        const today = new Date().toISOString().split("T")[0];
        const dayName = new Date()
          .toLocaleDateString("en-US", { weekday: "short" })
          .toLowerCase();

        const routines = agent.sql<{
          name: string;
          type: string;
          scheduled_time: string | null;
          description: string | null;
        }>`SELECT name, type, scheduled_time, description FROM routines
           WHERE active = 1
           AND (days = 'daily' OR days LIKE ${"%" + dayName + "%"} OR days = ${today})`;

        const meds = agent.sql<{
          name: string;
          dosage: string | null;
          scheduled_times: string;
          instructions: string | null;
        }>`SELECT name, dosage, scheduled_times, instructions FROM medications WHERE active = 1`;

        return { routines, medications: meds };
      }
    }),

    getProfile: tool({
      description:
        "Get the user's profile: name, age, city, timezone, and notes. Call when asked about identity or personal details.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = agent.sql<{
          name: string;
          age: number | null;
          city: string;
          timezone: string;
          notes: string | null;
        }>`SELECT name, age, city, timezone, notes FROM profile LIMIT 1`;
        if (rows.length === 0) {
          return {
            found: false,
            message: "I don't have a profile set up yet."
          };
        }
        return { found: true, ...rows[0] };
      }
    }),

    getMedications: tool({
      description: "Get the user's medications and today's status for each.",
      inputSchema: z.object({}),
      execute: async () => {
        const today = new Date().toISOString().split("T")[0];
        const results = agent.sql<{
          name: string;
          dosage: string | null;
          scheduled_times: string;
          instructions: string | null;
          prescriber: string | null;
          status: string | null;
        }>`SELECT m.name, m.dosage, m.scheduled_times, m.instructions, m.prescriber, ml.status
           FROM medications m
           LEFT JOIN medication_logs ml
             ON ml.medication_id = m.id AND date(ml.scheduled_for) = ${today}
           WHERE m.active = 1`;
        if (results.length === 0) {
          return { found: false, message: "No medications recorded." };
        }
        return { found: true, medications: results };
      }
    }),

    setReminder: tool({
      description:
        "Set a reminder for the user. Provide datetime (ISO 8601) for one-time reminders, or recurring (days + time) for repeating ones.",
      inputSchema: z.object({
        label: z.string().describe("What to remind about, e.g. 'call John'"),
        datetime: z
          .string()
          .optional()
          .describe(
            "ISO 8601 local datetime for a one-time reminder, e.g. 2026-05-02T15:00:00"
          ),
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
          return {
            error: "Please provide either a date/time or a recurrence pattern."
          };
        }

        const isOnce = !!datetime;
        const type = isOnce ? "once" : "recurring";
        const recurrenceStr =
          !isOnce && recurring
            ? `days:${recurring.days.map((d) => d.slice(0, 3).toLowerCase()).join(",")} time:${recurring.time}`
            : null;

        // INSERT with placeholder — we need the row id before scheduling
        await agent.sql`
          INSERT INTO reminders (label, type, schedule_id, scheduled_for, recurrence)
          VALUES (${label}, ${type}, ${"__pending__"}, ${datetime ?? null}, ${recurrenceStr})`;

        const [row] = agent.sql<{
          id: number;
        }>`SELECT last_insert_rowid() as id`;
        const reminderId = row.id;

        const scheduleArg = isOnce
          ? new Date(datetime as string)
          : recurringToCron(recurring!.days, recurring!.time);

        // oxlint-disable-next-line typescript-eslint/no-explicit-any
        const schedule = (agent as any).schedule(scheduleArg, "reminderFired", {
          reminderId
        });

        await agent.sql`
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
        const rows = agent.sql<{
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
        const rows = agent.sql<{ id: number; schedule_id: string }>`
          SELECT id, schedule_id FROM reminders WHERE id = ${id} AND active = 1`;
        if (rows.length === 0) return "No active reminder found with that ID.";

        // oxlint-disable-next-line typescript-eslint/no-explicit-any
        (agent as any).cancelSchedule(rows[0].schedule_id);
        await agent.sql`UPDATE reminders SET active = 0 WHERE id = ${id}`;
        return `Reminder cancelled.`;
      }
    })
  };
}
