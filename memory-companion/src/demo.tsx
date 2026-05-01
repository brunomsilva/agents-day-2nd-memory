import { useState, useEffect, useCallback } from "react";
import { useAgent } from "agents/react";
import type { CompanionAgent } from "./server";
import type {
  CompanionState,
  Profile,
  Person,
  Medication,
  Reminder,
  Routine,
  Event,
  WeeklySummaryPayload
} from "./types";
import { Button, Text, Badge, Surface } from "@cloudflare/kumo";
import {
  UserIcon,
  UsersIcon,
  PillIcon,
  ClockIcon,
  SunIcon,
  ChartBarIcon,
  ChatCircleDotsIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  CheckIcon,
  ArrowClockwiseIcon,
  InfoIcon,
  PlayIcon,
  BrainIcon,
  HeartIcon
} from "@phosphor-icons/react";

type DemoStep =
  | "welcome"
  | "profile"
  | "people"
  | "medications"
  | "routines"
  | "briefing"
  | "summary"
  | "chat";

const STEPS: { key: DemoStep; label: string; icon: React.ReactNode }[] = [
  { key: "welcome", label: "Welcome", icon: <InfoIcon size={16} /> },
  { key: "profile", label: "Profile", icon: <UserIcon size={16} /> },
  { key: "people", label: "People", icon: <UsersIcon size={16} /> },
  { key: "medications", label: "Medications", icon: <PillIcon size={16} /> },
  { key: "routines", label: "Routines", icon: <ClockIcon size={16} /> },
  { key: "briefing", label: "Briefing", icon: <SunIcon size={16} /> },
  { key: "summary", label: "Summary", icon: <ChartBarIcon size={16} /> },
  { key: "chat", label: "Chat", icon: <ChatCircleDotsIcon size={16} /> }
];

export function DemoPage() {
  const [connected, setConnected] = useState(false);
  const [step, setStep] = useState<DemoStep>("welcome");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [briefingTriggered, setBriefingTriggered] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [_events, setEvents] = useState<Event[]>([]);
  const [summaryData, setSummaryData] = useState<WeeklySummaryPayload | null>(
    null
  );

  const agent = useAgent<CompanionAgent, CompanionState>({
    agent: "CompanionAgent",
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), [])
  });

  const loadAll = useCallback(async () => {
    if (!connected || !agent.stub) return;
    setLoading(true);
    try {
      const [p, pe, m, r, rt, e, s] = await Promise.all([
        agent.stub.getProfileData(),
        agent.stub.listPeople(),
        agent.stub.listMedications(),
        agent.stub.listReminders(),
        agent.stub.listRoutines(),
        agent.stub.listEvents(10),
        agent.stub.getSummaryData()
      ]);
      setProfile(p);
      setPeople(pe);
      setMedications(m);
      setReminders(r);
      setRoutines(rt);
      setEvents(e);
      setSummaryData(s);
    } catch (err) {
      console.error("Demo load error:", err);
    } finally {
      setLoading(false);
    }
  }, [connected, agent.stub]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const resetDemo = async () => {
    if (!agent.stub) return;
    setResetting(true);
    try {
      await agent.stub.resetDemoData();
      setBriefingTriggered(false);
      await loadAll();
    } finally {
      setResetting(false);
    }
  };

  const triggerBriefing = async () => {
    if (!agent.stub) return;
    setBriefingTriggered(true);
    await agent.stub.triggerMorningBriefing();
  };

  const currentIndex = STEPS.findIndex((s) => s.key === step);
  const goNext = () => {
    if (currentIndex < STEPS.length - 1) setStep(STEPS[currentIndex + 1].key);
  };
  const goBack = () => {
    if (currentIndex > 0) setStep(STEPS[currentIndex - 1].key);
  };

  return (
    <div className="min-h-screen bg-kumo-elevated flex flex-col">
      {/* Header */}
      <header className="bg-kumo-base border-b border-kumo-line px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BrainIcon size={24} className="text-kumo-brand" />
          <div>
            <Text size="lg" bold>
              Memory Companion Demo
            </Text>
            <Text size="sm" variant="secondary">
              Walk through the full experience
            </Text>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={connected ? "success" : "destructive"}>
            {connected ? "Connected" : "Disconnected"}
          </Badge>
          <Button
            variant="secondary"
            size="base"
            icon={<ArrowClockwiseIcon size={16} />}
            onClick={resetDemo}
            disabled={!connected || resetting}
          >
            {resetting ? "Resetting…" : "Reset Demo"}
          </Button>
        </div>
      </header>

      {/* Stepper */}
      <div className="bg-kumo-base border-b border-kumo-line px-6 py-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          {STEPS.map((s, idx) => {
            const active = s.key === step;
            const completed = idx < currentIndex;
            return (
              <button
                key={s.key}
                onClick={() => setStep(s.key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 ${
                  active
                    ? "bg-kumo-brand text-white"
                    : completed
                      ? "bg-kumo-success/10 text-kumo-success"
                      : "bg-kumo-control text-kumo-secondary"
                }`}
              >
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/20 text-xs">
                  {completed ? <CheckIcon size={12} weight="bold" /> : idx + 1}
                </span>
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          {loading && (
            <Text size="base" variant="secondary">
              Loading demo data…
            </Text>
          )}

          {/* ── WELCOME ── */}
          {step === "welcome" && (
            <div className="space-y-6">
              <Surface className="p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <HeartIcon size={32} className="text-kumo-brand" />
                  <Text size="lg" bold>
                    Welcome to Memory Companion
                  </Text>
                </div>
                <Text size="base">
                  Memory Companion is an AI-powered companion for people with
                  early memory decline. It helps patients stay oriented,
                  remember medications, keep track of loved ones, and maintain
                  daily routines.
                </Text>
                <div className="bg-kumo-control rounded-lg p-4 space-y-2">
                  <Text size="base" bold>
                    What you will see in this demo:
                  </Text>
                  <ul className="space-y-2 text-kumo-default">
                    <li className="flex items-start gap-2">
                      <CheckIcon
                        size={16}
                        className="mt-1 text-kumo-success shrink-0"
                      />
                      <span>
                        <strong>Profile Setup</strong> — How a patient profile
                        is configured with name, age, city, and preferences.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckIcon
                        size={16}
                        className="mt-1 text-kumo-success shrink-0"
                      />
                      <span>
                        <strong>People Configuration</strong> — Family members,
                        doctors, and caregivers stored for quick recall.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckIcon
                        size={16}
                        className="mt-1 text-kumo-success shrink-0"
                      />
                      <span>
                        <strong>Medications</strong> — Scheduled medications
                        with dosage, instructions, and prescriber info.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckIcon
                        size={16}
                        className="mt-1 text-kumo-success shrink-0"
                      />
                      <span>
                        <strong>Routines & Reminders</strong> — Daily routines
                        and one-off or recurring reminders.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckIcon
                        size={16}
                        className="mt-1 text-kumo-success shrink-0"
                      />
                      <span>
                        <strong>Morning Briefing</strong> — The proactive daily
                        briefing that orients the patient.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckIcon
                        size={16}
                        className="mt-1 text-kumo-success shrink-0"
                      />
                      <span>
                        <strong>Admin Summary</strong> — The caregiver dashboard
                        view with weekly summaries and insights.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckIcon
                        size={16}
                        className="mt-1 text-kumo-success shrink-0"
                      />
                      <span>
                        <strong>Chat Interface</strong> — The patient-facing
                        conversational UI with memory-grounded responses.
                      </span>
                    </li>
                  </ul>
                </div>
                <Text size="sm" variant="secondary">
                  Tip: Click <strong>Reset Demo</strong> at any time to clear
                  all data and start fresh with seed data.
                </Text>
              </Surface>
            </div>
          )}

          {/* ── PROFILE ── */}
          {step === "profile" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <UserIcon size={20} className="text-kumo-brand" />
                <Text size="lg" bold>
                  Patient Profile
                </Text>
              </div>
              <Text size="base">
                The profile stores core identity facts: name, age, city,
                timezone, and notes. The AI uses only these facts in its system
                prompt — everything else is retrieved from the database via
                tools. This is the anti-hallucination design.
              </Text>
              {profile ? (
                <Surface className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Text size="sm" variant="secondary">
                        Name
                      </Text>
                      <Text size="lg" bold>
                        {profile.name}
                      </Text>
                    </div>
                    <div>
                      <Text size="sm" variant="secondary">
                        Age
                      </Text>
                      <Text size="lg" bold>
                        {profile.age}
                      </Text>
                    </div>
                    <div>
                      <Text size="sm" variant="secondary">
                        City
                      </Text>
                      <Text size="lg" bold>
                        {profile.city}
                      </Text>
                    </div>
                    <div>
                      <Text size="sm" variant="secondary">
                        Timezone
                      </Text>
                      <Text size="lg" bold>
                        {profile.timezone}
                      </Text>
                    </div>
                  </div>
                  <div>
                    <Text size="sm" variant="secondary">
                      Notes
                    </Text>
                    <Text size="base">{profile.notes}</Text>
                  </div>
                  {profile.custom_instructions && (
                    <div>
                      <Text size="sm" variant="secondary">
                        Custom Instructions
                      </Text>
                      <Text size="base">{profile.custom_instructions}</Text>
                    </div>
                  )}
                </Surface>
              ) : (
                <Surface className="p-6">
                  <Text size="base" variant="secondary">
                    No profile loaded. Try clicking Reset Demo to seed data.
                  </Text>
                </Surface>
              )}
            </div>
          )}

          {/* ── PEOPLE ── */}
          {step === "people" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <UsersIcon size={20} className="text-kumo-brand" />
                <Text size="lg" bold>
                  People
                </Text>
              </div>
              <Text size="base">
                The companion remembers important people — family, doctors,
                friends — so the patient can ask "Who is Maria?" or "When did I
                last see Dr. Silva?" Each person includes relationship, contact
                info, and notes.
              </Text>
              {people.length > 0 ? (
                <div className="grid gap-4">
                  {people.map((person) => (
                    <Surface key={person.id} className="p-5 space-y-2">
                      <div className="flex items-center justify-between">
                        <Text size="lg" bold>
                          {person.name}
                        </Text>
                        <Badge variant="secondary">{person.relationship}</Badge>
                      </div>
                      {person.phone && (
                        <Text size="base" variant="secondary">
                          Phone: {person.phone}
                        </Text>
                      )}
                      {person.email && (
                        <Text size="base" variant="secondary">
                          Email: {person.email}
                        </Text>
                      )}
                      {person.address && (
                        <Text size="base" variant="secondary">
                          Address: {person.address}
                        </Text>
                      )}
                      {person.notes && <Text size="base">{person.notes}</Text>}
                    </Surface>
                  ))}
                </div>
              ) : (
                <Surface className="p-6">
                  <Text size="base" variant="secondary">
                    No people configured yet.
                  </Text>
                </Surface>
              )}
            </div>
          )}

          {/* ── MEDICATIONS ── */}
          {step === "medications" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <PillIcon size={20} className="text-kumo-brand" />
                <Text size="lg" bold>
                  Medications
                </Text>
              </div>
              <Text size="base">
                Medications are stored with name, dosage, scheduled times,
                instructions, and prescriber. The agent creates per-medication
                cron schedules and sends reminders at the right times, followed
                by a 45-minute follow-up if the patient does not respond.
              </Text>
              {medications.length > 0 ? (
                <div className="grid gap-4">
                  {medications.map((med) => (
                    <Surface key={med.id} className="p-5 space-y-2">
                      <div className="flex items-center justify-between">
                        <Text size="lg" bold>
                          {med.name}
                        </Text>
                        <Badge
                          variant={med.active === 1 ? "success" : "secondary"}
                        >
                          {med.active === 1 ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Text size="sm" variant="secondary">
                            Dosage
                          </Text>
                          <Text size="base">{med.dosage}</Text>
                        </div>
                        <div>
                          <Text size="sm" variant="secondary">
                            Times
                          </Text>
                          <Text size="base">{med.scheduled_times}</Text>
                        </div>
                        <div>
                          <Text size="sm" variant="secondary">
                            Instructions
                          </Text>
                          <Text size="base">{med.instructions}</Text>
                        </div>
                        <div>
                          <Text size="sm" variant="secondary">
                            Prescriber
                          </Text>
                          <Text size="base">{med.prescriber}</Text>
                        </div>
                      </div>
                    </Surface>
                  ))}
                </div>
              ) : (
                <Surface className="p-6">
                  <Text size="base" variant="secondary">
                    No medications configured yet.
                  </Text>
                </Surface>
              )}
            </div>
          )}

          {/* ── ROUTINES & REMINDERS ── */}
          {step === "routines" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <ClockIcon size={20} className="text-kumo-brand" />
                <Text size="lg" bold>
                  Routines & Reminders
                </Text>
              </div>
              <Text size="base">
                Routines are recurring daily activities (walks, meals,
                appointments). Reminders can be one-off or recurring and appear
                as actionable notifications with acknowledgment buttons.
              </Text>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Text size="lg" bold>
                    Routines
                  </Text>
                  {routines.length > 0 ? (
                    routines.map((rt) => (
                      <Surface key={rt.id} className="p-4 space-y-1">
                        <div className="flex items-center justify-between">
                          <Text size="base" bold>
                            {rt.name}
                          </Text>
                          <Badge
                            variant={rt.active === 1 ? "success" : "secondary"}
                          >
                            {rt.active === 1 ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <Text size="sm" variant="secondary">
                          {rt.scheduled_time} · {rt.days || "daily"}
                        </Text>
                        {rt.description && (
                          <Text size="sm">{rt.description}</Text>
                        )}
                      </Surface>
                    ))
                  ) : (
                    <Surface className="p-4">
                      <Text size="sm" variant="secondary">
                        No routines configured.
                      </Text>
                    </Surface>
                  )}
                </div>

                <div className="space-y-3">
                  <Text size="lg" bold>
                    Reminders
                  </Text>
                  {reminders.length > 0 ? (
                    reminders.map((rm) => (
                      <Surface key={rm.id} className="p-4 space-y-1">
                        <div className="flex items-center justify-between">
                          <Text size="base" bold>
                            {rm.label}
                          </Text>
                          <Badge
                            variant={rm.active === 1 ? "success" : "secondary"}
                          >
                            {rm.active === 1 ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <Text size="sm" variant="secondary">
                          {rm.type === "once"
                            ? `Once at ${rm.scheduled_for}`
                            : `Recurring: ${rm.recurrence}`}
                        </Text>
                      </Surface>
                    ))
                  ) : (
                    <Surface className="p-4">
                      <Text size="sm" variant="secondary">
                        No reminders configured.
                      </Text>
                    </Surface>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── BRIEFING ── */}
          {step === "briefing" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <SunIcon size={20} className="text-kumo-brand" />
                <Text size="lg" bold>
                  Morning Briefing
                </Text>
              </div>
              <Text size="base">
                Every morning the companion sends a proactive briefing that
                includes: the current date, weather context, today's schedule,
                medication reminders, and a gentle mood check. This orients the
                patient before they even ask.
              </Text>
              <Surface className="p-6 space-y-4">
                {!briefingTriggered ? (
                  <>
                    <Text size="base">
                      Press the button below to simulate the morning briefing
                      being triggered. In production this runs automatically via
                      cron at the patient's wake-up time.
                    </Text>
                    <Button
                      variant="primary"
                      size="base"
                      icon={<PlayIcon size={18} />}
                      onClick={triggerBriefing}
                      disabled={!connected}
                    >
                      Trigger Morning Briefing
                    </Button>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-kumo-success">
                      <CheckIcon size={20} weight="bold" />
                      <Text size="base" bold>
                        Briefing triggered!
                      </Text>
                    </div>
                    <Text size="base">
                      The briefing has been sent to the patient. In the Chat
                      view, the patient would see a notification card with
                      today's grounding information and a mood-check question
                      such as:
                    </Text>
                    <Surface className="bg-purple-50 dark:bg-purple-950/30 p-5 rounded-[20px] border border-purple-200 dark:border-purple-800">
                      <div className="whitespace-pre-line">
                        <Text size="base">
                          {`Good morning, Jane! Today is ${new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.

Your schedule today:
• Morning walk at 07:00
• Lunch with Maria at 12:30

Medications:
• Lisinopril 10mg at 08:00
• Metformin 500mg at 08:00 and 20:00

How are you feeling this morning?`}
                        </Text>
                      </div>
                    </Surface>
                    <Text size="sm" variant="secondary">
                      The patient can reply with their mood, and the companion
                      stores it as an event for later retrieval by caregivers.
                    </Text>
                  </div>
                )}
              </Surface>
            </div>
          )}

          {/* ── SUMMARY ── */}
          {step === "summary" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <ChartBarIcon size={20} className="text-kumo-brand" />
                <Text size="lg" bold>
                  Admin Summary
                </Text>
              </div>
              <Text size="base">
                The caregiver admin dashboard provides a weekly summary of the
                patient's wellbeing: mood trends, medication adherence, recent
                events, and routine completion.
              </Text>
              {summaryData ? (
                <div className="grid md:grid-cols-2 gap-4">
                  <Surface className="p-5 space-y-3">
                    <Text size="lg" bold>
                      Moods
                    </Text>
                    {summaryData.moods.length > 0 ? (
                      <ul className="space-y-1">
                        {summaryData.moods.map((m, i) => (
                          <li key={i} className="text-base text-kumo-default">
                            • {m.date}: {m.mood}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Text size="sm" variant="secondary">
                        No mood entries this week.
                      </Text>
                    )}
                  </Surface>
                  <Surface className="p-5 space-y-3">
                    <Text size="lg" bold>
                      Medication Adherence
                    </Text>
                    {summaryData.medicationAdherence.length > 0 ? (
                      <ul className="space-y-1">
                        {summaryData.medicationAdherence.map((med, i) => (
                          <li key={i} className="text-base text-kumo-default">
                            • {med.name}: {med.taken}/{med.total} taken
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Text size="sm" variant="secondary">
                        No medication data this week.
                      </Text>
                    )}
                  </Surface>
                  <Surface className="p-5 space-y-3">
                    <Text size="lg" bold>
                      Recent Events
                    </Text>
                    {summaryData.events.length > 0 ? (
                      <ul className="space-y-1">
                        {summaryData.events.map((ev, i) => (
                          <li key={i} className="text-base text-kumo-default">
                            • {ev.occurred_on}: {ev.description}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Text size="sm" variant="secondary">
                        No recent events.
                      </Text>
                    )}
                  </Surface>
                  <Surface className="p-5 space-y-3">
                    <Text size="lg" bold>
                      Help Requests
                    </Text>
                    <Text size="base">
                      {summaryData.helpRequests} this week
                    </Text>
                  </Surface>
                  <Surface className="p-5 space-y-3 md:col-span-2">
                    <Text size="lg" bold>
                      Weekly Overview
                    </Text>
                    <Text size="sm" variant="secondary">
                      {summaryData.weekStart} to {summaryData.weekEnd}
                    </Text>
                    <Text size="base">Patient: {summaryData.profileName}</Text>
                  </Surface>
                </div>
              ) : (
                <Surface className="p-6">
                  <Text size="base" variant="secondary">
                    No summary data available. Try Reset Demo to seed data.
                  </Text>
                </Surface>
              )}
            </div>
          )}

          {/* ── CHAT ── */}
          {step === "chat" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <ChatCircleDotsIcon size={20} className="text-kumo-brand" />
                <Text size="lg" bold>
                  Chat Interface
                </Text>
              </div>
              <Text size="base">
                The patient-facing chat is the heart of Memory Companion. Every
                message triggers two parallel AI calls: one for the chat
                response, and one for silent memory extraction. Facts are never
                hallucinated — they are retrieved from SQLite via tools.
              </Text>
              <Surface className="p-6 space-y-4">
                <div className="bg-kumo-control rounded-lg p-4 space-y-3">
                  <Text size="base" bold>
                    Example conversation (grounded by tools):
                  </Text>
                  <div className="space-y-2">
                    <div className="flex justify-end">
                      <div className="bg-kumo-contrast text-kumo-inverse px-4 py-2.5 rounded-2xl rounded-br-md max-w-[80%]">
                        What's today?
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="bg-kumo-base text-kumo-default px-4 py-2.5 rounded-2xl rounded-bl-md max-w-[80%]">
                        Today is{" "}
                        {new Date().toLocaleDateString("en-GB", {
                          weekday: "long",
                          month: "long",
                          day: "numeric"
                        })}
                        . Your morning walk is at 07:00, and lunch with Maria is
                        at 12:30.
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <div className="bg-kumo-contrast text-kumo-inverse px-4 py-2.5 rounded-2xl rounded-br-md max-w-[80%]">
                        Who is Dr. Silva?
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="bg-kumo-base text-kumo-default px-4 py-2.5 rounded-2xl rounded-bl-md max-w-[80%]">
                        Dr. Ana Silva is your family physician at Centro de
                        Saúde Porto. You can reach her at +351 220 000 001 or
                        dr.silva@csporto.pt.
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <div className="bg-kumo-contrast text-kumo-inverse px-4 py-2.5 rounded-2xl rounded-br-md max-w-[80%]">
                        What medications do I take?
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="bg-kumo-base text-kumo-default px-4 py-2.5 rounded-2xl rounded-bl-md max-w-[80%]">
                        You take Lisinopril 10mg at 08:00 with breakfast, and
                        Metformin 500mg at 08:00 and 20:00 with meals. Both were
                        prescribed by Dr. Ana Silva.
                      </div>
                    </div>
                  </div>
                </div>
                <Text size="sm" variant="secondary">
                  Switch to the <strong>Chat</strong> tab (top-right) to try the
                  real conversation with the live agent. Ask questions about
                  people, medications, routines, or events — every answer is
                  retrieved from the database, never guessed.
                </Text>
              </Surface>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex justify-between pt-4">
            <Button
              variant="secondary"
              size="base"
              icon={<ArrowLeftIcon size={16} />}
              onClick={goBack}
              disabled={currentIndex === 0}
            >
              Previous
            </Button>
            <Button
              variant="primary"
              size="base"
              icon={<ArrowRightIcon size={16} />}
              onClick={goNext}
              disabled={currentIndex === STEPS.length - 1}
            >
              Next
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
