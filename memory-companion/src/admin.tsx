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
  MedicationLog
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
  ArrowClockwiseIcon
} from "@phosphor-icons/react";

type Tab =
  | "profile"
  | "people"
  | "events"
  | "routines"
  | "medications"
  | "medlogs";

const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
  { key: "profile", label: "Profile", icon: <UserIcon size={14} /> },
  { key: "people", label: "People", icon: <UsersIcon size={14} /> },
  { key: "events", label: "Events", icon: <CalendarIcon size={14} /> },
  { key: "routines", label: "Routines", icon: <ClockIcon size={14} /> },
  { key: "medications", label: "Medications", icon: <PillIcon size={14} /> },
  { key: "medlogs", label: "Med Logs", icon: <ClipboardTextIcon size={14} /> }
];

export default function AdminDashboard() {
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

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<
    Record<string, string | number | null>
  >({});

  const [newPerson, setNewPerson] = useState({
    name: "",
    relationship: "",
    notes: "",
    phone: ""
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
      notes: profile.notes
    });
    await loadData();
  };

  const createPerson = async () => {
    if (!agent.stub || !newPerson.name.trim()) return;
    await agent.stub.createPerson({
      name: newPerson.name,
      relationship: newPerson.relationship || null,
      notes: newPerson.notes || null,
      phone: newPerson.phone || null
    });
    setNewPerson({ name: "", relationship: "", notes: "", phone: "" });
    await loadData();
  };

  const startEdit = (item: Person | Routine | Medication) => {
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
      phone: editForm.phone as string | null
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
    <div className="min-h-screen bg-kumo-elevated p-6">
      <Surface className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Text size="base" bold>
              Admin Dashboard
            </Text>
            <Badge variant={connected ? "success" : "destructive"}>
              {connected ? "Connected" : "Disconnected"}
            </Badge>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<ArrowClockwiseIcon size={14} />}
            onClick={loadData}
            disabled={!connected || loading}
          >
            Refresh
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map((tab) => (
            <Button
              key={tab.key}
              variant={activeTab === tab.key ? "primary" : "outline"}
              size="sm"
              icon={tab.icon}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {loading && (
          <Text size="sm" variant="secondary">
            Loading...
          </Text>
        )}

        {!loading && activeTab === "profile" && (
          <div className="space-y-4 max-w-xl">
            <Input
              label="Name"
              size="sm"
              value={profile?.name ?? ""}
              onChange={(e) =>
                setProfile((p) => (p ? { ...p, name: e.target.value } : null))
              }
            />
            <Input
              label="Age"
              size="sm"
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
              size="sm"
              value={profile?.city ?? ""}
              onChange={(e) =>
                setProfile((p) => (p ? { ...p, city: e.target.value } : null))
              }
            />
            <Input
              label="Timezone"
              size="sm"
              value={profile?.timezone ?? ""}
              onChange={(e) =>
                setProfile((p) =>
                  p ? { ...p, timezone: e.target.value } : null
                )
              }
            />
            <Input
              label="Notes"
              size="sm"
              value={profile?.notes ?? ""}
              onChange={(e) =>
                setProfile((p) => (p ? { ...p, notes: e.target.value } : null))
              }
            />
            <Button
              variant="primary"
              size="sm"
              onClick={saveProfile}
              disabled={!connected}
            >
              Save Profile
            </Button>
          </div>
        )}

        {!loading && activeTab === "people" && (
          <div className="space-y-4">
            <div className="grid grid-cols-5 gap-2 items-end">
              <Input
                size="sm"
                placeholder="Name"
                value={newPerson.name}
                onChange={(e) =>
                  setNewPerson({ ...newPerson, name: e.target.value })
                }
              />
              <Input
                size="sm"
                placeholder="Relationship"
                value={newPerson.relationship}
                onChange={(e) =>
                  setNewPerson({ ...newPerson, relationship: e.target.value })
                }
              />
              <Input
                size="sm"
                placeholder="Notes"
                value={newPerson.notes}
                onChange={(e) =>
                  setNewPerson({ ...newPerson, notes: e.target.value })
                }
              />
              <Input
                size="sm"
                placeholder="Phone"
                value={newPerson.phone}
                onChange={(e) =>
                  setNewPerson({ ...newPerson, phone: e.target.value })
                }
              />
              <Button
                variant="primary"
                size="sm"
                icon={<PlusIcon size={14} />}
                onClick={createPerson}
                disabled={!connected}
              >
                Add
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-kumo-control text-kumo-default">
                <tr>
                  <th className="text-left px-3 py-2">ID</th>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Relationship</th>
                  <th className="text-left px-3 py-2">Notes</th>
                  <th className="text-left px-3 py-2">Phone</th>
                  <th className="text-left px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="border-b border-kumo-line">
                    <td className="px-3 py-2">{p.id}</td>
                    {editingId === p.id ? (
                      <>
                        <td className="px-3 py-2">
                          <Input
                            size="sm"
                            value={String(editForm.name ?? "")}
                            onChange={(e) =>
                              setEditForm({ ...editForm, name: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            size="sm"
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
                            size="sm"
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
                            size="sm"
                            value={String(editForm.phone ?? "")}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                phone: e.target.value
                              })
                            }
                          />
                        </td>
                        <td className="px-3 py-2 flex gap-1">
                          <Button
                            variant="primary"
                            size="sm"
                            icon={<CheckIcon size={14} />}
                            onClick={() => savePersonEdit(p.id)}
                          />
                          <Button
                            variant="secondary"
                            size="sm"
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
                        <td className="px-3 py-2 flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            icon={<PencilSimpleIcon size={14} />}
                            onClick={() => startEdit(p)}
                          />
                          <Button
                            variant="outline"
                            size="sm"
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
                size="sm"
                placeholder="Occurred on (YYYY-MM-DD)"
                value={newEvent.occurred_on}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, occurred_on: e.target.value })
                }
              />
              <Input
                size="sm"
                placeholder="Description"
                value={newEvent.description}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, description: e.target.value })
                }
              />
              <Select
                size="sm"
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
                size="sm"
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
                size="sm"
                icon={<PlusIcon size={14} />}
                onClick={createEvent}
                disabled={!connected}
              >
                Add
              </Button>
            </div>
            <table className="w-full text-sm">
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
                {events.map((ev) => (
                  <tr key={ev.id} className="border-b border-kumo-line">
                    <td className="px-3 py-2">{ev.id}</td>
                    <td className="px-3 py-2">{ev.occurred_on}</td>
                    <td className="px-3 py-2">{ev.description}</td>
                    <td className="px-3 py-2">{ev.type}</td>
                    <td className="px-3 py-2">{ev.source}</td>
                    <td className="px-3 py-2">
                      <Button
                        variant="outline"
                        size="sm"
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
                size="sm"
                placeholder="Name"
                value={newRoutine.name}
                onChange={(e) =>
                  setNewRoutine({ ...newRoutine, name: e.target.value })
                }
              />
              <Select
                size="sm"
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
                size="sm"
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
                size="sm"
                placeholder="Days"
                value={newRoutine.days ?? ""}
                onChange={(e) =>
                  setNewRoutine({ ...newRoutine, days: e.target.value })
                }
              />
              <Input
                size="sm"
                placeholder="Description"
                value={newRoutine.description ?? ""}
                onChange={(e) =>
                  setNewRoutine({ ...newRoutine, description: e.target.value })
                }
              />
              <Select
                size="sm"
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
                size="sm"
                icon={<PlusIcon size={14} />}
                onClick={createRoutine}
                disabled={!connected}
              >
                Add
              </Button>
            </div>
            <table className="w-full text-sm">
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
                {routines.map((r) => (
                  <tr key={r.id} className="border-b border-kumo-line">
                    <td className="px-3 py-2">{r.id}</td>
                    {editingId === r.id ? (
                      <>
                        <td className="px-3 py-2">
                          <Input
                            size="sm"
                            value={String(editForm.name ?? "")}
                            onChange={(e) =>
                              setEditForm({ ...editForm, name: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            size="sm"
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
                            size="sm"
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
                            size="sm"
                            value={String(editForm.days ?? "")}
                            onChange={(e) =>
                              setEditForm({ ...editForm, days: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            size="sm"
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
                            size="sm"
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
                            size="sm"
                            icon={<CheckIcon size={14} />}
                            onClick={() => saveRoutineEdit(r.id)}
                          />
                          <Button
                            variant="secondary"
                            size="sm"
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
                            size="sm"
                            icon={<PencilSimpleIcon size={14} />}
                            onClick={() => startEdit(r)}
                          />
                          <Button
                            variant="outline"
                            size="sm"
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
                size="sm"
                placeholder="Name"
                value={newMedication.name}
                onChange={(e) =>
                  setNewMedication({ ...newMedication, name: e.target.value })
                }
              />
              <Input
                size="sm"
                placeholder="Dosage"
                value={newMedication.dosage ?? ""}
                onChange={(e) =>
                  setNewMedication({ ...newMedication, dosage: e.target.value })
                }
              />
              <Input
                size="sm"
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
                size="sm"
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
                size="sm"
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
                size="sm"
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
                size="sm"
                icon={<PlusIcon size={14} />}
                onClick={createMedication}
                disabled={!connected}
              >
                Add
              </Button>
            </div>
            <table className="w-full text-sm">
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
                {medications.map((m) => (
                  <tr key={m.id} className="border-b border-kumo-line">
                    <td className="px-3 py-2">{m.id}</td>
                    {editingId === m.id ? (
                      <>
                        <td className="px-3 py-2">
                          <Input
                            size="sm"
                            value={String(editForm.name ?? "")}
                            onChange={(e) =>
                              setEditForm({ ...editForm, name: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            size="sm"
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
                            size="sm"
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
                            size="sm"
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
                            size="sm"
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
                            size="sm"
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
                            size="sm"
                            icon={<CheckIcon size={14} />}
                            onClick={() => saveMedicationEdit(m.id)}
                          />
                          <Button
                            variant="secondary"
                            size="sm"
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
                            size="sm"
                            icon={<PencilSimpleIcon size={14} />}
                            onClick={() => startEdit(m)}
                          />
                          <Button
                            variant="outline"
                            size="sm"
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
          <table className="w-full text-sm">
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
              {medLogs.map((ml) => (
                <tr key={ml.id} className="border-b border-kumo-line">
                  <td className="px-3 py-2">{ml.medication_name}</td>
                  <td className="px-3 py-2">{ml.scheduled_for}</td>
                  <td className="px-3 py-2">{renderStatusBadge(ml.status)}</td>
                  <td className="px-3 py-2">{ml.responded_at}</td>
                  <td className="px-3 py-2">{ml.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Surface>
    </div>
  );
}
