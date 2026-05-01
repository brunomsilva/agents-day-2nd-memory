import { describe, it, expect, vi } from "vitest";
import { makeExtractionTools } from "../../src/ai/extraction-tools";

describe("makeExtractionTools", () => {
  describe("addPerson", () => {
    it("accepts email and address in the schema", async () => {
      const mockSql = vi.fn().mockReturnValue([]);
      const agent = { sql: mockSql } as any;
      const tools = makeExtractionTools(agent);
      const result = await tools.addPerson.execute!(
        {
          name: "John",
          email: "john@example.com",
          address: "123 Main St"
        },
        {} as any
      );
      expect(result).toEqual({ stored: true });
      const calls = mockSql.mock.calls as [string[]][];
      const sqlWithContact = calls.find((call) => {
        const sql = call[0].join("?");
        return sql.includes("INSERT") || sql.includes("UPDATE");
      });
      expect(sqlWithContact).toBeDefined();
      const sql = sqlWithContact![0].join("?");
      expect(sql).toContain("email");
      expect(sql).toContain("address");
    });

    it("works without email and address", async () => {
      const mockSql = vi.fn().mockReturnValue([]);
      const agent = { sql: mockSql } as any;
      const tools = makeExtractionTools(agent);
      const result = await tools.addPerson.execute!(
        {
          name: "Jane"
        },
        {} as any
      );
      expect(result).toEqual({ stored: true });
    });
  });
});
