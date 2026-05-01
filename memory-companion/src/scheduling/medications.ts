import type { Medication } from "../types";

export function parseMedicationTimes(scheduled_times: string): string[] {
  return scheduled_times
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function buildMedicationReminderText(med: Medication): string {
  const dose = med.dosage ? ` (${med.dosage})` : "";
  const prescriber = med.prescriber
    ? ` Dr. ${med.prescriber} prescribed this.`
    : "";
  const instruction = med.instructions ? `\n${med.instructions}.` : "";
  return `Time for your ${med.name}${dose}. 💊${prescriber}${instruction}`;
}

export function buildMedicationFollowUpText(medName: string): string {
  return `Just checking in — did you get a chance to take your ${medName}? No rush, just want to make sure you're okay.`;
}
