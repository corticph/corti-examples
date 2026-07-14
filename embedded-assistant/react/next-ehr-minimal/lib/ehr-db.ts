import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { seedData } from "@/lib/ehr-data";
import type {
  AppointmentDetail,
  AppointmentSummary,
  ConsultationType,
  DashboardData,
  PatientDetail,
  PatientSummary,
  RecordEntry,
  RecordEntryPayload,
  RecordEntryType,
} from "@/lib/ehr-types";

const DEMO_SCHEMA_VERSION = "record-entries-v3";
const configuredDatabasePath = process.env.EHR_SQLITE_PATH;

if (!configuredDatabasePath) {
  throw new Error(
    "Missing EHR_SQLITE_PATH. Copy .env.example to .env and set the SQLite path.",
  );
}

const databasePath = path.isAbsolute(configuredDatabasePath)
  ? configuredDatabasePath
  : path.join(process.cwd(), configuredDatabasePath);
const dataDirectory = path.dirname(databasePath);

type GlobalWithDb = typeof globalThis & {
  ehrDatabase?: Database.Database;
};

function ensureDatabaseDirectory() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }
}

function computeAge(dob: string) {
  const birthDate = new Date(dob);
  const today = new Date("2026-04-19T12:00:00");
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - birthDate.getUTCMonth();

  if (
    monthDelta < 0 ||
    (monthDelta === 0 && today.getUTCDate() < birthDate.getUTCDate())
  ) {
    age -= 1;
  }

  return age;
}

function initializeSchema(database: Database.Database) {
  database.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS ehr_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      dob TEXT NOT NULL,
      sex TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      address TEXT NOT NULL,
      nhs_number TEXT NOT NULL,
      allergies TEXT NOT NULL,
      chronic_conditions TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      starts_at TEXT NOT NULL,
      clinician TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL,
      consultation_type TEXT NOT NULL,
      FOREIGN KEY(patient_id) REFERENCES patients(id)
    );

    CREATE TABLE IF NOT EXISTS record_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      appointment_id INTEGER,
      interaction_id TEXT,
      entry_type TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      authored_by TEXT NOT NULL,
      source TEXT NOT NULL,
      payload TEXT NOT NULL,
      FOREIGN KEY(patient_id) REFERENCES patients(id),
      FOREIGN KEY(appointment_id) REFERENCES appointments(id)
    );

    CREATE INDEX IF NOT EXISTS idx_record_entries_patient_date
      ON record_entries(patient_id, occurred_at DESC);

    CREATE INDEX IF NOT EXISTS idx_record_entries_patient_type
      ON record_entries(patient_id, entry_type);
  `);
}

function currentSchemaVersion(database: Database.Database) {
  const hasMeta = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ehr_meta'",
    )
    .get();

  if (!hasMeta) {
    return null;
  }

  const row = database
    .prepare("SELECT value FROM ehr_meta WHERE key = 'schema_version'")
    .get() as { value: string } | undefined;

  return row?.value ?? null;
}

function resetDatabase(database: Database.Database) {
  database.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS visits;
    DROP TABLE IF EXISTS record_entries;
    DROP TABLE IF EXISTS appointments;
    DROP TABLE IF EXISTS patients;
    DROP TABLE IF EXISTS ehr_meta;
    PRAGMA foreign_keys = ON;
  `);
}

function ensureCurrentSchema(database: Database.Database) {
  const version = currentSchemaVersion(database);

  if (version !== DEMO_SCHEMA_VERSION) {
    resetDatabase(database);
  }

  initializeSchema(database);
  database
    .prepare(
      "INSERT OR REPLACE INTO ehr_meta (key, value) VALUES ('schema_version', ?)",
    )
    .run(DEMO_SCHEMA_VERSION);
}

function seedDatabase(database: Database.Database) {
  const existingPatientCount = database
    .prepare("SELECT COUNT(*) as count FROM patients")
    .get() as { count: number };

  if (existingPatientCount.count > 0) {
    return;
  }

  const insertPatient = database.prepare(`
    INSERT INTO patients (
      full_name,
      dob,
      sex,
      phone,
      email,
      address,
      nhs_number,
      allergies,
      chronic_conditions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAppointment = database.prepare(`
    INSERT INTO appointments (
      patient_id,
      starts_at,
      clinician,
      reason,
      status,
      consultation_type
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertRecordEntry = database.prepare(`
    INSERT INTO record_entries (
      patient_id,
      appointment_id,
      interaction_id,
      entry_type,
      occurred_at,
      title,
      summary,
      authored_by,
      source,
      payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = database.transaction(() => {
    const patientIds = seedData.patients.map((patient) => {
      const result = insertPatient.run(
        patient.fullName,
        patient.dob,
        patient.sex,
        patient.phone,
        patient.email,
        patient.address,
        patient.nhsNumber,
        patient.allergies,
        patient.chronicConditions,
      );

      return Number(result.lastInsertRowid);
    });

    const appointmentIds = seedData.appointments.map((appointment) => {
      const result = insertAppointment.run(
        patientIds[appointment.patientIndex],
        appointment.startsAt,
        appointment.clinician,
        appointment.reason,
        appointment.status,
        appointment.consultationType,
      );

      return Number(result.lastInsertRowid);
    });

    seedData.recordEntries.forEach((entry) => {
      insertRecordEntry.run(
        patientIds[entry.patientIndex],
        entry.appointmentIndex !== undefined
          ? appointmentIds[entry.appointmentIndex]
          : null,
        entry.interactionId ?? null,
        entry.type,
        entry.occurredAt,
        entry.title,
        entry.summary,
        entry.authoredBy,
        entry.source,
        JSON.stringify(entry.payload),
      );
    });
  });

  transaction();
}

function mapPatientRow(row: {
  id: number;
  full_name: string;
  dob: string;
  sex: string;
  phone: string;
  email: string;
  address: string;
  nhs_number: string;
  allergies: string;
  chronic_conditions: string;
  last_record_at: string | null;
  next_appointment_at: string | null;
}): PatientSummary {
  return {
    id: row.id,
    fullName: row.full_name,
    dob: row.dob,
    age: computeAge(row.dob),
    sex: row.sex,
    phone: row.phone,
    email: row.email,
    address: row.address,
    nhsNumber: row.nhs_number,
    allergies: row.allergies,
    chronicConditions: row.chronic_conditions,
    lastRecordAt: row.last_record_at,
    nextAppointmentAt: row.next_appointment_at,
  };
}

function parsePayload(value: string): RecordEntryPayload {
  try {
    return JSON.parse(value) as RecordEntryPayload;
  } catch {
    return {};
  }
}

function mapRecordEntryRow(row: {
  id: number;
  patient_id: number;
  appointment_id: number | null;
  interaction_id: string | null;
  entry_type: RecordEntryType;
  occurred_at: string;
  title: string;
  summary: string;
  authored_by: string;
  source: string;
  payload: string;
}): RecordEntry {
  return {
    id: row.id,
    patientId: row.patient_id,
    appointmentId: row.appointment_id,
    interactionId: row.interaction_id,
    type: row.entry_type,
    occurredAt: row.occurred_at,
    title: row.title,
    summary: row.summary,
    authoredBy: row.authored_by,
    source: row.source,
    payload: parsePayload(row.payload),
  };
}

function mapAppointmentRow(row: {
  id: number;
  patient_id: number;
  patient_name: string;
  starts_at: string;
  clinician: string;
  reason: string;
  status: AppointmentSummary["status"];
  consultation_type: ConsultationType;
}): AppointmentSummary {
  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    startsAt: row.starts_at,
    clinician: row.clinician,
    reason: row.reason,
    status: row.status,
    consultationType: row.consultation_type,
  };
}

export function getDb() {
  const globalWithDb = globalThis as GlobalWithDb;

  if (!globalWithDb.ehrDatabase) {
    ensureDatabaseDirectory();
    globalWithDb.ehrDatabase = new Database(databasePath);
  }

  ensureCurrentSchema(globalWithDb.ehrDatabase);
  seedDatabase(globalWithDb.ehrDatabase);

  return globalWithDb.ehrDatabase;
}

export function getDashboardData(): DashboardData {
  const db = getDb();
  const totals = {
    patientCount: (
      db.prepare("SELECT COUNT(*) as count FROM patients").get() as {
        count: number;
      }
    ).count,
    upcomingCount: (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM appointments WHERE status IN ('upcoming', 'checked-in')",
        )
        .get() as { count: number }
    ).count,
    recordsThisWeek: (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM record_entries WHERE occurred_at >= '2026-04-12T00:00:00'",
        )
        .get() as { count: number }
    ).count,
    medicationActionsThisMonth: (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM record_entries WHERE entry_type = 'medication' AND occurred_at >= '2026-04-01T00:00:00'",
        )
        .get() as { count: number }
    ).count,
  };

  const recentPatients = db
    .prepare(
      `
      SELECT
        p.id,
        p.full_name,
        p.dob,
        p.sex,
        p.phone,
        p.email,
        p.address,
        p.nhs_number,
        p.allergies,
        p.chronic_conditions,
        MAX(r.occurred_at) as last_record_at,
        MIN(CASE WHEN a.status IN ('upcoming', 'checked-in', 'in-progress') THEN a.starts_at END) as next_appointment_at
      FROM patients p
      LEFT JOIN record_entries r ON r.patient_id = p.id
      LEFT JOIN appointments a ON a.patient_id = p.id
      GROUP BY p.id
      ORDER BY COALESCE(last_record_at, '1900-01-01') DESC
      LIMIT 6
    `,
    )
    .all()
    .map((row) => mapPatientRow(row as Parameters<typeof mapPatientRow>[0]));

  const upcomingAppointments = db
    .prepare(
      `
      SELECT
        a.id,
        a.patient_id,
        p.full_name as patient_name,
        a.starts_at,
        a.clinician,
        a.reason,
        a.status,
        a.consultation_type
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      WHERE a.status IN ('upcoming', 'checked-in', 'in-progress')
      ORDER BY a.starts_at ASC
      LIMIT 8
    `,
    )
    .all()
    .map((row) =>
      mapAppointmentRow(row as Parameters<typeof mapAppointmentRow>[0]),
    );

  return {
    totals,
    recentPatients,
    upcomingAppointments,
  };
}

export function getAllPatients(): PatientSummary[] {
  const db = getDb();

  return db
    .prepare(
      `
      SELECT
        p.id,
        p.full_name,
        p.dob,
        p.sex,
        p.phone,
        p.email,
        p.address,
        p.nhs_number,
        p.allergies,
        p.chronic_conditions,
        MAX(r.occurred_at) as last_record_at,
        MIN(CASE WHEN a.status IN ('upcoming', 'checked-in', 'in-progress') THEN a.starts_at END) as next_appointment_at
      FROM patients p
      LEFT JOIN record_entries r ON r.patient_id = p.id
      LEFT JOIN appointments a ON a.patient_id = p.id
      GROUP BY p.id
      ORDER BY p.full_name ASC
    `,
    )
    .all()
    .map((row) => mapPatientRow(row as Parameters<typeof mapPatientRow>[0]));
}

export function getPatientDetail(patientId: number): PatientDetail | null {
  const db = getDb();
  const patientRow = db
    .prepare(
      `
      SELECT
        p.id,
        p.full_name,
        p.dob,
        p.sex,
        p.phone,
        p.email,
        p.address,
        p.nhs_number,
        p.allergies,
        p.chronic_conditions,
        MAX(r.occurred_at) as last_record_at,
        MIN(CASE WHEN a.status IN ('upcoming', 'checked-in', 'in-progress') THEN a.starts_at END) as next_appointment_at
      FROM patients p
      LEFT JOIN record_entries r ON r.patient_id = p.id
      LEFT JOIN appointments a ON a.patient_id = p.id
      WHERE p.id = ?
      GROUP BY p.id
    `,
    )
    .get(patientId) as Parameters<typeof mapPatientRow>[0] | undefined;

  if (!patientRow) {
    return null;
  }

  const recordEntries = db
    .prepare(
      `
      SELECT *
      FROM record_entries
      WHERE patient_id = ?
      ORDER BY occurred_at DESC
      LIMIT 100
    `,
    )
    .all(patientId)
    .map((row) =>
      mapRecordEntryRow(row as Parameters<typeof mapRecordEntryRow>[0]),
    );

  const entryCounts = db
    .prepare(
      `
      SELECT entry_type as type, COUNT(*) as count
      FROM record_entries
      WHERE patient_id = ?
      GROUP BY entry_type
    `,
    )
    .all(patientId) as Array<{ type: RecordEntryType; count: number }>;

  const appointments = db
    .prepare(
      `
      SELECT
        a.id,
        a.patient_id,
        p.full_name as patient_name,
        a.starts_at,
        a.clinician,
        a.reason,
        a.status,
        a.consultation_type
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      WHERE a.patient_id = ?
      ORDER BY a.starts_at ASC
    `,
    )
    .all(patientId)
    .map((row) =>
      mapAppointmentRow(row as Parameters<typeof mapAppointmentRow>[0]),
    );

  return {
    patient: mapPatientRow(patientRow),
    recordEntries,
    entryCounts,
    appointments,
  };
}

export function getAppointmentDetail(
  appointmentId: number,
): AppointmentDetail | null {
  const db = getDb();
  const appointmentRow = db
    .prepare(
      `
      SELECT
        a.id,
        a.patient_id,
        p.full_name as patient_name,
        a.starts_at,
        a.clinician,
        a.reason,
        a.status,
        a.consultation_type
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      WHERE a.id = ?
    `,
    )
    .get(appointmentId) as Parameters<typeof mapAppointmentRow>[0] | undefined;

  if (!appointmentRow) {
    return null;
  }

  const patient = getPatientDetail(appointmentRow.patient_id);

  if (!patient) {
    return null;
  }

  return {
    appointment: mapAppointmentRow(appointmentRow),
    patient: patient.patient,
    recordEntries: patient.recordEntries.slice(0, 8),
  };
}

function parseBloodPressure(value: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);

  if (!match) {
    return null;
  }

  return {
    systolic: Number(match[1]),
    diastolic: Number(match[2]),
  };
}

export function createRecordEntriesFromConsultation(input: {
  appointmentId: number | null;
  patientId: number | null;
  selectedEntryTypes: RecordEntryType[];
  clinician: string;
  reason: string;
  subjective: string;
  objective: string | null;
  bloodPressure: string | null;
  heartRate: number | null;
  temperatureC: number | null;
  heightCm: number | null;
  weightKg: number | null;
  bmi: number | null;
  assessment: string;
  plan: string;
  testName: string | null;
  testReason: string | null;
  vaccine: string | null;
  vaccineDose: string | null;
  vaccineSite: string | null;
  vaccineBatch: string | null;
  vaccineStatus: "administered" | "declined" | "planned";
  gestationWeeks: number | null;
  fetalHeartRate: number | null;
  fundalHeightCm: number | null;
  maternityNotes: string | null;
  outcomeType: "none" | "prescription" | "referral";
  outcomeDetails: string | null;
}) {
  const db = getDb();
  const appointment = input.appointmentId
    ? (db
        .prepare("SELECT id, patient_id, starts_at FROM appointments WHERE id = ?")
        .get(input.appointmentId) as
        | { id: number; patient_id: number; starts_at: string }
        | undefined)
    : null;

  if (input.appointmentId && !appointment) {
    throw new Error("Appointment not found");
  }

  if (!appointment && !input.patientId) {
    throw new Error("Patient not found");
  }

  const appointmentId = appointment?.id ?? null;
  const patientId = appointment?.patient_id ?? input.patientId!;
  const startsAt = appointment?.starts_at ?? new Date().toISOString();
  const patientExists = db
    .prepare("SELECT id FROM patients WHERE id = ?")
    .get(patientId);

  if (!patientExists) {
    throw new Error("Patient not found");
  }

  const insertRecordEntry = db.prepare(`
    INSERT INTO record_entries (
      patient_id,
      appointment_id,
      interaction_id,
      entry_type,
      occurred_at,
      title,
      summary,
      authored_by,
      source,
      payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    const interactionId = appointmentId
      ? `appointment-${appointmentId}-${Date.now()}`
      : `patient-${patientId}-${Date.now()}`;

    function hasEntryType(type: RecordEntryType) {
      return input.selectedEntryTypes.includes(type);
    }

    function insertEntry(entry: {
      type: RecordEntryType;
      occurredAt: string;
      title: string;
      summary: string;
      source: string;
      payload: RecordEntryPayload;
    }) {
      return insertRecordEntry.run(
        patientId,
        appointmentId,
        interactionId,
        entry.type,
        entry.occurredAt,
        entry.title,
        entry.summary,
        input.clinician,
        entry.source,
        JSON.stringify(entry.payload),
      );
    }

    let firstResult: Database.RunResult | null = null;

    if (hasEntryType("history")) {
      firstResult = insertEntry({
        type: "history",
        occurredAt: startsAt,
        title: `${input.reason}: history`,
        summary: input.subjective,
        source: "consultation form",
        payload: { history: { detail: input.subjective } },
      });
    }

    if (hasEntryType("examination") && input.objective?.trim()) {
      insertEntry({
        type: "examination",
        occurredAt: startsAt,
        title: `${input.reason}: examination`,
        summary: input.objective,
        source: "consultation form",
        payload: { examination: { findings: input.objective } },
      });
    }

    if (hasEntryType("diagnosis")) {
      const result = insertEntry({
        type: "diagnosis",
        occurredAt: startsAt,
        title: `${input.reason}: assessment`,
        summary: input.assessment,
        source: "consultation form",
        payload: { diagnosis: { impression: input.assessment } },
      });
      firstResult ??= result;
    }

    if (hasEntryType("care-plan")) {
      const result = insertEntry({
        type: "care-plan",
        occurredAt: startsAt,
        title: `${input.reason}: plan`,
        summary: input.plan,
        source: "consultation form",
        payload: {
          carePlan: {
            plan: input.plan,
            outcomeType: input.outcomeType,
            outcomeDetails: input.outcomeDetails,
          },
        },
      });
      firstResult ??= result;
    }

    const bloodPressure = parseBloodPressure(input.bloodPressure);

    if (
      hasEntryType("vitals") &&
      (bloodPressure || input.heartRate !== null || input.temperatureC !== null)
    ) {
      const vitalsPayload: RecordEntryPayload = {
        vitals: {
          ...(bloodPressure ?? {}),
          ...(input.heartRate !== null ? { heartRate: input.heartRate } : {}),
          ...(input.temperatureC !== null
            ? { temperatureC: input.temperatureC }
            : {}),
        },
      };

      insertEntry({
        type: "vitals",
        occurredAt: startsAt,
        title: "Consultation observations",
        summary: "Structured observations recorded during the consultation.",
        source: "consultation form",
        payload: vitalsPayload,
      });
    }

    if (
      hasEntryType("body-metrics") &&
      (input.heightCm !== null || input.weightKg !== null || input.bmi !== null)
    ) {
      insertEntry({
        type: "body-metrics",
        occurredAt: startsAt,
        title: "Body measurements",
        summary: "Body measurements recorded during the consultation.",
        source: "consultation form",
        payload: {
          bodyMetrics: {
            ...(input.heightCm !== null ? { heightCm: input.heightCm } : {}),
            ...(input.weightKg !== null ? { weightKg: input.weightKg } : {}),
            ...(input.bmi !== null ? { bmi: input.bmi } : {}),
          },
        },
      });
    }

    if (hasEntryType("test-order") && input.testName) {
      insertEntry({
        type: "test-order",
        occurredAt: startsAt,
        title: "Test ordered",
        summary: input.testName,
        source: "consultation form",
        payload: {
          testOrder: {
            testName: input.testName,
            reason: input.testReason,
            status: "ordered",
          },
        },
      });
    }

    if (
      hasEntryType("medication") &&
      input.outcomeType === "prescription" &&
      input.outcomeDetails
    ) {
      const medicationPayload: RecordEntryPayload = {
        medication: {
          medication: input.outcomeDetails,
          dose: "See consultation plan",
          status: "started",
          instructions: input.plan,
        },
      };

      insertEntry({
        type: "medication",
        occurredAt: startsAt,
        title: "Medication prescribed",
        summary: input.outcomeDetails,
        source: "consultation outcome",
        payload: medicationPayload,
      });
    }

    if (hasEntryType("vaccination") && input.vaccine) {
      insertEntry({
        type: "vaccination",
        occurredAt: startsAt,
        title: "Vaccination",
        summary: input.vaccine,
        source: "consultation form",
        payload: {
          vaccination: {
            vaccine: input.vaccine,
            dose: input.vaccineDose,
            site: input.vaccineSite,
            batch: input.vaccineBatch,
            status: input.vaccineStatus,
          },
        },
      });
    }

    if (hasEntryType("maternity") && input.maternityNotes) {
      insertEntry({
        type: "maternity",
        occurredAt: startsAt,
        title: "Antenatal observations",
        summary: input.maternityNotes,
        source: "consultation form",
        payload: {
          maternity: {
            gestationWeeks: input.gestationWeeks ?? undefined,
            fetalHeartRate: input.fetalHeartRate ?? undefined,
            fundalHeightCm: input.fundalHeightCm ?? undefined,
            notes: input.maternityNotes,
          },
        },
      });
    }

    if (
      hasEntryType("referral") &&
      input.outcomeType === "referral" &&
      input.outcomeDetails
    ) {
      const referralPayload: RecordEntryPayload = {
        referral: {
          specialty: input.outcomeDetails,
          destination: input.outcomeDetails,
          status: "requested",
        },
      };

      insertEntry({
        type: "referral",
        occurredAt: startsAt,
        title: "Referral requested",
        summary: input.outcomeDetails,
        source: "consultation outcome",
        payload: referralPayload,
      });
    }

    if (appointmentId) {
      db.prepare("UPDATE appointments SET status = 'completed' WHERE id = ?").run(
        appointmentId,
      );
    }

    return Number(firstResult?.lastInsertRowid ?? 0);
  });

  return transaction();
}