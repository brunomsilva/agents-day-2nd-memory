import { describe, it, expect, vi } from "vitest";
import { makeRetrievalTools } from "../../src/ai/retrieval-tools";

describe("makeRetrievalTools", () => {
  describe("lookupPerson", () => {
    it("selects email and address from people", async () => {
      const mockSql = vi.fn().mockReturnValue([]);
      const agent = { sql: mockSql } as any;
      const tools = makeRetrievalTools(agent);
      await tools.lookupPerson.execute!({ name: "John" }, {} as any);
      const sqlParts = mockSql.mock.calls[0][0] as string[];
      const sql = sqlParts.join("?");
      expect(sql).toContain("email");
      expect(sql).toContain("address");
    });

    it("returns email and address when a person is found", async () => {
      const mockSql = vi.fn().mockReturnValue([
        {
          id: 1,
          name: "Maria",
          relationship: "daughter",
          notes: null,
          phone: "+351912345678",
          email: "maria@example.com",
          address: "Rua das Flores, Porto"
        }
      ]);
      const agent = { sql: mockSql } as any;
      const tools = makeRetrievalTools(agent);
      const result = await tools.lookupPerson.execute!(
        { name: "Maria" },
        {} as any
      );
      expect(result).toMatchObject({
        found: true,
        email: "maria@example.com",
        address: "Rua das Flores, Porto"
      });
    });
  });

  describe("getCurrentDateTime", () => {
    it("returns date, time and iso fields", async () => {
      const agent = { sql: vi.fn() } as any;
      const tools = makeRetrievalTools(agent);
      const result = (await tools.getCurrentDateTime.execute!(
        {},
        {} as any
      )) as { date: string; time: string; iso: string };
      expect(result).toHaveProperty("date");
      expect(result).toHaveProperty("time");
      expect(result).toHaveProperty("iso");
      expect(typeof result.date).toBe("string");
      expect(typeof result.time).toBe("string");
      expect(typeof result.iso).toBe("string");
    });
  });

  describe("setReminder", () => {
    it("returns error when neither datetime nor recurring is provided", async () => {
      const mockSql = vi.fn().mockReturnValue([]);
      const mockSchedule = vi.fn().mockReturnValue({ id: "sched-abc" });
      const agent = { sql: mockSql, schedule: mockSchedule } as any;
      const tools = makeRetrievalTools(agent);
      const result = await tools.setReminder.execute!(
        { label: "call John" },
        {} as any
      );
      expect(result).toMatchObject({
        error: expect.stringContaining("date/time or a recurrence")
      });
      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it("schedules a one-time reminder and returns confirmation", async () => {
      const mockSql = vi
        .fn()
        .mockReturnValueOnce([]) // INSERT
        .mockReturnValueOnce([{ id: 7 }]) // SELECT last_insert_rowid
        .mockReturnValueOnce([]); // UPDATE schedule_id
      const mockSchedule = vi.fn().mockReturnValue({ id: "sched-xyz" });
      const agent = { sql: mockSql, schedule: mockSchedule } as any;
      const tools = makeRetrievalTools(agent);
      const result = await tools.setReminder.execute!(
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
      const mockSql = vi
        .fn()
        .mockReturnValueOnce([])
        .mockReturnValueOnce([{ id: 3 }])
        .mockReturnValueOnce([]);
      const mockSchedule = vi.fn().mockReturnValue({ id: "sched-rec" });
      const agent = { sql: mockSql, schedule: mockSchedule } as any;
      const tools = makeRetrievalTools(agent);
      await tools.setReminder.execute!(
        {
          label: "yoga",
          recurring: { days: ["monday", "wednesday"], time: "07:00" }
        },
        {} as any
      );
      const [cronArg] = mockSchedule.mock.calls[0];
      // minute=0, hour=7, any dom, any month, mon=1 wed=3
      expect(cronArg).toBe("0 7 * * 1,3");
    });

    it("prefers datetime over recurring when both are provided", async () => {
      const mockSql = vi
        .fn()
        .mockReturnValueOnce([])
        .mockReturnValueOnce([{ id: 5 }])
        .mockReturnValueOnce([]);
      const mockSchedule = vi.fn().mockReturnValue({ id: "sched-both" });
      const agent = { sql: mockSql, schedule: mockSchedule } as any;
      const tools = makeRetrievalTools(agent);
      await tools.setReminder.execute!(
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
      const result = await tools.listReminders.execute!({}, {} as any);
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
      const result = (await tools.listReminders.execute!(
        {},
        {} as any
      )) as string;
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
      const result = await tools.cancelReminder.execute!({ id: 99 }, {} as any);
      expect(result).toBe("No active reminder found with that ID.");
      expect(mockCancelSchedule).not.toHaveBeenCalled();
    });

    it("calls cancelSchedule with the stored schedule_id and deactivates the row", async () => {
      const mockSql = vi
        .fn()
        .mockReturnValueOnce([{ id: 2, schedule_id: "sched-xyz" }]) // SELECT
        .mockReturnValueOnce([]); // UPDATE active=0
      const mockCancelSchedule = vi.fn();
      const agent = { sql: mockSql, cancelSchedule: mockCancelSchedule } as any;
      const tools = makeRetrievalTools(agent);
      const result = (await tools.cancelReminder.execute!(
        { id: 2 },
        {} as any
      )) as string;
      expect(mockCancelSchedule).toHaveBeenCalledWith("sched-xyz");
      expect(result).toContain("cancel");
    });
  });
});
