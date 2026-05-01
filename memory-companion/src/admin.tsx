import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useAgent } from "agents/react";
import type { CompanionAgent } from "./server";
import type {
  CompanionState,
  Profile,
  Person,
  Event,
  Routine,
  Medication,
  MedicationLog,
  WeeklySummaryPayload,
  Notification,
  Reminder
} from "./types";
import { Badge, Button, Surface, Text, Input, Select } from "@cloudflare/kumo";
import {
  UserIcon,
  UsersIcon,
  CalendarIcon,
  ClockIcon,
  PillIcon,
  ClipboardTextIcon,
  PlusIcon,
  PencilSimpleIcon,
  TrashIcon,
  CheckIcon,
  XIcon,
  ArrowClockwiseIcon,
  PaperPlaneRightIcon,
  ChartBarIcon,
  BellIcon,
  SunIcon,
  MoonIcon,
  MegaphoneIcon,
  TrendUpIcon,
  AlarmIcon,
  PlayIcon
} from "@phosphor-icons/react";

type Tab =
  | "profile"
  | "people"
  | "events"
  | "routines"
  | "medications"
  | "medlogs"
  | "reminders"
  | "actions"
  | "summary"
  | "notifications";

const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
  { key: "profile", label: "Profile", icon: <UserIcon size={14} /> },
  { key: "people", label: "People", icon: <UsersIcon size={14} /> },
  { key: "events", label: "Events", icon: <CalendarIcon size={14} /> },
  { key: "routines", label: "Routines", icon: <ClockIcon size={14} /> },
  { key: "medications", label: "Medications", icon: <PillIcon size={14} /> },
  { key: "medlogs", label: "Med Logs", icon: <ClipboardTextIcon size={14} /> },
  { key: "reminders", label: "Reminders", icon: <AlarmIcon size={14} /> },
  { key: "actions", label: "Actions", icon: <PaperPlaneRightIcon size={14} /> },
  { key: "summary", label: "Summary", icon: <ChartBarIcon size={14} /> },
  { key: "notifications", label: "Notifications", icon: <BellIcon size={14} /> }
];

function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("theme:caretaker");
    if (stored === "dark" || stored === "light") {
      return stored === "dark";
    }
    return document.documentElement.getAttribute("data-mode") === "dark";
  });

  const toggle = useCallback(() => {
    const next = !dark;
    setDark(next);
    const mode = next ? "dark" : "light";
    document.documentElement.setAttribute("data-mode", mode);
    document.documentElement.style.colorScheme = mode;
    localStorage.setItem("theme:caretaker", mode);
  }, [dark]);

  return (
    <Button
      variant="secondary"
      size="base"
      icon={dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
      onClick={toggle}
      aria-label="Toggle theme"
      className="w-full justify-start"
    >
      {dark ? "Light mode" : "Dark mode"}
    </Button>
  );
}

export function AdminDashboard() {
  const [connected, setConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [loading, setLoading] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [medLogs, setMedLogs] = useState<
    (MedicationLog & { medication_name: string | null })[]
  >([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  const [summaryData, setSummaryData] = useState<WeeklySummaryPayload | null>(
    null
  );
  const [customNotification, setCustomNotification] = useState("");
  const [sendingAction, setSendingAction] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<
    Record<string, string | number | null>
  >({});

  const [newPerson, setNewPerson] = useState({
    name: "",
    relationship: "",
    notes: "",
    phone: "",
    email: "",
    address: ""
  });
  const [newEvent, setNewEvent] = useState<Omit<Event, "id">>({
    occurred_on: "",
    description: "",
    type: "event",
    source: "user"
  });
  const [newRoutine, setNewRoutine] = useState<Omit<Routine, "id">>({
    name: "",
    type: "routine",
    scheduled_time: "",
    days: "",
    description: "",
    active: 1
  });
  const [newMedication, setNewMedication] = useState<Omit<Medication, "id">>({
    name: "",
    dosage: "",
    scheduled_times: "",
    instructions: "",
    prescriber: "",
    active: 1
  });
  const [newReminder, setNewReminder] = useState<{
    label: string;
    type: "once" | "recurring";
    scheduled_for: string;
    recurrence_days: string;
    recurrence_time: string;
    active: number;
  }>({
    label: "",
    type: "once",
    scheduled_for: "",
    recurrence_days: "",
    recurrence_time: "",
    active: 1
  });

  const agent = useAgent<CompanionAgent, CompanionState>({
    agent: "CompanionAgent",
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), [])
  });

  const loadData = useCallback(async () => {
    if (!connected || !agent.stub) return;
    setLoading(true);
    try {
      switch (activeTab) {
        case "profile": {
          const p = await agent.stub.getProfileData();
          setProfile(p);
          break;
        }
        case "people": {
          const list = await agent.stub.listPeople();
          setPeople(list);
          break;
        }
        case "events": {
          const list = await agent.stub.listEvents();
          setEvents(list);
          break;
        }
        case "routines": {
          const list = await agent.stub.listRoutines();
          setRoutines(list);
          break;
        }
        case "medications": {
          const list = await agent.stub.listMedications();
          setMedications(list);
          break;
        }
        case "medlogs": {
          const list = await agent.stub.listMedicationLogs();
          setMedLogs(list);
          break;
        }
        case "reminders": {
          const list = await agent.stub.listReminders();
          setReminders(list);
          break;
        }
        case "summary": {
          const data = await agent.stub.getSummaryData();
          setSummaryData(data);
          break;
        }
        case "actions":
        case "notifications":
          // No data to load; notifications come from agent.state
          break;
      }
    } catch (e) {
      console.error("Failed to load data:", e);
    } finally {
      setLoading(false);
    }
  }, [connected, activeTab, agent.stub]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveProfile = async () => {
    if (!agent.stub || !profile) return;
    await agent.stub.saveProfileData({
      name: profile.name,
      age: profile.age,
      city: profile.city,
      timezone: profile.timezone,
      notes: profile.notes,
      custom_instructions: profile.custom_instructions
    });
    await loadData();
  };

  const createPerson = async () => {
    if (!agent.stub || !newPerson.name.trim()) return;
    await agent.stub.createPerson({
      name: newPerson.name,
      relationship: newPerson.relationship || null,
      notes: newPerson.notes || null,
      phone: newPerson.phone || null,
      email: newPerson.email || null,
      address: newPerson.address || null
    });
    setNewPerson({
      name: "",
      relationship: "",
      notes: "",
      phone: "",
      email: "",
      address: ""
    });
    await loadData();
  };

  const startEdit = (item: Person | Routine | Medication | Reminder) => {
    setEditingId(item.id);
    setEditForm({ ...item });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const savePersonEdit = async (id: number) => {
    if (!agent.stub) return;
    await agent.stub.updatePersonById(id, {
      name: editForm.name as string,
      relationship: editForm.relationship as string | null,
      notes: editForm.notes as string | null,
      phone: editForm.phone as string | null,
      email: editForm.email as string | null,
      address: editForm.address as string | null
    });
    setEditingId(null);
    await loadData();
  };

  const deletePerson = async (id: number) => {
    if (!agent.stub || !window.confirm("Delete this person?")) return;
    await agent.stub.deletePersonById(id);
    await loadData();
  };

  const createEvent = async () => {
    if (!agent.stub || !newEvent.occurred_on || !newEvent.description) return;
    await agent.stub.createEvent({
      occurred_on: newEvent.occurred_on,
      description: newEvent.description,
      type: newEvent.type,
      source: newEvent.source
    });
    setNewEvent({
      occurred_on: "",
      description: "",
      type: "event",
      source: "user"
    });
    await loadData();
  };

  const deleteEvent = async (id: number) => {
    if (!agent.stub || !window.confirm("Delete this event?")) return;
    await agent.stub.deleteEventById(id);
    await loadData();
  };

  const createRoutine = async () => {
    if (!agent.stub || !newRoutine.name.trim()) return;
    await agent.stub.createRoutine({
      name: newRoutine.name,
      type: newRoutine.type,
      scheduled_time: newRoutine.scheduled_time || null,
      days: newRoutine.days || null,
      description: newRoutine.description || null,
      active: newRoutine.active
    });
    setNewRoutine({
      name: "",
      type: "routine",
      scheduled_time: "",
      days: "",
      description: "",
      active: 1
    });
    await loadData();
  };

  const saveRoutineEdit = async (id: number) => {
    if (!agent.stub) return;
    await agent.stub.updateRoutineById(id, {
      name: editForm.name as string,
      type: editForm.type as Routine["type"],
      scheduled_time: editForm.scheduled_time as string | null,
      days: editForm.days as string | null,
      description: editForm.description as string | null,
      active: editForm.active as number
    });
    setEditingId(null);
    await loadData();
  };

  const deleteRoutine = async (id: number) => {
    if (!agent.stub || !window.confirm("Delete this routine?")) return;
    await agent.stub.deleteRoutineById(id);
    await loadData();
  };

  const createMedication = async () => {
    if (!agent.stub || !newMedication.name.trim()) return;
    await agent.stub.createMedication({
      name: newMedication.name,
      dosage: newMedication.dosage || null,
      scheduled_times: newMedication.scheduled_times,
      instructions: newMedication.instructions || null,
      prescriber: newMedication.prescriber || null,
      active: newMedication.active
    });
    setNewMedication({
      name: "",
      dosage: "",
      scheduled_times: "",
      instructions: "",
      prescriber: "",
      active: 1
    });
    await loadData();
  };

  const saveMedicationEdit = async (id: number) => {
    if (!agent.stub) return;
    await agent.stub.updateMedicationById(id, {
      name: editForm.name as string,
      dosage: editForm.dosage as string | null,
      scheduled_times: editForm.scheduled_times as string,
      instructions: editForm.instructions as string | null,
      prescriber: editForm.prescriber as string | null,
      active: editForm.active as number
    });
    setEditingId(null);
    await loadData();
  };

  const deleteMedication = async (id: number) => {
    if (!agent.stub || !window.confirm("Delete this medication?")) return;
    await agent.stub.deleteMedicationById(id);
    await loadData();
  };

  const createReminder = async () => {
    if (!agent.stub || !newReminder.label.trim()) return;
    const recurrence =
      newReminder.type === "recurring"
        ? `days:${newReminder.recurrence_days
            .split(",")
            .map((d) => d.trim().slice(0, 3).toLowerCase())
            .join(",")} time:${newReminder.recurrence_time}`
        : null;
    await agent.stub.createReminder({
      label: newReminder.label,
      type: newReminder.type,
      scheduled_for: newReminder.scheduled_for || null,
      recurrence
    });
    setNewReminder({
      label: "",
      type: "once",
      scheduled_for: "",
      recurrence_days: "",
      recurrence_time: "",
      active: 1
    });
    await loadData();
  };

  const saveReminderEdit = async (id: number) => {
    if (!agent.stub) return;
    await agent.stub.updateReminderById(id, {
      label: editForm.label as string,
      active: editForm.active as number
    });
    setEditingId(null);
    await loadData();
  };

  const deleteReminder = async (id: number) => {
    if (!agent.stub || !window.confirm("Delete this reminder?")) return;
    await agent.stub.deleteReminderById(id);
    await loadData();
  };

  const triggerReminder = async (id: number) => {
    if (!agent.stub) return;
    await agent.stub.triggerReminder(id);
  };

  const sendBriefing = async () => {
    if (!agent.stub) return;
    setSendingAction("briefing");
    try {
      await agent.stub.triggerMorningBriefing();
    } finally {
      setSendingAction(null);
    }
  };

  const sendCheckin = async () => {
    if (!agent.stub) return;
    setSendingAction("checkin");
    try {
      await agent.stub.triggerEveningCheckin();
    } finally {
      setSendingAction(null);
    }
  };

  const sendCustomNotification = async () => {
    if (!agent.stub || !customNotification.trim()) return;
    setSendingAction("notification");
    try {
      await agent.stub.sendNotification(customNotification.trim());
      setCustomNotification("");
    } finally {
      setSendingAction(null);
    }
  };

  const dismissPatientNotification = async (id: string) => {
    if (!agent.stub) return;
    await agent.stub.dismissNotification(id);
  };

  const renderActiveBadge = (active: number) => (
    <Badge variant={active === 1 ? "success" : "secondary"}>
      {active === 1 ? "Active" : "Inactive"}
    </Badge>
  );

  const renderStatusBadge = (status: MedicationLog["status"]) => {
    const variant: Record<
      string,
      "primary" | "secondary" | "success" | "destructive"
    > = {
      taken: "success",
      skipped: "destructive",
      pending: "primary",
      no_response: "secondary"
    };
    return <Badge variant={variant[status] ?? "secondary"}>{status}</Badge>;
  };

  return (
    <div className="min-h-screen bg-kumo-elevated flex">
      <aside className="w-60 bg-kumo-base border-r border-kumo-line flex flex-col">
        <div className="p-4 border-b border-kumo-line space-y-2">
          <Text size="base" bold>
            Admin Dashboard
          </Text>
          <Badge variant={connected ? "success" : "destructive"}>
            {connected ? "Connected" : "Disconnected"}
          </Badge>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {TABS.map((tab) => (
            <Button
              key={tab.key}
              variant={activeTab === tab.key ? "primary" : "ghost"}
              size="base"
              icon={tab.icon}
              onClick={() => setActiveTab(tab.key)}
              className="w-full justify-start"
            >
              {tab.label}
            </Button>
          ))}
        </nav>
        <div className="p-2 border-t border-kumo-line">
          <ThemeToggle />
        </div>
        <div className="p-2 border-t border-kumo-line text-sm text-kumo-secondary text-center">
          Memory Companion
        </div>
      </aside>

      <main className="flex-1 p-6 overflow-auto">
        <div className="flex justify-end mb-6 gap-2">
          <Button
            variant="secondary"
            size="base"
            icon={<ArrowClockwiseIcon size={14} />}
            onClick={loadData}
            disabled={!connected || loading}
          >
            Refresh
          </Button>
        </div>

        {loading && (
          <Text size="base" variant="secondary">
            Loading...
          </Text>
        )}

        {!loading && activeTab === "profile" && (
          <div className="space-y-4 max-w-xl">
            <Input
              label="Name"
              size="base"
              value={profile?.name ?? ""}
              onChange={(e) =>
                setProfile((p) => (p ? { ...p, name: e.target.value } : null))
              }
            />
            <Input
              label="Age"
              size="base"
              type="number"
              value={profile?.age?.toString() ?? ""}
              onChange={(e) =>
                setProfile((p) =>
                  p
                    ? {
                        ...p,
                        age: e.target.value ? Number(e.target.value) : null
                      }
                    : null
                )
              }
            />
            <Input
              label="City"
              size="base"
              value={profile?.city ?? ""}
              onChange={(e) =>
                setProfile((p) => (p ? { ...p, city: e.target.value } : null))
              }
            />
            <Input
              label="Timezone"
              size="base"
              value={profile?.timezone ?? ""}
              onChange={(e) =>
                setProfile((p) =>
                  p ? { ...p, timezone: e.target.value } : null
                )
              }
            />
            <Input
              label="Notes"
              size="base"
              value={profile?.notes ?? ""}
              onChange={(e) =>
                setProfile((p) => (p ? { ...p, notes: e.target.value } : null))
              }
            />
            <div className="space-y-1">
              <label
                htmlFor="custom-instructions"
                className="text-base text-kumo-secondary"
              >
                Custom Instructions
              </label>
              <textarea
                id="custom-instructions"
                className="w-full min-h-[100px] bg-kumo-elevated border border-kumo-line rounded-md px-3 py-2 text-base text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-accent resize-y"
                value={profile?.custom_instructions ?? ""}
                onChange={(e) =>
                  setProfile((p) =>
                    p ? { ...p, custom_instructions: e.target.value } : null
                  )
                }
              />
            </div>
            <Button
              variant="primary"
              size="base"
              onClick={saveProfile}
              disabled={!connected}
            >
              Save Profile
            </Button>
          </div>
        )}

        {!loading && activeTab === "people" && (
          <div className="space-y-4">
            <div className="grid grid-cols-7 gap-2 items-end">
              <Input
                size="base"
                placeholder="Name"
                value={newPerson.name}
                onChange={(e) =>
                  setNewPerson({ ...newPerson, name: e.target.value })
                }
              />
              <Input
                size="base"
                placeholder="Relationship"
                value={newPerson.relationship}
                onChange={(e) =>
                  setNewPerson({ ...newPerson, relationship: e.target.value })
                }
              />
              <Input
                size="base"
                placeholder="Notes"
                value={newPerson.notes}
                onChange={(e) =>
                  setNewPerson({ ...newPerson, notes: e.target.value })
                }
              />
              <Input
                size="base"
                placeholder="Phone"
                value={newPerson.phone}
                onChange={(e) =>
                  setNewPerson({ ...newPerson, phone: e.target.value })
                }
              />
              <Input
                size="base"
                placeholder="Email"
                value={newPerson.email}
                onChange={(e) =>
                  setNewPerson({ ...newPerson, email: e.target.value })
                }
              />
              <Input
                size="base"
                placeholder="Address"
                value={newPerson.address}
                onChange={(e) =>
                  setNewPerson({ ...newPerson, address: e.target.value })
                }
              />
              <Button
                variant="primary"
                size="base"
                icon={<PlusIcon size={14} />}
                onClick={createPerson}
                disabled={!connected}
              >
                Add
              </Button>
            </div>
            <table className="w-full text-base">
              <thead className="bg-kumo-control text-kumo-default">
                <tr>
                  <th className="text-left px-3 py-2">ID</th>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Relationship</th>
                  <th className="text-left px-3 py-2">Notes</th>
                  <th className="text-left px-3 py-2">Phone</th>
                  <th className="text-left px-3 py-2">Email</th>
                  <th className="text-left px-3 py-2">Address</th>
                  <th className="text-left px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...people]
                  .sort((a, b) => b.id - a.id)
                  .map((p) => (
                    <tr key={p.id} className="border-b border-kumo-line">
                      <td className="px-3 py-2">{p.id}</td>
                      {editingId === p.id ? (
                        <>
                          <td className="px-3 py-2">
                            <Input
                              size="base"
                              value={String(editForm.name ?? "")}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  name: e.target.value
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              size="base"
                              value={String(editForm.relationship ?? "")}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  relationship: e.target.value
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              size="base"
                              value={String(editForm.notes ?? "")}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  notes: e.target.value
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              size="base"
                              value={String(editForm.phone ?? "")}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  phone: e.target.value
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              size="base"
                              value={String(editForm.email ?? "")}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  email: e.target.value
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              size="base"
                              value={String(editForm.address ?? "")}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  address: e.target.value
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2 flex gap-1">
                            <Button
                              variant="primary"
                              size="base"
                              icon={<CheckIcon size={14} />}
                              onClick={() => savePersonEdit(p.id)}
                            />
                            <Button
                              variant="secondary"
                              size="base"
                              icon={<XIcon size={14} />}
                              onClick={cancelEdit}
                            />
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2">{p.name}</td>
                          <td className="px-3 py-2">{p.relationship}</td>
                          <td className="px-3 py-2">{p.notes}</td>
                          <td className="px-3 py-2">{p.phone}</td>
                          <td className="px-3 py-2">{p.email}</td>
                          <td className="px-3 py-2">{p.address}</td>
                          <td className="px-3 py-2 flex gap-1">
                            <Button
                              variant="outline"
                              size="base"
                              icon={<PencilSimpleIcon size={14} />}
                              onClick={() => startEdit(p)}
                            />
                            <Button
                              variant="outline"
                              size="base"
                              icon={<TrashIcon size={14} />}
                              onClick={() => deletePerson(p.id)}
                            />
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && activeTab === "events" && (
          <div className="space-y-4">
            <div className="grid grid-cols-5 gap-2 items-end">
              <Input
                size="base"
                placeholder="Occurred on (YYYY-MM-DD)"
                value={newEvent.occurred_on}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, occurred_on: e.target.value })
                }
              />
              <Input
                size="base"
                placeholder="Description"
                value={newEvent.description}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, description: e.target.value })
                }
              />
              <Select
                size="base"
                aria-label="Type"
                value={newEvent.type}
                onValueChange={(v) =>
                  setNewEvent({ ...newEvent, type: v as Event["type"] })
                }
              >
                <Select.Option value="event">event</Select.Option>
                <Select.Option value="mood">mood</Select.Option>
                <Select.Option value="help_request">help_request</Select.Option>
                <Select.Option value="system">system</Select.Option>
              </Select>
              <Select
                size="base"
                aria-label="Source"
                value={newEvent.source}
                onValueChange={(v) =>
                  setNewEvent({ ...newEvent, source: v as Event["source"] })
                }
              >
                <Select.Option value="user">user</Select.Option>
                <Select.Option value="caregiver">caregiver</Select.Option>
                <Select.Option value="system">system</Select.Option>
              </Select>
              <Button
                variant="primary"
                size="base"
                icon={<PlusIcon size={14} />}
                onClick={createEvent}
                disabled={!connected}
              >
                Add
              </Button>
            </div>
            <table className="w-full text-base">
              <thead className="bg-kumo-control text-kumo-default">
                <tr>
                  <th className="text-left px-3 py-2">ID</th>
                  <th className="text-left px-3 py-2">Occurred On</th>
                  <th className="text-left px-3 py-2">Description</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Source</th>
                  <th className="text-left px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...events]
                  .sort((a, b) => b.id - a.id)
                  .map((ev) => (
                    <tr key={ev.id} className="border-b border-kumo-line">
                      <td className="px-3 py-2">{ev.id}</td>
                      <td className="px-3 py-2">{ev.occurred_on}</td>
                      <td className="px-3 py-2">{ev.description}</td>
                      <td className="px-3 py-2">{ev.type}</td>
                      <td className="px-3 py-2">{ev.source}</td>
                      <td className="px-3 py-2">
                        <Button
                          variant="outline"
                          size="base"
                          icon={<TrashIcon size={14} />}
                          onClick={() => deleteEvent(ev.id)}
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && activeTab === "routines" && (
          <div className="space-y-4">
            <div className="grid grid-cols-7 gap-2 items-end">
              <Input
                size="base"
                placeholder="Name"
                value={newRoutine.name}
                onChange={(e) =>
                  setNewRoutine({ ...newRoutine, name: e.target.value })
                }
              />
              <Select
                size="base"
                aria-label="Type"
                value={newRoutine.type}
                onValueChange={(v) =>
                  setNewRoutine({ ...newRoutine, type: v as Routine["type"] })
                }
              >
                <Select.Option value="routine">routine</Select.Option>
                <Select.Option value="appointment">appointment</Select.Option>
                <Select.Option value="task">task</Select.Option>
              </Select>
              <Input
                size="base"
                placeholder="Time"
                value={newRoutine.scheduled_time ?? ""}
                onChange={(e) =>
                  setNewRoutine({
                    ...newRoutine,
                    scheduled_time: e.target.value
                  })
                }
              />
              <Input
                size="base"
                placeholder="Days"
                value={newRoutine.days ?? ""}
                onChange={(e) =>
                  setNewRoutine({ ...newRoutine, days: e.target.value })
                }
              />
              <Input
                size="base"
                placeholder="Description"
                value={newRoutine.description ?? ""}
                onChange={(e) =>
                  setNewRoutine({ ...newRoutine, description: e.target.value })
                }
              />
              <Select
                size="base"
                aria-label="Active"
                value={String(newRoutine.active)}
                onValueChange={(v) =>
                  setNewRoutine({ ...newRoutine, active: Number(v) })
                }
              >
                <Select.Option value="1">Active</Select.Option>
                <Select.Option value="0">Inactive</Select.Option>
              </Select>
              <Button
                variant="primary"
                size="base"
                icon={<PlusIcon size={14} />}
                onClick={createRoutine}
                disabled={!connected}
              >
                Add
              </Button>
            </div>
            <table className="w-full text-base">
              <thead className="bg-kumo-control text-kumo-default">
                <tr>
                  <th className="text-left px-3 py-2">ID</th>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Time</th>
                  <th className="text-left px-3 py-2">Days</th>
                  <th className="text-left px-3 py-2">Description</th>
                  <th className="text-left px-3 py-2">Active</th>
                  <th className="text-left px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...routines]
                  .sort((a, b) => b.id - a.id)
                  .map((r) => (
                    <tr key={r.id} className="border-b border-kumo-line">
                      <td className="px-3 py-2">{r.id}</td>
                      {editingId === r.id ? (
                        <>
                          <td className="px-3 py-2">
                            <Input
                              size="base"
                              value={String(editForm.name ?? "")}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  name: e.target.value
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Select
                              size="base"
                              aria-label="Type"
                              value={String(editForm.type ?? "routine")}
                              onValueChange={(v) =>
                                setEditForm({
                                  ...editForm,
                                  type: v as Routine["type"]
                                })
                              }
                            >
                              <Select.Option value="routine">
                                routine
                              </Select.Option>
                              <Select.Option value="appointment">
                                appointment
                              </Select.Option>
                              <Select.Option value="task">task</Select.Option>
                            </Select>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              size="base"
                              value={String(editForm.scheduled_time ?? "")}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  scheduled_time: e.target.value
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              size="base"
                              value={String(editForm.days ?? "")}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  days: e.target.value
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              size="base"
                              value={String(editForm.description ?? "")}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  description: e.target.value
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Select
                              size="base"
                              aria-label="Active"
                              value={String(editForm.active ?? 1)}
                              onValueChange={(v) =>
                                setEditForm({ ...editForm, active: Number(v) })
                              }
                            >
                              <Select.Option value="1">Active</Select.Option>
                              <Select.Option value="0">Inactive</Select.Option>
                            </Select>
                          </td>
                          <td className="px-3 py-2 flex gap-1">
                            <Button
                              variant="primary"
                              size="base"
                              icon={<CheckIcon size={14} />}
                              onClick={() => saveRoutineEdit(r.id)}
                            />
                            <Button
                              variant="secondary"
                              size="base"
                              icon={<XIcon size={14} />}
                              onClick={cancelEdit}
                            />
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2">{r.name}</td>
                          <td className="px-3 py-2">{r.type}</td>
                          <td className="px-3 py-2">{r.scheduled_time}</td>
                          <td className="px-3 py-2">{r.days}</td>
                          <td className="px-3 py-2">{r.description}</td>
                          <td className="px-3 py-2">
                            {renderActiveBadge(r.active)}
                          </td>
                          <td className="px-3 py-2 flex gap-1">
                            <Button
                              variant="outline"
                              size="base"
                              icon={<PencilSimpleIcon size={14} />}
                              onClick={() => startEdit(r)}
                            />
                            <Button
                              variant="outline"
                              size="base"
                              icon={<TrashIcon size={14} />}
                              onClick={() => deleteRoutine(r.id)}
                            />
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && activeTab === "medications" && (
          <div className="space-y-4">
            <div className="grid grid-cols-7 gap-2 items-end">
              <Input
                size="base"
                placeholder="Name"
                value={newMedication.name}
                onChange={(e) =>
                  setNewMedication({ ...newMedication, name: e.target.value })
                }
              />
              <Input
                size="base"
                placeholder="Dosage"
                value={newMedication.dosage ?? ""}
                onChange={(e) =>
                  setNewMedication({ ...newMedication, dosage: e.target.value })
                }
              />
              <Input
                size="base"
                placeholder="Times"
                value={newMedication.scheduled_times}
                onChange={(e) =>
                  setNewMedication({
                    ...newMedication,
                    scheduled_times: e.target.value
                  })
                }
              />
              <Input
                size="base"
                placeholder="Instructions"
                value={newMedication.instructions ?? ""}
                onChange={(e) =>
                  setNewMedication({
                    ...newMedication,
                    instructions: e.target.value
                  })
                }
              />
              <Input
                size="base"
                placeholder="Prescriber"
                value={newMedication.prescriber ?? ""}
                onChange={(e) =>
                  setNewMedication({
                    ...newMedication,
                    prescriber: e.target.value
                  })
                }
              />
              <Select
                size="base"
                aria-label="Active"
                value={String(newMedication.active)}
                onValueChange={(v) =>
                  setNewMedication({ ...newMedication, active: Number(v) })
                }
              >
                <Select.Option value="1">Active</Select.Option>
                <Select.Option value="0">Inactive</Select.Option>
              </Select>
              <Button
                variant="primary"
                size="base"
                icon={<PlusIcon size={14} />}
                onClick={createMedication}
                disabled={!connected}
              >
                Add
              </Button>
            </div>
            <table className="w-full text-base">
              <thead className="bg-kumo-control text-kumo-default">
                <tr>
                  <th className="text-left px-3 py-2">ID</th>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Dosage</th>
                  <th className="text-left px-3 py-2">Times</th>
                  <th className="text-left px-3 py-2">Instructions</th>
                  <th className="text-left px-3 py-2">Prescriber</th>
                  <th className="text-left px-3 py-2">Active</th>
                  <th className="text-left px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...medications]
                  .sort((a, b) => b.id - a.id)
                  .map((m) => (
                    <tr key={m.id} className="border-b border-kumo-line">
                      <td className="px-3 py-2">{m.id}</td>
                      {editingId === m.id ? (
                        <>
                          <td className="px-3 py-2">
                            <Input
                              size="base"
                              value={String(editForm.name ?? "")}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  name: e.target.value
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              size="base"
                              value={String(editForm.dosage ?? "")}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  dosage: e.target.value
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              size="base"
                              value={String(editForm.scheduled_times ?? "")}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  scheduled_times: e.target.value
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              size="base"
                              value={String(editForm.instructions ?? "")}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  instructions: e.target.value
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              size="base"
                              value={String(editForm.prescriber ?? "")}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  prescriber: e.target.value
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Select
                              size="base"
                              aria-label="Active"
                              value={String(editForm.active ?? 1)}
                              onValueChange={(v) =>
                                setEditForm({ ...editForm, active: Number(v) })
                              }
                            >
                              <Select.Option value="1">Active</Select.Option>
                              <Select.Option value="0">Inactive</Select.Option>
                            </Select>
                          </td>
                          <td className="px-3 py-2 flex gap-1">
                            <Button
                              variant="primary"
                              size="base"
                              icon={<CheckIcon size={14} />}
                              onClick={() => saveMedicationEdit(m.id)}
                            />
                            <Button
                              variant="secondary"
                              size="base"
                              icon={<XIcon size={14} />}
                              onClick={cancelEdit}
                            />
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2">{m.name}</td>
                          <td className="px-3 py-2">{m.dosage}</td>
                          <td className="px-3 py-2">{m.scheduled_times}</td>
                          <td className="px-3 py-2">{m.instructions}</td>
                          <td className="px-3 py-2">{m.prescriber}</td>
                          <td className="px-3 py-2">
                            {renderActiveBadge(m.active)}
                          </td>
                          <td className="px-3 py-2 flex gap-1">
                            <Button
                              variant="outline"
                              size="base"
                              icon={<PencilSimpleIcon size={14} />}
                              onClick={() => startEdit(m)}
                            />
                            <Button
                              variant="outline"
                              size="base"
                              icon={<TrashIcon size={14} />}
                              onClick={() => deleteMedication(m.id)}
                            />
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && activeTab === "medlogs" && (
          <table className="w-full text-base">
            <thead className="bg-kumo-control text-kumo-default">
              <tr>
                <th className="text-left px-3 py-2">Medication</th>
                <th className="text-left px-3 py-2">Scheduled For</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Responded At</th>
                <th className="text-left px-3 py-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {[...medLogs]
                .sort((a, b) => b.id - a.id)
                .map((ml) => (
                  <tr key={ml.id} className="border-b border-kumo-line">
                    <td className="px-3 py-2">{ml.medication_name}</td>
                    <td className="px-3 py-2">{ml.scheduled_for}</td>
                    <td className="px-3 py-2">
                      {renderStatusBadge(ml.status)}
                    </td>
                    <td className="px-3 py-2">{ml.responded_at}</td>
                    <td className="px-3 py-2">{ml.source}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        {!loading && activeTab === "reminders" && (
          <div className="space-y-4">
            <div className="grid grid-cols-6 gap-2 items-end">
              <Input
                size="base"
                placeholder="Label"
                value={newReminder.label}
                onChange={(e) =>
                  setNewReminder({ ...newReminder, label: e.target.value })
                }
              />
              <Select
                size="base"
                aria-label="Type"
                value={newReminder.type}
                onValueChange={(v) =>
                  setNewReminder({
                    ...newReminder,
                    type: v as "once" | "recurring"
                  })
                }
              >
                <Select.Option value="once">Once</Select.Option>
                <Select.Option value="recurring">Recurring</Select.Option>
              </Select>
              {newReminder.type === "once" ? (
                <Input
                  size="base"
                  type="datetime-local"
                  placeholder="Scheduled for"
                  value={newReminder.scheduled_for}
                  onChange={(e) =>
                    setNewReminder({
                      ...newReminder,
                      scheduled_for: e.target.value
                    })
                  }
                />
              ) : (
                <>
                  <Input
                    size="base"
                    placeholder="Days (e.g. mon,wed,fri)"
                    value={newReminder.recurrence_days}
                    onChange={(e) =>
                      setNewReminder({
                        ...newReminder,
                        recurrence_days: e.target.value
                      })
                    }
                  />
                  <Input
                    size="base"
                    type="time"
                    placeholder="Time"
                    value={newReminder.recurrence_time}
                    onChange={(e) =>
                      setNewReminder({
                        ...newReminder,
                        recurrence_time: e.target.value
                      })
                    }
                  />
                </>
              )}
              <Select
                size="base"
                aria-label="Active"
                value={String(newReminder.active)}
                onValueChange={(v) =>
                  setNewReminder({ ...newReminder, active: Number(v) })
                }
              >
                <Select.Option value="1">Active</Select.Option>
                <Select.Option value="0">Inactive</Select.Option>
              </Select>
              <Button
                variant="primary"
                size="base"
                icon={<PlusIcon size={14} />}
                onClick={createReminder}
                disabled={!connected}
              >
                Add
              </Button>
            </div>
            <table className="w-full text-base">
              <thead className="bg-kumo-control text-kumo-default">
                <tr>
                  <th className="text-left px-3 py-2">ID</th>
                  <th className="text-left px-3 py-2">Label</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Scheduled For</th>
                  <th className="text-left px-3 py-2">Recurrence</th>
                  <th className="text-left px-3 py-2">Active</th>
                  <th className="text-left px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...reminders]
                  .sort((a, b) => b.id - a.id)
                  .map((r) => (
                    <tr key={r.id} className="border-b border-kumo-line">
                      <td className="px-3 py-2">{r.id}</td>
                      {editingId === r.id ? (
                        <>
                          <td className="px-3 py-2">
                            <Input
                              size="base"
                              value={String(editForm.label ?? "")}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  label: e.target.value
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">{r.type}</td>
                          <td className="px-3 py-2">{r.scheduled_for}</td>
                          <td className="px-3 py-2">{r.recurrence}</td>
                          <td className="px-3 py-2">
                            <Select
                              size="base"
                              aria-label="Active"
                              value={String(editForm.active ?? 1)}
                              onValueChange={(v) =>
                                setEditForm({
                                  ...editForm,
                                  active: Number(v)
                                })
                              }
                            >
                              <Select.Option value="1">Active</Select.Option>
                              <Select.Option value="0">Inactive</Select.Option>
                            </Select>
                          </td>
                          <td className="px-3 py-2 flex gap-1">
                            <Button
                              variant="primary"
                              size="base"
                              icon={<CheckIcon size={14} />}
                              onClick={() => saveReminderEdit(r.id)}
                            />
                            <Button
                              variant="secondary"
                              size="base"
                              icon={<XIcon size={14} />}
                              onClick={cancelEdit}
                            />
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2">{r.label}</td>
                          <td className="px-3 py-2">{r.type}</td>
                          <td className="px-3 py-2">{r.scheduled_for}</td>
                          <td className="px-3 py-2">{r.recurrence}</td>
                          <td className="px-3 py-2">
                            {renderActiveBadge(r.active)}
                          </td>
                          <td className="px-3 py-2 flex gap-1">
                            <Button
                              variant="outline"
                              size="base"
                              icon={<PlayIcon size={14} />}
                              onClick={() => triggerReminder(r.id)}
                              disabled={!connected}
                            />
                            <Button
                              variant="outline"
                              size="base"
                              icon={<PencilSimpleIcon size={14} />}
                              onClick={() => startEdit(r)}
                            />
                            <Button
                              variant="outline"
                              size="base"
                              icon={<TrashIcon size={14} />}
                              onClick={() => deleteReminder(r.id)}
                            />
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && activeTab === "actions" && (
          <div className="space-y-6 max-w-xl">
            <div className="space-y-3">
              <Text size="base" bold>
                Scheduled Interactions
              </Text>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="primary"
                  size="base"
                  icon={<SunIcon size={14} />}
                  onClick={sendBriefing}
                  disabled={!connected || sendingAction === "briefing"}
                >
                  {sendingAction === "briefing"
                    ? "Sending..."
                    : "Send Morning Briefing"}
                </Button>
                <Button
                  variant="secondary"
                  size="base"
                  icon={<MoonIcon size={14} />}
                  onClick={sendCheckin}
                  disabled={!connected || sendingAction === "checkin"}
                >
                  {sendingAction === "checkin"
                    ? "Sending..."
                    : "Send Evening Check-in"}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <Text size="base" bold>
                Custom Notification
              </Text>
              <div className="flex gap-2">
                <Input
                  size="base"
                  placeholder="Type a message to send to the patient..."
                  value={customNotification}
                  onChange={(e) => setCustomNotification(e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="primary"
                  size="base"
                  icon={<MegaphoneIcon size={14} />}
                  onClick={sendCustomNotification}
                  disabled={
                    !connected ||
                    !customNotification.trim() ||
                    sendingAction === "notification"
                  }
                >
                  {sendingAction === "notification" ? "Sending..." : "Send"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {!loading && activeTab === "summary" && (
          <div className="space-y-6">
            {summaryData ? (
              <>
                <div className="flex items-center gap-2">
                  <TrendUpIcon size={18} className="text-kumo-brand" />
                  <Text size="base" bold>
                    Weekly Summary for {summaryData.profileName}
                  </Text>
                  <Text size="base" variant="secondary">
                    ({summaryData.weekStart} → {summaryData.weekEnd})
                  </Text>
                </div>

                {summaryData.helpRequests > 0 && (
                  <Surface className="p-4 border-l-4 border-l-kumo-danger">
                    <Text size="base" bold variant="error">
                      ⚠️ {summaryData.helpRequests} help request
                      {summaryData.helpRequests > 1 ? "s" : ""} this week
                    </Text>
                  </Surface>
                )}

                <div className="space-y-3">
                  <Text size="base" bold>
                    Medication Adherence
                  </Text>
                  {summaryData.medicationAdherence.length === 0 && (
                    <Text size="base" variant="secondary">
                      No medication logs for this week.
                    </Text>
                  )}
                  {summaryData.medicationAdherence.map((med) => (
                    <Surface key={med.name} className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Text size="base" bold>
                          {med.name}
                        </Text>
                        <Text size="xs" variant="secondary">
                          {med.taken} taken / {med.skipped} skipped /{" "}
                          {med.no_response} no response
                        </Text>
                      </div>
                      <div className="w-full bg-kumo-line rounded-full h-2.5">
                        <div
                          className="bg-kumo-success h-2.5 rounded-full"
                          style={{
                            width:
                              med.total > 0
                                ? `${(med.taken / med.total) * 100}%`
                                : "0%"
                          }}
                        />
                      </div>
                    </Surface>
                  ))}
                </div>

                <div className="space-y-3">
                  <Text size="base" bold>
                    Moods
                  </Text>
                  {summaryData.moods.length === 0 ? (
                    <Text size="base" variant="secondary">
                      No mood entries this week.
                    </Text>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {summaryData.moods.map((entry, i) => (
                        <Badge key={i} variant="secondary">
                          {entry.mood}{" "}
                          <span className="opacity-60">({entry.date})</span>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <Text size="base" bold>
                    Recent Events
                  </Text>
                  {summaryData.events.length === 0 ? (
                    <Text size="base" variant="secondary">
                      No events recorded this week.
                    </Text>
                  ) : (
                    <div className="space-y-2">
                      {summaryData.events.map((ev) => (
                        <div
                          key={ev.id}
                          className="flex items-start gap-3 text-base border-b border-kumo-line pb-2"
                        >
                          <span className="shrink-0 w-24 text-sm text-kumo-subtle">
                            {ev.occurred_on}
                          </span>
                          <Text size="base">{ev.description}</Text>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Text size="base" variant="secondary">
                No summary data available.
              </Text>
            )}
          </div>
        )}

        {!loading && activeTab === "notifications" && (
          <div className="space-y-4">
            {(agent.state?.notifications?.length ?? 0) === 0 ? (
              <Text size="base" variant="secondary">
                No active notifications for the patient.
              </Text>
            ) : (
              <div className="space-y-3">
                {agent.state!.notifications.map((n: Notification) => (
                  <Surface key={n.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge
                        variant={
                          n.type === "briefing"
                            ? "primary"
                            : n.type === "medication"
                              ? "destructive"
                              : n.type === "checkin"
                                ? "secondary"
                                : "success"
                        }
                      >
                        {n.type}
                      </Badge>
                      <Text size="xs" variant="secondary">
                        {new Date(n.timestamp).toLocaleString()}
                      </Text>
                    </div>
                    <p className="text-base whitespace-pre-line text-kumo-default">
                      {n.text}
                    </p>
                    {n.actions.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {n.actions.map((a) => (
                          <Badge key={a.value} variant="outline">
                            {a.label}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="base"
                        icon={<XIcon size={14} />}
                        onClick={() => dismissPatientNotification(n.id)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </Surface>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
