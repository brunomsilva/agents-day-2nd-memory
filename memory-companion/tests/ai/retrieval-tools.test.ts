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
});
