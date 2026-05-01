import type { WeeklySummaryPayload } from "../types";

export function formatWeeklySummary(payload: WeeklySummaryPayload): string {
  const lines = [
    `📋 Weekly summary for ${payload.profileName}`,
    `${payload.weekStart} to ${payload.weekEnd}`,
    ""
  ];

  if (payload.medicationAdherence.length > 0) {
    lines.push("💊 Medications");
    for (const med of payload.medicationAdherence) {
      const missed =
        med.no_response > 0 ? ` — missed ${med.no_response} day(s)` : " ✅";
      lines.push(`• ${med.name}: took ${med.taken}/${med.total}${missed}`);
    }
    lines.push("");
  }

  if (payload.moods.length > 0) {
    const moodCounts = payload.moods.reduce<Record<string, number>>(
      (acc, m) => {
        acc[m.mood] = (acc[m.mood] ?? 0) + 1;
        return acc;
      },
      {}
    );
    const moodStr = Object.entries(moodCounts)
      .map(([mood, count]) => `${mood} (${count}x)`)
      .join(", ");
    lines.push("😊 Mood check-ins");
    lines.push(`• ${moodStr}`);
    lines.push("");
  }

  if (payload.events.length > 0) {
    lines.push("📅 This week");
    for (const e of payload.events) {
      lines.push(`• ${e.occurred_on}: ${e.description}`);
    }
    lines.push("");
  }

  if (payload.helpRequests > 0) {
    lines.push(`🆘 Help requests: ${payload.helpRequests}`);
  }

  return lines.join("\n").trimEnd();
}
