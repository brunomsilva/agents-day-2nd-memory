import { tool } from "ai";
import { z } from "zod";
import type { AIChatAgent } from "@cloudflare/ai-chat";
import type { CompanionState } from "../types";

export function makeExtractionTools(agent: AIChatAgent<Env, CompanionState>) {
  return {
    addPerson: tool({
      description: "Store a new person the user mentioned.",
      inputSchema: z.object({
        name: z.string(),
        relationship: z.string().optional(),
        notes: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        address: z.string().optional()
      }),
      execute: async ({ name, relationship, notes, phone, email, address }) => {
        const existing = agent.sql<{ id: number }>`
          SELECT id FROM people WHERE name = ${name} LIMIT 1`;
        if (existing.length > 0) {
          await agent.sql`UPDATE people
                          SET relationship = ${relationship ?? null},
                              notes = ${notes ?? null},
                              phone = ${phone ?? null},
                              email = ${email ?? null},
                              address = ${address ?? null},
                              last_mentioned_at = datetime('now')
                          WHERE id = ${existing[0].id}`;
        } else {
          await agent.sql`INSERT INTO people (name, relationship, notes, phone, email, address, last_mentioned_at)
                          VALUES (${name}, ${relationship ?? null}, ${notes ?? null}, ${phone ?? null}, ${email ?? null}, ${address ?? null}, datetime('now'))`;
        }
        return { stored: true };
      }
    }),

    addEvent: tool({
      description: "Log something that happened.",
      inputSchema: z.object({
        description: z.string(),
        occurred_on: z
          .string()
          .describe("ISO date YYYY-MM-DD, default to today if not specified")
      }),
      execute: async ({ description, occurred_on }) => {
        await agent.sql`INSERT INTO events (occurred_on, description, type, source)
                        VALUES (${occurred_on}, ${description}, 'event', 'user')`;
        return { stored: true };
      }
    }),

    saveProfile: tool({
      description: "Save a profile field: name, city, timezone, age, or notes.",
      inputSchema: z.object({
        field: z.enum(["name", "city", "timezone", "age", "notes"]),
        value: z.string()
      }),
      execute: async ({ field, value }) => {
        const existing = agent.sql<{
          name: string;
        }>`SELECT name FROM profile LIMIT 1`;
        if (existing.length === 0) {
          await agent.sql`INSERT INTO profile (name, city, timezone) VALUES ('', '', 'UTC')`;
        }
        if (field === "name")
          await agent.sql`UPDATE profile SET name = ${value}`;
        else if (field === "city")
          await agent.sql`UPDATE profile SET city = ${value}`;
        else if (field === "timezone")
          await agent.sql`UPDATE profile SET timezone = ${value}`;
        else if (field === "age")
          await agent.sql`UPDATE profile SET age = ${parseInt(value)}`;
        else if (field === "notes")
          await agent.sql`UPDATE profile SET notes = ${value}`;
        return { stored: true };
      }
    }),

    addMedication: tool({
      description: "Store a medication the user takes.",
      inputSchema: z.object({
        name: z.string(),
        dosage: z.string().optional(),
        scheduled_times: z
          .string()
          .describe('Comma-separated times e.g. "08:00" or "08:00,20:00"'),
        instructions: z.string().optional(),
        prescriber: z.string().optional()
      }),
      execute: async ({
        name,
        dosage,
        scheduled_times,
        instructions,
        prescriber
      }) => {
        await agent.sql`INSERT INTO medications (name, dosage, scheduled_times, instructions, prescriber)
                        VALUES (${name}, ${dosage ?? null}, ${scheduled_times}, ${instructions ?? null}, ${prescriber ?? null})`;
        return { stored: true };
      }
    })
  };
}
