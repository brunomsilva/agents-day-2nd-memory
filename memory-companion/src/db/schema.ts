export const CREATE_PROFILE = `
  CREATE TABLE IF NOT EXISTS profile (
    name           TEXT,
    age            INTEGER,
    city           TEXT,
    timezone       TEXT DEFAULT 'UTC',
    notes          TEXT,
    setup_complete INTEGER DEFAULT 0
  )
`;

export const CREATE_PEOPLE = `
  CREATE TABLE IF NOT EXISTS people (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL,
    relationship      TEXT,
    notes             TEXT,
    phone             TEXT,
    last_mentioned_at TEXT
  )
`;

export const CREATE_EVENTS = `
  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    occurred_on TEXT NOT NULL,
    description TEXT NOT NULL,
    type        TEXT DEFAULT 'event',
    source      TEXT DEFAULT 'user'
  )
`;

export const CREATE_ROUTINES = `
  CREATE TABLE IF NOT EXISTS routines (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    type           TEXT DEFAULT 'routine',
    scheduled_time TEXT,
    days           TEXT,
    description    TEXT,
    active         INTEGER DEFAULT 1
  )
`;

export const CREATE_MEDICATIONS = `
  CREATE TABLE IF NOT EXISTS medications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    dosage          TEXT,
    scheduled_times TEXT NOT NULL,
    instructions    TEXT,
    prescriber      TEXT,
    active          INTEGER DEFAULT 1
  )
`;

export const CREATE_MEDICATION_LOGS = `
  CREATE TABLE IF NOT EXISTS medication_logs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    medication_id  INTEGER NOT NULL,
    scheduled_for  TEXT NOT NULL,
    status         TEXT DEFAULT 'pending',
    responded_at   TEXT,
    source         TEXT DEFAULT 'user'
  )
`;

export const CREATE_CAREGIVER_LINKS = `
  CREATE TABLE IF NOT EXISTS caregiver_links (
    caregiver_telegram_id TEXT NOT NULL,
    access_level          TEXT DEFAULT 'write'
  )
`;

export const ALL_TABLES = [
  CREATE_PROFILE,
  CREATE_PEOPLE,
  CREATE_EVENTS,
  CREATE_ROUTINES,
  CREATE_MEDICATIONS,
  CREATE_MEDICATION_LOGS,
  CREATE_CAREGIVER_LINKS,
];
