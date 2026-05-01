type GroundingMedication = { name: string; dosage: string | null; status: string };
type GroundingRoutine = { name: string; scheduled_time: string | null };
type GroundingEvent = { occurred_on: string; description: string };

export type GroundingCardInput = {
  userName: string;
  city: string;
  dateStr: string;
  timeStr: string;
  todayMedications: GroundingMedication[];
  todayRoutines: GroundingRoutine[];
  todayEvents: GroundingEvent[];
  recentEvents: GroundingEvent[];
};

export function buildGroundingCard(input: GroundingCardInput): string {
  const lines: string[] = [
    `Today is ${input.dateStr}. It's ${input.timeStr}.`,
    `You're at home in ${input.city}.`,
  ];

  if (input.todayMedications.length > 0) {
    lines.push('');
    for (const med of input.todayMedications) {
      const icon = med.status === 'taken' ? '✅' : '💊';
      const dose = med.dosage ? ` (${med.dosage})` : '';
      lines.push(`${icon} ${med.name}${dose}`);
    }
  }

  if (input.todayRoutines.length > 0) {
    lines.push('');
    for (const r of input.todayRoutines) {
      const time = r.scheduled_time ? `${r.scheduled_time} — ` : '';
      lines.push(`📋 ${time}${r.name}`);
    }
  }

  if (input.recentEvents.length > 0) {
    lines.push('', 'Recently:');
    for (const e of input.recentEvents.slice(0, 2)) {
      lines.push(`• ${e.description}`);
    }
  }

  return lines.join('\n').trimEnd();
}
