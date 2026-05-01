import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { callable } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import {
  streamText,
  generateText,
  convertToModelMessages,
  stepCountIs
} from "ai";
import {
  buildCompanionPrompt,
  buildOnboardingPrompt,
  buildExtractionPrompt
} from "../ai/prompts";
import { makeRetrievalTools } from "../ai/retrieval-tools";
import { makeExtractionTools } from "../ai/extraction-tools";
import { distressCheck, buildHelpResponse } from "../handlers/help";
import { buildGroundingCard } from "../handlers/grounding";
import {
  parseMedicationTimes,
  buildMedicationReminderText,
  buildMedicationFollowUpText
} from "../scheduling/medications";
import { formatWeeklySummary } from "../scheduling/summaries";
import type {
  CompanionState,
  Profile,
  Person,
  Medication,
  Event,
  Routine,
  MedicationLog,
  Reminder,
  WeeklySummaryPayload,
  MedicationAdherence
} from "../types";

export class CompanionAgent extends AIChatAgent<Env, CompanionState> {
  initialState: CompanionState = {
    setupComplete: false,
    onboardingStep: "name",
    notifications: []
  };

  async onStart() {
    await this
      .sql`CREATE TABLE IF NOT EXISTS profile (name TEXT, age INTEGER, city TEXT, timezone TEXT DEFAULT 'UTC', notes TEXT, setup_complete INTEGER DEFAULT 0)`;
    await this
      .sql`CREATE TABLE IF NOT EXISTS people (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, relationship TEXT, notes TEXT, phone TEXT, email TEXT, address TEXT, last_mentioned_at TEXT)`;
    const peopleCols = this.sql<{ name: string }>`PRAGMA table_info(people)`;
    const colSet = new Set(peopleCols.map((c) => c.name));
    if (!colSet.has("email"))
      await this.sql`ALTER TABLE people ADD COLUMN email TEXT`;
    if (!colSet.has("address"))
      await this.sql`ALTER TABLE people ADD COLUMN address TEXT`;
    await this
      .sql`CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, occurred_on TEXT NOT NULL, description TEXT NOT NULL, type TEXT DEFAULT 'event', source TEXT DEFAULT 'user')`;
    await this
      .sql`CREATE TABLE IF NOT EXISTS routines (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT DEFAULT 'routine', scheduled_time TEXT, days TEXT, description TEXT, active INTEGER DEFAULT 1)`;
    await this
      .sql`CREATE TABLE IF NOT EXISTS medications (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, dosage TEXT, scheduled_times TEXT NOT NULL, instructions TEXT, prescriber TEXT, active INTEGER DEFAULT 1)`;
    await this
      .sql`CREATE TABLE IF NOT EXISTS medication_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, medication_id INTEGER NOT NULL, scheduled_for TEXT NOT NULL, status TEXT DEFAULT 'pending', responded_at TEXT, source TEXT DEFAULT 'user')`;
    await this
      .sql`CREATE TABLE IF NOT EXISTS caregiver_links (caregiver_telegram_id TEXT NOT NULL, access_level TEXT DEFAULT 'write')`;
    await this
      .sql`CREATE TABLE IF NOT EXISTS reminders (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL, type TEXT NOT NULL, schedule_id TEXT NOT NULL, scheduled_for TEXT, recurrence TEXT, active INTEGER DEFAULT 1)`;

    const [profile] = this.sql<{ setup_complete: number }>`
      SELECT setup_complete FROM profile LIMIT 1`;
    if (profile?.setup_complete === 1 && !this.state.setupComplete) {
      this.setState({ ...this.state, setupComplete: true });
    }

    const existing = this.getSchedules();
    if (existing.length === 0) {
      this.schedule("0 8 * * *", "morningBriefing", {});
      this.schedule("0 19 * * *", "eveningCheckin", {});
    }

    if (profile?.setup_complete === 1) {
      this.scheduleMedicationReminders();
    }
  }

  async onChatMessage(_onFinish: unknown, _options?: OnChatMessageOptions) {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const model = workersai("@cf/moonshotai/kimi-k2.6");

    const lastMessage = this.messages[this.messages.length - 1];
    const userText =
      lastMessage?.parts
        ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
        ?.map((p) => p.text)
        ?.join("") ?? "";

    if (distressCheck(userText)) {
      const [profile] = this.sql<Profile>`SELECT * FROM profile LIMIT 1`;
      const people = this.sql<Person>`
        SELECT * FROM people
        WHERE relationship IN ('daughter','son','spouse','partner','wife','husband')
        LIMIT 3`;
      await this.sql`INSERT INTO events (occurred_on, description, type, source)
                     VALUES (date('now'), 'Help request triggered', 'help_request', 'system')`;
      return new Response(
        buildHelpResponse(profile?.name ?? "friend", people),
        { headers: { "Content-Type": "text/plain" } }
      );
    }

    if (!this.state.setupComplete) {
      return this.handleOnboardingMessage(userText, model);
    }

    const isGroundingRequest = /what('s| is) today|where am i|what day/i.test(
      userText
    );
    if (isGroundingRequest) {
      const [profile] = this.sql<Profile>`SELECT * FROM profile LIMIT 1`;
      const { meds, routines, recentEvents } = this.buildGroundingData();
      const now = new Date();
      const card = buildGroundingCard({
        userName: profile?.name ?? "",
        city: profile?.city ?? "",
        dateStr: now.toLocaleDateString("en-GB", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric"
        }),
        timeStr: now.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit"
        }),
        todayMedications: meds.map((m) => ({
          name: m.name,
          dosage: m.dosage,
          status: m.status ?? "pending"
        })),
        todayRoutines: routines,
        todayEvents: [],
        recentEvents
      });
      return new Response(card, { headers: { "Content-Type": "text/plain" } });
    }

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
  }

  private buildGroundingData() {
    const todayDate = new Date().toISOString().split("T")[0];
    const dayName = new Date()
      .toLocaleDateString("en-US", { weekday: "short" })
      .toLowerCase();

    const meds = this.sql<{
      name: string;
      dosage: string | null;
      status: string | null;
    }>`
      SELECT m.name, m.dosage, ml.status
      FROM medications m
      LEFT JOIN medication_logs ml
        ON ml.medication_id = m.id AND date(ml.scheduled_for) = ${todayDate}
      WHERE m.active = 1`;

    const routines = this.sql<{ name: string; scheduled_time: string | null }>`
      SELECT name, scheduled_time FROM routines
      WHERE active = 1
      AND (days = 'daily' OR days LIKE ${"%" + dayName + "%"} OR days = ${todayDate})`;

    const recentEvents = this.sql<{ occurred_on: string; description: string }>`
      SELECT occurred_on, description FROM events
      WHERE type = 'event'
      ORDER BY occurred_on DESC LIMIT 2`;

    return { meds, routines, recentEvents };
  }

  private parseTimezone(input: string): string {
    const lower = input.toLowerCase();
    if (lower.includes("lisbon") || lower.includes("portugal"))
      return "Europe/Lisbon";
    if (lower.includes("london") || lower.includes("uk"))
      return "Europe/London";
    if (lower.includes("new york") || lower.includes("eastern"))
      return "America/New_York";
    if (lower.includes("los angeles") || lower.includes("pacific"))
      return "America/Los_Angeles";
    if (input.includes("/")) return input.trim();
    return "UTC";
  }

  private async handleOnboardingMessage(
    userText: string,
    model: ReturnType<ReturnType<typeof createWorkersAI>>
  ): Promise<Response> {
    const step = this.state.onboardingStep;
    const sys = buildOnboardingPrompt();

    switch (step) {
      case "name": {
        if (userText.trim()) {
          const existing = this.sql<{
            name: string;
          }>`SELECT name FROM profile LIMIT 1`;
          if (existing.length === 0) {
            await this
              .sql`INSERT INTO profile (name, city, timezone) VALUES ('', '', 'UTC')`;
          }
          await this.sql`UPDATE profile SET name = ${userText.trim()}`;
          this.setState({ ...this.state, onboardingStep: "city" });
          return streamText({
            model,
            prompt: `The user's name is "${userText.trim()}". Acknowledge warmly, then ask what city they live in.`,
            system: sys
          }).toUIMessageStreamResponse();
        }
        return streamText({
          model,
          prompt: "Greet the user as Mia and ask for their name.",
          system: sys
        }).toUIMessageStreamResponse();
      }

      case "city": {
        await this.sql`UPDATE profile SET city = ${userText.trim()}`;
        this.setState({ ...this.state, onboardingStep: "timezone" });
        return streamText({
          model,
          prompt: `City saved as "${userText.trim()}". Acknowledge, then ask for their timezone. Suggest: Europe/Lisbon, America/New_York, Europe/London.`,
          system: sys
        }).toUIMessageStreamResponse();
      }

      case "timezone": {
        const tz = this.parseTimezone(userText);
        await this.sql`UPDATE profile SET timezone = ${tz}`;
        this.setState({ ...this.state, onboardingStep: "person" });
        return streamText({
          model,
          prompt: `Timezone set to "${tz}". Acknowledge, then ask about one important person in their life — name and relationship.`,
          system: sys
        }).toUIMessageStreamResponse();
      }

      case "person": {
        await generateText({
          model,
          prompt: userText,
          system: buildExtractionPrompt(),
          tools: { addPerson: makeExtractionTools(this).addPerson },
          stopWhen: stepCountIs(2)
        });
        this.setState({ ...this.state, onboardingStep: "medication" });
        return streamText({
          model,
          prompt:
            'Person saved. Acknowledge warmly, then ask if they take any regular medications — name and time of day. They can say "no" to skip.',
          system: sys
        }).toUIMessageStreamResponse();
      }

      case "medication": {
        const skipped = /^(no|none|nope|not really|i don't|i do not)/i.test(
          userText.trim()
        );
        if (!skipped) {
          await generateText({
            model,
            prompt: userText,
            system: buildExtractionPrompt(),
            tools: { addMedication: makeExtractionTools(this).addMedication },
            stopWhen: stepCountIs(2)
          });
        }
        await this.sql`UPDATE profile SET setup_complete = 1`;
        this.setState({
          ...this.state,
          setupComplete: true,
          onboardingStep: "done"
        });
        this.scheduleMedicationReminders();
        return streamText({
          model,
          prompt:
            "Setup complete. Give a warm one-sentence welcome. Let them know they can type anything or ask 'what's today?' to get oriented.",
          system: sys
        }).toUIMessageStreamResponse();
      }

      default:
        return new Response("Setup already complete.", { status: 200 });
    }
  }

  private async extractAndStoreMemory(
    text: string,
    model: ReturnType<ReturnType<typeof createWorkersAI>>
  ) {
    if (!text.trim()) return;
    await generateText({
      model,
      prompt: text,
      system: buildExtractionPrompt(),
      tools: makeExtractionTools(this),
      stopWhen: stepCountIs(3)
    });
  }

  async morningBriefing(_payload: Record<string, never>) {
    const [profile] = this.sql<Profile>`SELECT * FROM profile LIMIT 1`;
    if (!profile?.setup_complete) return;

    const today = new Date();
    const dateStr = today.toLocaleDateString("en-GB", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
    const dayName = today
      .toLocaleDateString("en-US", { weekday: "short" })
      .toLowerCase();
    const todayDate = today.toISOString().split("T")[0];

    const meds = this.sql<{
      name: string;
      dosage: string | null;
      instructions: string | null;
    }>`
      SELECT name, dosage, instructions FROM medications WHERE active = 1`;
    const routines = this.sql<{ name: string; scheduled_time: string | null }>`
      SELECT name, scheduled_time FROM routines
      WHERE active = 1
      AND (days = 'daily' OR days LIKE ${"%" + dayName + "%"} OR days = ${todayDate})`;

    const medLines = meds
      .map(
        (m) =>
          `💊 ${m.name}${m.dosage ? ` (${m.dosage})` : ""}${m.instructions ? " — " + m.instructions : ""}`
      )
      .join("\n");
    const routineLines = routines
      .map(
        (r) => `📋 ${r.scheduled_time ? r.scheduled_time + " — " : ""}${r.name}`
      )
      .join("\n");

    const text = [
      `Good morning, ${profile.name}! 🌅`,
      "",
      `Today is ${dateStr}.`,
      `You're at home in ${profile.city}.`,
      medLines ? "\n" + medLines : "",
      routineLines ? "\n" + routineLines : "",
      "",
      "How are you feeling this morning?"
    ]
      .filter(Boolean)
      .join("\n");

    const notification = {
      id: crypto.randomUUID(),
      type: "briefing" as const,
      text,
      timestamp: new Date().toISOString(),
      actions: [
        { label: "😊 Good", value: "good" },
        { label: "😐 Okay", value: "okay" },
        { label: "😔 Not great", value: "not_great" }
      ]
    };

    this.setState({
      ...this.state,
      notifications: [...this.state.notifications, notification]
    });
  }

  async eveningCheckin(_payload: Record<string, never>) {
    const [profile] = this.sql<Profile>`SELECT * FROM profile LIMIT 1`;
    if (!profile?.setup_complete) return;

    const notification = {
      id: crypto.randomUUID(),
      type: "checkin" as const,
      text: `Good evening, ${profile.name}! How was your day? Is there anything you'd like me to remember?`,
      timestamp: new Date().toISOString(),
      actions: []
    };

    this.setState({
      ...this.state,
      notifications: [...this.state.notifications, notification]
    });
  }

  scheduleMedicationReminders() {
    const meds = this
      .sql<Medication>`SELECT * FROM medications WHERE active = 1`;
    const existing = this.getSchedules();
    // Only check existing medication reminder schedules, not briefing/checkin crons
    const existingMedKeys = new Set(
      existing
        .filter((s) => s.callback === "medicationReminder" && s.type === "cron")
        .map((s) => {
          const p = s.payload as {
            medicationId?: number;
            scheduledTime?: string;
          };
          return `${p.medicationId}:${p.scheduledTime ?? ""}`;
        })
    );

    for (const med of meds) {
      const times = parseMedicationTimes(med.scheduled_times);
      for (const time of times) {
        const key = `${med.id}:${time}`;
        if (!existingMedKeys.has(key)) {
          const [hour, minute] = time.split(":");
          const cron = `${minute} ${hour} * * *`;
          this.schedule(cron, "medicationReminder", {
            medicationId: med.id,
            scheduledTime: time
          });
        }
      }
    }
  }

  async medicationReminder({
    medicationId,
    scheduledTime: _scheduledTime
  }: {
    medicationId: number;
    scheduledTime: string;
  }) {
    const [med] = this
      .sql<Medication>`SELECT * FROM medications WHERE id = ${medicationId} LIMIT 1`;
    if (!med) return;

    const scheduledFor = new Date().toISOString();
    await this
      .sql`INSERT INTO medication_logs (medication_id, scheduled_for, status)
                   VALUES (${medicationId}, ${scheduledFor}, 'pending')`;
    const [logRow] = this.sql<{ id: number }>`SELECT last_insert_rowid() as id`;

    const notification = {
      id: crypto.randomUUID(),
      type: "medication" as const,
      text: buildMedicationReminderText(med),
      timestamp: new Date().toISOString(),
      medicationId,
      logId: logRow?.id,
      actions: [
        { label: "✅ I took it", value: "taken" },
        { label: "⏰ 30 more minutes", value: "later" },
        { label: "❓ Not sure", value: "unsure" }
      ]
    };

    this.setState({
      ...this.state,
      notifications: [...this.state.notifications, notification]
    });

    if (logRow?.id != null) {
      this.schedule(
        new Date(Date.now() + 45 * 60 * 1000),
        "medicationFollowUp",
        { medicationId, logId: logRow.id, notificationId: notification.id }
      );
    }
  }

  async medicationFollowUp({
    medicationId,
    logId,
    notificationId
  }: {
    medicationId: number;
    logId: number;
    notificationId: string;
  }) {
    const [log] = this.sql<{ status: string }>`
      SELECT status FROM medication_logs WHERE id = ${logId} LIMIT 1`;
    if (log?.status !== "pending") return;

    await this
      .sql`UPDATE medication_logs SET status = 'no_response' WHERE id = ${logId}`;

    const [med] = this.sql<{ name: string }>`
      SELECT name FROM medications WHERE id = ${medicationId} LIMIT 1`;
    if (!med) return;

    const followUp = {
      id: crypto.randomUUID(),
      type: "medication" as const,
      text: buildMedicationFollowUpText(med.name),
      timestamp: new Date().toISOString(),
      medicationId,
      actions: [
        { label: "✅ I took it", value: "taken" },
        { label: "❌ I skipped it", value: "skipped" }
      ]
    };

    this.setState({
      ...this.state,
      notifications: [
        ...this.state.notifications.filter((n) => n.id !== notificationId),
        followUp
      ]
    });
  }

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

  @callable()
  async recordMood(mood: string, notificationId: string) {
    await this.sql`INSERT INTO events (occurred_on, description, type, source)
                   VALUES (date('now'), ${`Morning mood: ${mood}`}, 'mood', 'system')`;
    this.setState({
      ...this.state,
      notifications: this.state.notifications.filter(
        (n) => n.id !== notificationId
      )
    });
  }

  @callable()
  async acknowledgeMedication(
    medicationId: number,
    logId: number,
    status: string,
    notificationId: string
  ) {
    if (status === "taken" || status === "skipped") {
      await this.sql`UPDATE medication_logs
                     SET status = ${status}, responded_at = datetime('now')
                     WHERE medication_id = ${medicationId} AND status = 'pending'`;
    } else if (status === "later") {
      this.schedule(
        new Date(Date.now() + 30 * 60 * 1000),
        "medicationReminder",
        { medicationId, scheduledTime: "" }
      );
    }
    this.setState({
      ...this.state,
      notifications: this.state.notifications.filter(
        (n) => n.id !== notificationId
      )
    });
  }

  @callable()
  async dismissNotification(notificationId: string) {
    this.setState({
      ...this.state,
      notifications: this.state.notifications.filter(
        (n) => n.id !== notificationId
      )
    });
  }

  @callable()
  async triggerMorningBriefing(): Promise<void> {
    await this.morningBriefing({} as Record<string, never>);
  }

  @callable()
  async triggerEveningCheckin(): Promise<void> {
    await this.eveningCheckin({} as Record<string, never>);
  }

  @callable()
  async sendNotification(text: string): Promise<void> {
    const notification = {
      id: crypto.randomUUID(),
      type: "custom" as const,
      text,
      timestamp: new Date().toISOString(),
      actions: []
    };
    this.setState({
      ...this.state,
      notifications: [...this.state.notifications, notification]
    });
  }

  @callable()
  async getWeeklySummary(): Promise<string> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const today = new Date().toISOString().split("T")[0];

    const [profile] = this.sql<{
      name: string;
    }>`SELECT name FROM profile LIMIT 1`;

    const adherenceRows = this.sql<{
      name: string;
      status: string;
      count: number;
    }>`
      SELECT m.name, ml.status, COUNT(*) as count
      FROM medication_logs ml
      JOIN medications m ON m.id = ml.medication_id
      WHERE date(ml.scheduled_for) >= ${weekAgo}
      GROUP BY m.name, ml.status`;

    const medMap: Record<string, MedicationAdherence> = {};
    for (const row of adherenceRows) {
      if (!medMap[row.name]) {
        medMap[row.name] = {
          name: row.name,
          taken: 0,
          skipped: 0,
          no_response: 0,
          total: 0
        };
      }
      const key = row.status as keyof Pick<
        MedicationAdherence,
        "taken" | "skipped" | "no_response"
      >;
      if (key in medMap[row.name]) medMap[row.name][key] += row.count;
      medMap[row.name].total += row.count;
    }

    const moodRows = this.sql<{ description: string; occurred_on: string }>`
      SELECT description, occurred_on FROM events
      WHERE type = 'mood' AND occurred_on >= ${weekAgo}`;
    const moods = moodRows.map((r) => ({
      mood: r.description.replace("Morning mood: ", ""),
      date: r.occurred_on
    }));

    const events = this.sql<Event>`
      SELECT * FROM events
      WHERE type = 'event' AND occurred_on >= ${weekAgo}
      ORDER BY occurred_on`;

    const [helpRow] = this.sql<{ count: number }>`
      SELECT COUNT(*) as count FROM events
      WHERE type = 'help_request' AND occurred_on >= ${weekAgo}`;

    const payload: WeeklySummaryPayload = {
      profileName: profile?.name ?? "User",
      weekStart: weekAgo,
      weekEnd: today,
      medicationAdherence: Object.values(medMap),
      moods,
      events,
      helpRequests: helpRow?.count ?? 0
    };

    return formatWeeklySummary(payload);
  }

  @callable()
  async getSummaryData(): Promise<WeeklySummaryPayload> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const today = new Date().toISOString().split("T")[0];

    const [profile] = this.sql<{
      name: string;
    }>`SELECT name FROM profile LIMIT 1`;

    const adherenceRows = this.sql<{
      name: string;
      status: string;
      count: number;
    }>`
      SELECT m.name, ml.status, COUNT(*) as count
      FROM medication_logs ml
      JOIN medications m ON m.id = ml.medication_id
      WHERE date(ml.scheduled_for) >= ${weekAgo}
      GROUP BY m.name, ml.status`;

    const medMap: Record<string, MedicationAdherence> = {};
    for (const row of adherenceRows) {
      if (!medMap[row.name]) {
        medMap[row.name] = {
          name: row.name,
          taken: 0,
          skipped: 0,
          no_response: 0,
          total: 0
        };
      }
      const key = row.status as keyof Pick<
        MedicationAdherence,
        "taken" | "skipped" | "no_response"
      >;
      if (key in medMap[row.name]) medMap[row.name][key] += row.count;
      medMap[row.name].total += row.count;
    }

    const moodRows = this.sql<{ description: string; occurred_on: string }>`
      SELECT description, occurred_on FROM events
      WHERE type = 'mood' AND occurred_on >= ${weekAgo}`;
    const moods = moodRows.map((r) => ({
      mood: r.description.replace("Morning mood: ", ""),
      date: r.occurred_on
    }));

    const events = this.sql<Event>`
      SELECT * FROM events
      WHERE type = 'event' AND occurred_on >= ${weekAgo}
      ORDER BY occurred_on`;

    const [helpRow] = this.sql<{ count: number }>`
      SELECT COUNT(*) as count FROM events
      WHERE type = 'help_request' AND occurred_on >= ${weekAgo}`;

    return {
      profileName: profile?.name ?? "User",
      weekStart: weekAgo,
      weekEnd: today,
      medicationAdherence: Object.values(medMap),
      moods,
      events,
      helpRequests: helpRow?.count ?? 0
    };
  }

  // ── Admin callable methods ───────────────────────────────────────────

  @callable()
  async getProfileData(): Promise<Profile | null> {
    const [row] = this.sql<Profile>`SELECT * FROM profile LIMIT 1`;
    return row ?? null;
  }

  @callable()
  async saveProfileData(
    data: Partial<Omit<Profile, "setup_complete">>
  ): Promise<void> {
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

  @callable()
  async listPeople(): Promise<Person[]> {
    return [...this.sql<Person>`SELECT * FROM people ORDER BY name`];
  }

  @callable()
  async createPerson(
    data: Omit<Person, "id" | "last_mentioned_at">
  ): Promise<void> {
    await this
      .sql`INSERT INTO people (name, relationship, notes, phone, email, address, last_mentioned_at)
      VALUES (${data.name}, ${data.relationship ?? null}, ${data.notes ?? null}, ${data.phone ?? null}, ${data.email ?? null}, ${data.address ?? null}, datetime('now'))`;
  }

  @callable()
  async updatePersonById(
    id: number,
    data: Partial<Omit<Person, "id">>
  ): Promise<void> {
    if (data.name !== undefined)
      await this.sql`UPDATE people SET name = ${data.name} WHERE id = ${id}`;
    if (data.relationship !== undefined)
      await this
        .sql`UPDATE people SET relationship = ${data.relationship} WHERE id = ${id}`;
    if (data.notes !== undefined)
      await this.sql`UPDATE people SET notes = ${data.notes} WHERE id = ${id}`;
    if (data.phone !== undefined)
      await this.sql`UPDATE people SET phone = ${data.phone} WHERE id = ${id}`;
    if (data.email !== undefined)
      await this.sql`UPDATE people SET email = ${data.email} WHERE id = ${id}`;
    if (data.address !== undefined)
      await this
        .sql`UPDATE people SET address = ${data.address} WHERE id = ${id}`;
  }

  @callable()
  async deletePersonById(id: number): Promise<void> {
    await this.sql`DELETE FROM people WHERE id = ${id}`;
  }

  @callable()
  async listEvents(limit = 50): Promise<Event[]> {
    return [
      ...this
        .sql<Event>`SELECT * FROM events ORDER BY occurred_on DESC LIMIT ${limit}`
    ];
  }

  @callable()
  async createEvent(data: Omit<Event, "id">): Promise<void> {
    await this.sql`INSERT INTO events (occurred_on, description, type, source)
      VALUES (${data.occurred_on}, ${data.description}, ${data.type ?? "event"}, ${data.source ?? "user"})`;
  }

  @callable()
  async deleteEventById(id: number): Promise<void> {
    await this.sql`DELETE FROM events WHERE id = ${id}`;
  }

  @callable()
  async listRoutines(): Promise<Routine[]> {
    return [...this.sql<Routine>`SELECT * FROM routines ORDER BY name`];
  }

  @callable()
  async createRoutine(data: Omit<Routine, "id">): Promise<void> {
    await this
      .sql`INSERT INTO routines (name, type, scheduled_time, days, description, active)
      VALUES (${data.name}, ${data.type ?? "routine"}, ${data.scheduled_time ?? null}, ${data.days ?? null}, ${data.description ?? null}, ${data.active ?? 1})`;
  }

  @callable()
  async updateRoutineById(
    id: number,
    data: Partial<Omit<Routine, "id">>
  ): Promise<void> {
    if (data.name !== undefined)
      await this.sql`UPDATE routines SET name = ${data.name} WHERE id = ${id}`;
    if (data.type !== undefined)
      await this.sql`UPDATE routines SET type = ${data.type} WHERE id = ${id}`;
    if (data.scheduled_time !== undefined)
      await this
        .sql`UPDATE routines SET scheduled_time = ${data.scheduled_time} WHERE id = ${id}`;
    if (data.days !== undefined)
      await this.sql`UPDATE routines SET days = ${data.days} WHERE id = ${id}`;
    if (data.description !== undefined)
      await this
        .sql`UPDATE routines SET description = ${data.description} WHERE id = ${id}`;
    if (data.active !== undefined)
      await this
        .sql`UPDATE routines SET active = ${data.active} WHERE id = ${id}`;
  }

  @callable()
  async deleteRoutineById(id: number): Promise<void> {
    await this.sql`DELETE FROM routines WHERE id = ${id}`;
  }

  @callable()
  async listMedications(): Promise<Medication[]> {
    return [...this.sql<Medication>`SELECT * FROM medications ORDER BY name`];
  }

  @callable()
  async createMedication(data: Omit<Medication, "id">): Promise<void> {
    await this
      .sql`INSERT INTO medications (name, dosage, scheduled_times, instructions, prescriber, active)
      VALUES (${data.name}, ${data.dosage ?? null}, ${data.scheduled_times}, ${data.instructions ?? null}, ${data.prescriber ?? null}, ${data.active ?? 1})`;
    this.scheduleMedicationReminders();
  }

  @callable()
  async updateMedicationById(
    id: number,
    data: Partial<Omit<Medication, "id">>
  ): Promise<void> {
    if (data.name !== undefined)
      await this
        .sql`UPDATE medications SET name = ${data.name} WHERE id = ${id}`;
    if (data.dosage !== undefined)
      await this
        .sql`UPDATE medications SET dosage = ${data.dosage} WHERE id = ${id}`;
    if (data.scheduled_times !== undefined)
      await this
        .sql`UPDATE medications SET scheduled_times = ${data.scheduled_times} WHERE id = ${id}`;
    if (data.instructions !== undefined)
      await this
        .sql`UPDATE medications SET instructions = ${data.instructions} WHERE id = ${id}`;
    if (data.prescriber !== undefined)
      await this
        .sql`UPDATE medications SET prescriber = ${data.prescriber} WHERE id = ${id}`;
    if (data.active !== undefined)
      await this
        .sql`UPDATE medications SET active = ${data.active} WHERE id = ${id}`;
  }

  @callable()
  async deleteMedicationById(id: number): Promise<void> {
    await this.sql`DELETE FROM medications WHERE id = ${id}`;
  }

  @callable()
  async listMedicationLogs(
    limit = 100
  ): Promise<(MedicationLog & { medication_name: string | null })[]> {
    return [
      ...this.sql<MedicationLog & { medication_name: string | null }>`
      SELECT ml.*, m.name as medication_name
      FROM medication_logs ml
      LEFT JOIN medications m ON m.id = ml.medication_id
      ORDER BY ml.scheduled_for DESC
      LIMIT ${limit}`
    ];
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/seed")) {
      // Clear existing data
      await this.sql`DELETE FROM profile`;
      await this.sql`DELETE FROM people`;
      await this.sql`DELETE FROM events`;
      await this.sql`DELETE FROM routines`;
      await this.sql`DELETE FROM medication_logs`;
      await this.sql`DELETE FROM medications`;
      await this.sql`DELETE FROM caregiver_links`;
      await this.sql`DELETE FROM reminders`;

      // Clear medication and reminder schedules (keep briefing/checkin)
      for (const s of this.getSchedules()) {
        if (
          s.callback === "medicationReminder" ||
          s.callback === "medicationFollowUp" ||
          s.callback === "reminderFired"
        ) {
          this.cancelSchedule(s.id);
        }
      }

      // Insert fresh seed data
      await this
        .sql`INSERT INTO profile (name, age, city, timezone, notes, setup_complete)
                     VALUES ('Jane Doe', 78, 'Porto', 'Europe/Lisbon', 'Retired librarian, loves gardening', 1)`;
      await this
        .sql`INSERT INTO people (name, relationship, notes, phone, email, address) VALUES
                     ('John Doe', 'son', 'Lives nearby, visits on weekends', null, null, null)`;
      await this
        .sql`INSERT INTO people (name, relationship, notes, phone, email, address) VALUES
                     ('James Doe', 'father', 'Lives in the countryside', null, null, null)`;
      await this
        .sql`INSERT INTO medications (name, dosage, scheduled_times, instructions, prescriber) VALUES
                     ('Aspirin', '100mg, 1 tablet', '08:00', 'take with breakfast', 'Dr. Smith')`;
      await this
        .sql`INSERT INTO routines (name, type, scheduled_time, days, description) VALUES
                     ('Beach Foz', 'routine', '10:00', 'daily', 'Praia da Foz')`;
      await this
        .sql`INSERT INTO events (occurred_on, description, type, source) VALUES
                     (date('now', '-1 days'), 'John visited for coffee in the afternoon', 'event', 'user')`;
      this.setState({
        ...this.state,
        setupComplete: true,
        onboardingStep: "done",
        notifications: []
      });
      this.scheduleMedicationReminders();
      return new Response("Reseeded", { status: 200 });
    }

    if (url.pathname.endsWith("/briefing")) {
      await this.morningBriefing({} as Record<string, never>);
      return new Response("Briefing triggered", { status: 200 });
    }

    if (url.pathname.endsWith("/summary")) {
      const summary = await this.getWeeklySummary();
      return new Response(summary, { status: 200 });
    }

    return new Response("Not found", { status: 404 });
  }
}
