import type { Person } from "../types";

const DISTRESS_KEYWORDS = [
  "i want to die",
  "i can't go on",
  "i can't do this anymore",
  "i'm in danger",
  "i am in danger",
  "i want to hurt myself",
  "i want to end it",
  "i feel like dying"
];

export function distressCheck(message: string): boolean {
  const lower = message.toLowerCase();
  return DISTRESS_KEYWORDS.some((kw) => lower.includes(kw));
}

export function buildHelpResponse(
  userName: string,
  contacts: Person[]
): string {
  const lines = [
    `I'm here, ${userName}. You're safe.`,
    "",
    "Take a deep breath. You're not alone."
  ];

  const withPhones = contacts.filter((p) => p.phone);
  if (withPhones.length > 0) {
    lines.push("", "People you can call right now:");
    for (const p of withPhones) {
      lines.push(`• ${p.name} (${p.relationship ?? "contact"}): ${p.phone}`);
    }
  }

  lines.push(
    "",
    "If this is an emergency, please call your local emergency services (112 in Portugal, 911 in the US)."
  );

  return lines.join("\n");
}
