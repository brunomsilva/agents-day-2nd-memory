export type OnboardingStep =
  | "name"
  | "city"
  | "timezone"
  | "person"
  | "medication"
  | "done";

export type CompanionState = {
  setupComplete: boolean;
  onboardingStep: OnboardingStep;
  notifications: Notification[];
  summaryScheduleId?: string;
};

export type Notification = {
  id: string;
  type: "briefing" | "medication" | "checkin" | "custom" | "reminder";
  text: string;
  timestamp: string;
  medicationId?: number;
  logId?: number;
  actions: NotificationAction[];
};

export type NotificationAction = {
  label: string;
  value: string;
};

export type Profile = {
  name: string;
  age: number | null;
  city: string;
  timezone: string;
  notes: string | null;
  setup_complete: number;
};

export type Person = {
  id: number;
  name: string;
  relationship: string | null;
  notes: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  last_mentioned_at: string | null;
};

export type Event = {
  id: number;
  occurred_on: string;
  description: string;
  type: "event" | "mood" | "help_request" | "system";
  source: "user" | "caregiver" | "system";
};

export type Routine = {
  id: number;
  name: string;
  type: "routine" | "appointment" | "task";
  scheduled_time: string | null;
  days: string | null;
  description: string | null;
  active: number;
};

export type Medication = {
  id: number;
  name: string;
  dosage: string | null;
  scheduled_times: string;
  instructions: string | null;
  prescriber: string | null;
  active: number;
};

export type MedicationLog = {
  id: number;
  medication_id: number;
  scheduled_for: string;
  status: "taken" | "skipped" | "pending" | "no_response";
  responded_at: string | null;
  source: "user" | "caregiver";
};

export type WeeklySummaryPayload = {
  profileName: string;
  weekStart: string;
  weekEnd: string;
  medicationAdherence: MedicationAdherence[];
  moods: string[];
  events: Event[];
  helpRequests: number;
};

export type MedicationAdherence = {
  name: string;
  taken: number;
  skipped: number;
  no_response: number;
  total: number;
};

export type Reminder = {
  id: number;
  label: string;
  type: "once" | "recurring";
  schedule_id: string;
  scheduled_for: string | null;
  recurrence: string | null;
  active: number;
};
