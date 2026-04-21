import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { seedData } from "@/lib/ehr-data";
import type {
  AppointmentDetail,
  AppointmentSummary,
  DashboardData,
  PatientDetail,
  PatientSummary,
  VisitSummary,
} from "@/lib/ehr-types";

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
      FOREIGN KEY(patient_id) REFERENCES patients(id)
    );

    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      appointment_id INTEGER,
      visit_date TEXT NOT NULL,
      clinician TEXT NOT NULL,
      reason TEXT NOT NULL,
      notes TEXT NOT NULL,
      objective TEXT,
      blood_pressure TEXT,
      heart_rate INTEGER,
      temperature_c REAL,
      assessment TEXT NOT NULL,
      plan TEXT NOT NULL,
      outcome_type TEXT NOT NULL,
      outcome_details TEXT,
      FOREIGN KEY(patient_id) REFERENCES patients(id),
      FOREIGN KEY(appointment_id) REFERENCES appointments(id)
    );
  `);
}

function migrateVisitsSchema(database: Database.Database) {
  const visitColumns = database
    .prepare("PRAGMA table_info(visits)")
    .all() as Array<{
    name: string;
    notnull: number;
  }>;

  if (visitColumns.length === 0) {
    return;
  }

  const hasObjective = visitColumns.some(
    (column) => column.name === "objective",
  );
  const vitalsAreNullable = [
    "blood_pressure",
    "heart_rate",
    "temperature_c",
  ].every((columnName) => {
    const column = visitColumns.find((entry) => entry.name === columnName);
    return column?.notnull === 0;
  });

  if (hasObjective && vitalsAreNullable) {
    return;
  }

  const objectiveSelect = hasObjective ? "objective" : "NULL";

  try {
    database.exec("BEGIN");
    database.exec(`
      ALTER TABLE visits RENAME TO visits_legacy;

      CREATE TABLE visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL,
        appointment_id INTEGER,
        visit_date TEXT NOT NULL,
        clinician TEXT NOT NULL,
        reason TEXT NOT NULL,
        notes TEXT NOT NULL,
        objective TEXT,
        blood_pressure TEXT,
        heart_rate INTEGER,
        temperature_c REAL,
        assessment TEXT NOT NULL,
        plan TEXT NOT NULL,
        outcome_type TEXT NOT NULL,
        outcome_details TEXT,
        FOREIGN KEY(patient_id) REFERENCES patients(id),
        FOREIGN KEY(appointment_id) REFERENCES appointments(id)
      );

      INSERT INTO visits (
        id,
        patient_id,
        appointment_id,
        visit_date,
        clinician,
        reason,
        notes,
        objective,
        blood_pressure,
        heart_rate,
        temperature_c,
        assessment,
        plan,
        outcome_type,
        outcome_details
      )
      SELECT
        id,
        patient_id,
        appointment_id,
        visit_date,
        clinician,
        reason,
        notes,
        ${objectiveSelect},
        blood_pressure,
        heart_rate,
        temperature_c,
        assessment,
        plan,
        outcome_type,
        outcome_details
      FROM visits_legacy;

      DROP TABLE visits_legacy;
    `);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
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
      status
    ) VALUES (?, ?, ?, ?, ?)
  `);

  const insertVisit = database.prepare(`
    INSERT INTO visits (
      patient_id,
      appointment_id,
      visit_date,
      clinician,
      reason,
      notes,
      objective,
      blood_pressure,
      heart_rate,
      temperature_c,
      assessment,
      plan,
      outcome_type,
      outcome_details
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      );

      return Number(result.lastInsertRowid);
    });

    seedData.visits.forEach((visit) => {
      const matchingAppointmentId =
        appointmentIds.find((appointmentId, index) => {
          const appointment = seedData.appointments[index];
          return (
            appointment.patientIndex === visit.patientIndex &&
            appointment.startsAt === visit.visitDate
          );
        }) ?? null;

      insertVisit.run(
        patientIds[visit.patientIndex],
        matchingAppointmentId,
        visit.visitDate,
        visit.clinician,
        visit.reason,
        visit.subjective,
        visit.objective ?? null,
        visit.bloodPressure ?? null,
        visit.heartRate ?? null,
        visit.temperatureC ?? null,
        visit.assessment,
        visit.plan,
        visit.outcomeType,
        visit.outcomeDetails ?? null,
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
  last_visit_date: string | null;
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
    lastVisitDate: row.last_visit_date,
    nextAppointmentAt: row.next_appointment_at,
  };
}

function mapVisitRow(row: {
  id: number;
  patient_id: number;
  appointment_id: number | null;
  visit_date: string;
  clinician: string;
  reason: string;
  notes: string;
  objective: string | null;
  blood_pressure: string | null;
  heart_rate: number | null;
  temperature_c: number | null;
  assessment: string;
  plan: string;
  outcome_type: VisitSummary["outcomeType"];
  outcome_details: string | null;
}): VisitSummary {
  return {
    id: row.id,
    patientId: row.patient_id,
    appointmentId: row.appointment_id,
    visitDate: row.visit_date,
    clinician: row.clinician,
    reason: row.reason,
    subjective: row.notes,
    objective: row.objective,
    bloodPressure: row.blood_pressure,
    heartRate: row.heart_rate,
    temperatureC: row.temperature_c,
    assessment: row.assessment,
    plan: row.plan,
    outcomeType: row.outcome_type,
    outcomeDetails: row.outcome_details,
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
}): AppointmentSummary {
  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    startsAt: row.starts_at,
    clinician: row.clinician,
    reason: row.reason,
    status: row.status,
  };
}

export function getDb() {
  const globalWithDb = globalThis as GlobalWithDb;

  if (!globalWithDb.ehrDatabase) {
    ensureDatabaseDirectory();
    const database = new Database(databasePath);
    initializeSchema(database);
    globalWithDb.ehrDatabase = database;
  }

  migrateVisitsSchema(globalWithDb.ehrDatabase);
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
    completedThisWeek: (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM visits WHERE visit_date >= '2026-04-12T00:00:00'",
        )
        .get() as { count: number }
    ).count,
    prescriptionsThisMonth: (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM visits WHERE outcome_type = 'prescription' AND visit_date >= '2026-04-01T00:00:00'",
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
        MAX(v.visit_date) as last_visit_date,
        MIN(CASE WHEN a.status IN ('upcoming', 'checked-in', 'in-progress') THEN a.starts_at END) as next_appointment_at
      FROM patients p
      LEFT JOIN visits v ON v.patient_id = p.id
      LEFT JOIN appointments a ON a.patient_id = p.id
      GROUP BY p.id
      ORDER BY COALESCE(last_visit_date, '1900-01-01') DESC
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
        a.status
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
        MAX(v.visit_date) as last_visit_date,
        MIN(CASE WHEN a.status IN ('upcoming', 'checked-in', 'in-progress') THEN a.starts_at END) as next_appointment_at
      FROM patients p
      LEFT JOIN visits v ON v.patient_id = p.id
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
        MAX(v.visit_date) as last_visit_date,
        MIN(CASE WHEN a.status IN ('upcoming', 'checked-in', 'in-progress') THEN a.starts_at END) as next_appointment_at
      FROM patients p
      LEFT JOIN visits v ON v.patient_id = p.id
      LEFT JOIN appointments a ON a.patient_id = p.id
      WHERE p.id = ?
      GROUP BY p.id
    `,
    )
    .get(patientId) as Parameters<typeof mapPatientRow>[0] | undefined;

  if (!patientRow) {
    return null;
  }

  const visits = db
    .prepare(
      `
      SELECT *
      FROM visits
      WHERE patient_id = ?
      ORDER BY visit_date DESC
      LIMIT 5
    `,
    )
    .all(patientId)
    .map((row) => mapVisitRow(row as Parameters<typeof mapVisitRow>[0]));

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
        a.status
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
    visits,
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
        a.status
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
    visits: patient.visits,
  };
}

export function createVisitFromAppointment(input: {
  appointmentId: number;
  clinician: string;
  reason: string;
  subjective: string;
  objective: string | null;
  bloodPressure: string | null;
  heartRate: number | null;
  temperatureC: number | null;
  assessment: string;
  plan: string;
  outcomeType: VisitSummary["outcomeType"];
  outcomeDetails: string | null;
}) {
  const db = getDb();
  const appointment = db
    .prepare("SELECT id, patient_id, starts_at FROM appointments WHERE id = ?")
    .get(input.appointmentId) as
    | { id: number; patient_id: number; starts_at: string }
    | undefined;

  if (!appointment) {
    throw new Error("Appointment not found");
  }

  const transaction = db.transaction(() => {
    const result = db
      .prepare(
        `
        INSERT INTO visits (
          patient_id,
          appointment_id,
          visit_date,
          clinician,
          reason,
          notes,
          objective,
          blood_pressure,
          heart_rate,
          temperature_c,
          assessment,
          plan,
          outcome_type,
          outcome_details
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        appointment.patient_id,
        appointment.id,
        appointment.starts_at,
        input.clinician,
        input.reason,
        input.subjective,
        input.objective,
        input.bloodPressure,
        input.heartRate,
        input.temperatureC,
        input.assessment,
        input.plan,
        input.outcomeType,
        input.outcomeDetails,
      );

    db.prepare("UPDATE appointments SET status = 'completed' WHERE id = ?").run(
      appointment.id,
    );

    return Number(result.lastInsertRowid);
  });

  return transaction();
}
