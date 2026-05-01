import { tool } from "ai";
import { z } from "zod";
import type { AIChatAgent } from "@cloudflare/ai-chat";

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
        }>`SELECT id, name, relationship, notes, phone FROM people
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
    })
  };
}
