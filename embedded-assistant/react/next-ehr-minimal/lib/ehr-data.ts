import type {
  AppointmentStatus,
  ConsultationType,
  OutcomeType,
  RecordEntryPayload,
  RecordEntryType,
} from "@/lib/ehr-types";

type SeedPatient = {
  fullName: string;
  dob: string;
  sex: string;
  phone: string;
  email: string;
  address: string;
  nhsNumber: string;
  allergies: string;
  chronicConditions: string;
};

type SeedAppointment = {
  patientIndex: number;
  startsAt: string;
  clinician: string;
  reason: string;
  status: AppointmentStatus;
  consultationType: ConsultationType;
};

type SeedRecordEntry = {
  patientIndex: number;
  appointmentIndex?: number;
  interactionId?: string;
  type: RecordEntryType;
  occurredAt: string;
  title: string;
  summary: string;
  authoredBy: string;
  source: string;
  payload: RecordEntryPayload;
};

type SeedVisitEvent = Omit<SeedRecordEntry, "type" | "payload"> & {
  kind: "visit";
  details: {
    subjective: string;
    objective?: string | null;
    assessment: string;
    plan: string;
    outcomeType: OutcomeType;
    outcomeDetails?: string | null;
  };
};

type SeedEntry = SeedRecordEntry | SeedVisitEvent;

function entryTime(value: string, offsetMinutes: number) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() + offsetMinutes);
  return date.toISOString().slice(0, 19);
}

function expandVisitEvent(entry: SeedVisitEvent): SeedRecordEntry[] {
  const details = entry.details;
  const shared = {
    patientIndex: entry.patientIndex,
    appointmentIndex: entry.appointmentIndex,
    interactionId: entry.interactionId,
    authoredBy: entry.authoredBy,
    source: entry.source,
  };
  const entries: SeedRecordEntry[] = [
    {
      ...shared,
      type: "history",
      occurredAt: entry.occurredAt,
      title: `${entry.title}: history`,
      summary: details.subjective,
      payload: { history: { detail: details.subjective } },
    },
  ];

  if (details.objective?.trim()) {
    entries.push({
      ...shared,
      type: "examination",
      occurredAt: entryTime(entry.occurredAt, 1),
      title: `${entry.title}: examination`,
      summary: details.objective,
      payload: { examination: { findings: details.objective } },
    });
  }

  entries.push(
    {
      ...shared,
      type: "diagnosis",
      occurredAt: entryTime(entry.occurredAt, 2),
      title: `${entry.title}: assessment`,
      summary: details.assessment,
      payload: { diagnosis: { impression: details.assessment } },
    },
    {
      ...shared,
      type: "care-plan",
      occurredAt: entryTime(entry.occurredAt, 3),
      title: `${entry.title}: plan`,
      summary: details.plan,
      payload: {
        carePlan: {
          plan: details.plan,
          outcomeType: details.outcomeType,
          outcomeDetails: details.outcomeDetails,
        },
      },
    },
  );

  if (details.outcomeType === "prescription" && details.outcomeDetails) {
    entries.push({
      ...shared,
      type: "medication",
      occurredAt: entryTime(entry.occurredAt, 4),
      title: "Medication prescribed",
      summary: details.outcomeDetails,
      payload: {
        medication: {
          medication: details.outcomeDetails,
          dose: "See care plan",
          status: "started",
          instructions: details.plan,
        },
      },
    });
  }

  if (details.outcomeType === "referral" && details.outcomeDetails) {
    entries.push({
      ...shared,
      type: "referral",
      occurredAt: entryTime(entry.occurredAt, 4),
      title: "Referral requested",
      summary: details.outcomeDetails,
      payload: {
        referral: {
          specialty: details.outcomeDetails,
          destination: details.outcomeDetails,
          status: "requested",
        },
      },
    });
  }

  return entries;
}

function expandRecordEntry(entry: SeedEntry): SeedRecordEntry[] {
  return "kind" in entry ? expandVisitEvent(entry) : [entry];
}

const patients: SeedPatient[] = [
  {
    fullName: "Eleanor Shaw",
    dob: "1981-04-12",
    sex: "Female",
    phone: "07700 900101",
    email: "eleanor.shaw@example.test",
    address: "14 Kingfisher Row, Brighton",
    nhsNumber: "943 476 1820",
    allergies: "Penicillin",
    chronicConditions: "Asthma",
  },
  {
    fullName: "James Patel",
    dob: "1974-09-03",
    sex: "Male",
    phone: "07700 900102",
    email: "james.patel@example.test",
    address: "2 Willow Close, Hove",
    nhsNumber: "943 476 1821",
    allergies: "None recorded",
    chronicConditions: "Hypertension",
  },
  {
    fullName: "Maya O'Connell",
    dob: "1992-01-26",
    sex: "Female",
    phone: "07700 900103",
    email: "maya.oconnell@example.test",
    address: "7 Station Terrace, Lewes",
    nhsNumber: "943 476 1822",
    allergies: "Latex",
    chronicConditions: "Migraine",
  },
  {
    fullName: "Noah Bennett",
    dob: "1988-07-18",
    sex: "Male",
    phone: "07700 900104",
    email: "noah.bennett@example.test",
    address: "33 Orchard Lane, Brighton",
    nhsNumber: "943 476 1823",
    allergies: "Ibuprofen",
    chronicConditions: "None recorded",
  },
  {
    fullName: "Grace Li",
    dob: "1969-11-08",
    sex: "Female",
    phone: "07700 900105",
    email: "grace.li@example.test",
    address: "5 Victoria Mews, Hove",
    nhsNumber: "943 476 1824",
    allergies: "None recorded",
    chronicConditions: "Type 2 diabetes",
  },
  {
    fullName: "Arthur Doyle",
    dob: "1958-06-21",
    sex: "Male",
    phone: "07700 900106",
    email: "arthur.doyle@example.test",
    address: "18 Selsey Road, Peacehaven",
    nhsNumber: "943 476 1825",
    allergies: "Shellfish",
    chronicConditions: "COPD",
  },
  {
    fullName: "Freya Ahmed",
    dob: "2001-03-09",
    sex: "Female",
    phone: "07700 900107",
    email: "freya.ahmed@example.test",
    address: "24 Marine Parade, Brighton",
    nhsNumber: "943 476 1826",
    allergies: "None recorded",
    chronicConditions: "Eczema",
  },
  {
    fullName: "Leo Carmichael",
    dob: "2010-10-15",
    sex: "Male",
    phone: "07700 900108",
    email: "parent.leo@example.test",
    address: "9 Portland Street, Hove",
    nhsNumber: "943 476 1827",
    allergies: "Peanuts",
    chronicConditions: "Seasonal allergies",
  },
  {
    fullName: "Sofia Hart",
    dob: "1995-12-02",
    sex: "Female",
    phone: "07700 900109",
    email: "sofia.hart@example.test",
    address: "61 Clifton Hill, Brighton",
    nhsNumber: "943 476 1828",
    allergies: "None recorded",
    chronicConditions: "Anxiety",
  },
  {
    fullName: "Daniel Green",
    dob: "1983-05-30",
    sex: "Male",
    phone: "07700 900110",
    email: "daniel.green@example.test",
    address: "3 Ivy Court, Hove",
    nhsNumber: "943 476 1829",
    allergies: "None recorded",
    chronicConditions: "Gout",
  },
  {
    fullName: "Amelia Rhodes",
    dob: "1979-08-19",
    sex: "Female",
    phone: "07700 900111",
    email: "amelia.rhodes@example.test",
    address: "87 Ditchling Road, Brighton",
    nhsNumber: "943 476 1830",
    allergies: "Sulfa drugs",
    chronicConditions: "Hypothyroidism",
  },
  {
    fullName: "Henry Foster",
    dob: "1990-02-14",
    sex: "Male",
    phone: "07700 900112",
    email: "henry.foster@example.test",
    address: "12 Norfolk Square, Brighton",
    nhsNumber: "943 476 1831",
    allergies: "None recorded",
    chronicConditions: "None recorded",
  },
  {
    fullName: "Lily Brooks",
    dob: "2005-09-29",
    sex: "Female",
    phone: "07700 900113",
    email: "lily.brooks@example.test",
    address: "4 Elm Rise, Shoreham",
    nhsNumber: "943 476 1832",
    allergies: "None recorded",
    chronicConditions: "Acne",
  },
  {
    fullName: "Thomas Kerr",
    dob: "1964-04-04",
    sex: "Male",
    phone: "07700 900114",
    email: "thomas.kerr@example.test",
    address: "27 Seaview Avenue, Worthing",
    nhsNumber: "943 476 1833",
    allergies: "Codeine",
    chronicConditions: "Atrial fibrillation",
  },
  {
    fullName: "Ruby Sinclair",
    dob: "1987-01-11",
    sex: "Female",
    phone: "07700 900115",
    email: "ruby.sinclair@example.test",
    address: "16 Albert Road, Brighton",
    nhsNumber: "943 476 1834",
    allergies: "None recorded",
    chronicConditions: "PCOS",
  },
  {
    fullName: "Oscar Wood",
    dob: "1971-07-27",
    sex: "Male",
    phone: "07700 900116",
    email: "oscar.wood@example.test",
    address: "8 Chapel Street, Lewes",
    nhsNumber: "943 476 1835",
    allergies: "None recorded",
    chronicConditions: "High cholesterol",
  },
  {
    fullName: "Hannah Rees",
    dob: "1998-06-05",
    sex: "Female",
    phone: "07700 900117",
    email: "hannah.rees@example.test",
    address: "22 Trafalgar Lane, Brighton",
    nhsNumber: "943 476 1836",
    allergies: "None recorded",
    chronicConditions: "None recorded",
  },
  {
    fullName: "Jacob Flynn",
    dob: "2016-11-23",
    sex: "Male",
    phone: "07700 900118",
    email: "parent.jacob@example.test",
    address: "10 Pelham Street, Hove",
    nhsNumber: "943 476 1837",
    allergies: "Egg",
    chronicConditions: "Mild eczema",
  },
  {
    fullName: "Ava McKenzie",
    dob: "1949-02-28",
    sex: "Female",
    phone: "07700 900119",
    email: "ava.mckenzie@example.test",
    address: "45 Regency Court, Brighton",
    nhsNumber: "943 476 1838",
    allergies: "None recorded",
    chronicConditions: "Osteoarthritis",
  },
  {
    fullName: "Samuel Price",
    dob: "1985-10-07",
    sex: "Male",
    phone: "07700 900120",
    email: "samuel.price@example.test",
    address: "6 Church Lane, Hove",
    nhsNumber: "943 476 1839",
    allergies: "None recorded",
    chronicConditions: "GERD",
  },
];

const appointments: SeedAppointment[] = [
  { patientIndex: 0, startsAt: "2026-04-19T09:00:00", clinician: "Dr. Mason", reason: "Asthma medication review", status: "upcoming", consultationType: "medication-review" },
  { patientIndex: 1, startsAt: "2026-04-19T09:30:00", clinician: "Dr. Mason", reason: "Blood pressure follow-up", status: "upcoming", consultationType: "medication-review" },
  { patientIndex: 2, startsAt: "2026-04-19T10:15:00", clinician: "Dr. Reed", reason: "Headache assessment", status: "checked-in", consultationType: "general-gp" },
  { patientIndex: 4, startsAt: "2026-04-19T11:00:00", clinician: "Dr. Reed", reason: "Diabetes review", status: "upcoming", consultationType: "annual-checkup" },
  { patientIndex: 7, startsAt: "2026-04-19T11:30:00", clinician: "Dr. Mason", reason: "School health note", status: "upcoming", consultationType: "vaccination" },
  { patientIndex: 9, startsAt: "2026-04-19T13:30:00", clinician: "Dr. Mason", reason: "Joint pain", status: "upcoming", consultationType: "general-gp" },
  { patientIndex: 12, startsAt: "2026-04-19T14:00:00", clinician: "Dr. Reed", reason: "Skin review", status: "upcoming", consultationType: "general-gp" },
  { patientIndex: 15, startsAt: "2026-04-19T15:15:00", clinician: "Dr. Mason", reason: "Cholesterol review", status: "upcoming", consultationType: "annual-checkup" },
];

const recordEntries: SeedEntry[] = [
  { patientIndex: 0, type: "body-metrics", occurredAt: "2024-10-12T08:45:00", title: "New patient baseline measurements", summary: "Baseline height and weight captured at registration.", authoredBy: "Practice nurse", source: "new patient check", payload: { bodyMetrics: { heightCm: 166, weightKg: 69.4, bmi: 25.2 } } },
  { patientIndex: 0, interactionId: "int-eleanor-2025-02-02", kind: "visit", occurredAt: "2025-02-02T10:10:00", title: "Asthma control review", summary: "Preventer adherence was inconsistent; night symptoms increased during cold weather.", authoredBy: "Dr. Mason", source: "in-person consultation", details: { subjective: "Night cough three times weekly, reliever used most days.", objective: "Chest clear, peak flow 390 L/min after repeat attempt.", assessment: "Partly controlled asthma without acute exacerbation.", plan: "Restart regular preventer, spacer technique reviewed, follow up in three months.", outcomeType: "prescription", outcomeDetails: "Beclometasone inhaler renewed" } },
  { patientIndex: 0, type: "vitals", occurredAt: "2025-02-02T10:05:00", title: "Pre-consultation observations", summary: "Vitals stable during asthma review.", authoredBy: "Practice nurse", source: "clinic observations", payload: { vitals: { systolic: 124, diastolic: 78, heartRate: 78, temperatureC: 36.7, oxygenSaturation: 98, respiratoryRate: 15 } } },
  { patientIndex: 0, type: "medication", occurredAt: "2025-11-05T15:20:00", title: "Reliever inhaler renewal", summary: "Patient phoned reception for salbutamol renewal before travel.", authoredBy: "Dr. Reed", source: "telephone request", payload: { medication: { medication: "Salbutamol 100 mcg inhaler", dose: "1-2 puffs when required", status: "renewed", instructions: "Review if using more than three times weekly." } } },
  { patientIndex: 0, type: "lab-result", occurredAt: "2026-01-14T09:30:00", title: "Full blood count received", summary: "No anaemia; mild eosinophilia consistent with atopic history.", authoredBy: "Brighton Pathology", source: "lab feed", payload: { labResult: { testName: "Eosinophils", result: "0.55", unit: "10^9/L", referenceRange: "0.00-0.40", status: "borderline" } } },
  { patientIndex: 0, type: "patient-message", occurredAt: "2026-02-17T13:18:00", title: "Portal message about exercise cough", summary: "Patient asked whether to use reliever before running club.", authoredBy: "Eleanor Shaw", source: "patient portal", payload: { message: { channel: "portal", detail: "Cough starts after ten minutes of outdoor running; no chest pain or fever." } } },
  { patientIndex: 0, type: "document", occurredAt: "2026-02-20T11:50:00", title: "Asthma action plan sent", summary: "Updated written plan sent through the patient portal.", authoredBy: "Practice nurse", source: "portal document", payload: { document: { documentType: "Asthma action plan", status: "sent" } } },
  { patientIndex: 0, interactionId: "int-eleanor-2026-03-10", kind: "visit", occurredAt: "2026-03-10T09:00:00", title: "Cough and wheeze", summary: "Mild asthma flare after viral illness; no infection signs.", authoredBy: "Dr. Mason", source: "in-person consultation", details: { subjective: "Night symptoms twice a week, inhaler technique reviewed.", objective: "No fever, mild end-expiratory wheeze, speaking full sentences.", assessment: "Mild asthma flare, no signs of bacterial infection.", plan: "Continue preventer, increase reliever use for 48 hours, return if peak flow drops.", outcomeType: "prescription", outcomeDetails: "Salbutamol inhaler" } },
  { patientIndex: 0, type: "vitals", occurredAt: "2026-03-10T08:56:00", title: "Respiratory review observations", summary: "Observations taken before asthma review.", authoredBy: "Practice nurse", source: "clinic observations", payload: { vitals: { systolic: 122, diastolic: 78, heartRate: 76, temperatureC: 36.8, oxygenSaturation: 97, respiratoryRate: 17 } } },
  { patientIndex: 0, type: "body-metrics", occurredAt: "2026-03-10T08:57:00", title: "Weight update", summary: "Weight stable compared with prior annual review.", authoredBy: "Practice nurse", source: "clinic observations", payload: { bodyMetrics: { heightCm: 166, weightKg: 70.1, bmi: 25.4 } } },
  { patientIndex: 0, type: "referral", occurredAt: "2026-03-14T12:00:00", title: "Respiratory nurse referral", summary: "Referred for inhaler technique coaching and trigger planning.", authoredBy: "Dr. Mason", source: "admin task", payload: { referral: { specialty: "Respiratory nursing", destination: "Community respiratory team", status: "sent" } } },
  { patientIndex: 0, type: "vitals", occurredAt: "2026-04-12T10:05:00", title: "Telephone triage follow-up observations", summary: "Home readings reported after mild wheeze settled.", authoredBy: "Eleanor Shaw", source: "patient-reported home readings", payload: { vitals: { systolic: 120, diastolic: 76, heartRate: 74, temperatureC: 36.5, oxygenSaturation: 98, respiratoryRate: 14 } } },
  { patientIndex: 1, type: "body-metrics", occurredAt: "2025-05-06T09:00:00", title: "Hypertension baseline measurements", summary: "Baseline body metrics recorded before medication review.", authoredBy: "Practice nurse", source: "clinic observations", payload: { bodyMetrics: { heightCm: 178, weightKg: 88.2, bmi: 27.8 } } },
  { patientIndex: 1, type: "vitals", occurredAt: "2025-05-06T09:05:00", title: "Raised clinic blood pressure", summary: "Clinic BP elevated; home monitoring started.", authoredBy: "Practice nurse", source: "clinic observations", payload: { vitals: { systolic: 148, diastolic: 92, heartRate: 72 } } },
  { patientIndex: 1, interactionId: "int-james-2025-05-06", kind: "visit", occurredAt: "2025-05-06T09:20:00", title: "Hypertension diagnosis review", summary: "Lifestyle changes discussed; ACE inhibitor started.", authoredBy: "Dr. Reed", source: "in-person consultation", details: { subjective: "No headaches, chest pain, or visual symptoms.", objective: "Repeat BP remained above target.", assessment: "Stage 1 hypertension with cardiovascular risk factors.", plan: "Start ramipril, home BP diary, renal function check in two weeks.", outcomeType: "prescription", outcomeDetails: "Ramipril 2.5 mg daily" } },
  { patientIndex: 1, type: "medication", occurredAt: "2025-08-15T16:30:00", title: "Ramipril dose increased", summary: "Home readings remained above target after initial treatment.", authoredBy: "Dr. Mason", source: "telephone review", payload: { medication: { medication: "Ramipril", dose: "5 mg daily", status: "changed", instructions: "Repeat U&E in 14 days." } } },
  { patientIndex: 1, type: "vitals", occurredAt: "2026-02-21T10:30:00", title: "Blood pressure follow-up", summary: "Home readings improving on current medication.", authoredBy: "Dr. Reed", source: "in-person consultation", payload: { vitals: { systolic: 134, diastolic: 82, heartRate: 68 } } },
  { patientIndex: 1, type: "lab-result", occurredAt: "2026-03-01T08:30:00", title: "Renal function normal", summary: "Kidney function and potassium stable after dose change.", authoredBy: "Brighton Pathology", source: "lab feed", payload: { labResult: { testName: "eGFR", result: "82", unit: "mL/min/1.73m2", referenceRange: ">60", status: "normal" } } },
  { patientIndex: 1, type: "patient-message", occurredAt: "2026-04-04T17:05:00", title: "Home BP diary uploaded", summary: "Patient uploaded two weeks of readings ahead of follow-up.", authoredBy: "James Patel", source: "patient portal", payload: { message: { channel: "portal", detail: "Average home BP 130/80 with no dizziness or cough." } } },
  { patientIndex: 2, kind: "visit", occurredAt: "2026-01-18T14:15:00", title: "Migraine review", summary: "Migraine frequency increased after poor sleep and work stress.", authoredBy: "Dr. Mason", source: "in-person consultation", details: { subjective: "Photophobia and nausea, no neurological red flags.", objective: "Neurological exam normal.", assessment: "Migraine without aura, triggered by sleep disruption.", plan: "Headache diary, sleep routine, trial triptan.", outcomeType: "prescription", outcomeDetails: "Sumatriptan 50 mg" } },
  { patientIndex: 2, type: "vitals", occurredAt: "2026-01-18T14:10:00", title: "Headache assessment observations", summary: "Vitals normal during migraine review.", authoredBy: "Practice nurse", source: "clinic observations", payload: { vitals: { systolic: 118, diastolic: 72, heartRate: 72, temperatureC: 36.7 } } },
  { patientIndex: 2, type: "patient-message", occurredAt: "2026-03-12T08:55:00", title: "Headache diary update", summary: "Two headaches in six weeks, both responsive to triptan.", authoredBy: "Maya O'Connell", source: "patient portal", payload: { message: { channel: "portal", detail: "No missed work days since medication started." } } },
  { patientIndex: 2, type: "medication", occurredAt: "2026-03-13T12:00:00", title: "Triptan repeat authorised", summary: "Repeat medication authorised after diary review.", authoredBy: "Dr. Mason", source: "portal review", payload: { medication: { medication: "Sumatriptan", dose: "50 mg as required", status: "renewed" } } },
  { patientIndex: 3, type: "document", occurredAt: "2026-04-10T09:30:00", title: "New patient registration complete", summary: "Transfer records requested from previous GP practice.", authoredBy: "Reception", source: "registration workflow", payload: { document: { documentType: "Registration summary", status: "created" } } },
  { patientIndex: 4, type: "body-metrics", occurredAt: "2025-09-22T10:20:00", title: "Diabetes annual review measurements", summary: "Weight and BMI recorded for diabetes annual review.", authoredBy: "Practice nurse", source: "annual review", payload: { bodyMetrics: { heightCm: 160, weightKg: 81.3, bmi: 31.8 } } },
  { patientIndex: 4, type: "lab-result", occurredAt: "2025-09-24T08:00:00", title: "HbA1c above target", summary: "HbA1c increased compared with prior review.", authoredBy: "Brighton Pathology", source: "lab feed", payload: { labResult: { testName: "HbA1c", result: "64", unit: "mmol/mol", referenceRange: "<48", status: "abnormal" } } },
  { patientIndex: 4, type: "vitals", occurredAt: "2025-09-24T09:00:00", title: "Diabetes review observations", summary: "BP acceptable; weight management discussed.", authoredBy: "Practice nurse", source: "clinic observations", payload: { vitals: { systolic: 130, diastolic: 76, heartRate: 72, temperatureC: 36.5 } } },
  { patientIndex: 4, type: "medication", occurredAt: "2025-10-01T11:00:00", title: "Metformin dose increased", summary: "Dose increased after HbA1c result and telephone counselling.", authoredBy: "Dr. Reed", source: "telephone review", payload: { medication: { medication: "Metformin MR", dose: "1 g twice daily", status: "changed", instructions: "Take with meals." } } },
  { patientIndex: 4, type: "body-metrics", occurredAt: "2026-03-28T11:40:00", title: "Weight check", summary: "Weight reduced after dietitian advice.", authoredBy: "Practice nurse", source: "clinic observations", payload: { bodyMetrics: { heightCm: 160, weightKg: 78.4, bmi: 30.6 } } },
  { patientIndex: 4, type: "lab-result", occurredAt: "2026-04-03T08:00:00", title: "HbA1c improved", summary: "HbA1c improved but remains above target.", authoredBy: "Brighton Pathology", source: "lab feed", payload: { labResult: { testName: "HbA1c", result: "58", unit: "mmol/mol", referenceRange: "<48", status: "borderline" } } },
  { patientIndex: 5, kind: "visit", occurredAt: "2026-02-04T09:20:00", title: "COPD breathlessness review", summary: "Walking tolerance reduced over winter; pulmonary rehab discussed.", authoredBy: "Dr. Mason", source: "in-person consultation", details: { subjective: "Breathless uphill, no fever or purulent sputum.", objective: "Mild wheeze, no focal crepitations.", assessment: "COPD symptoms increased without acute infection.", plan: "Pulmonary rehab referral and inhaler technique check.", outcomeType: "referral", outcomeDetails: "Community respiratory team" } },
  { patientIndex: 5, type: "vitals", occurredAt: "2026-02-04T09:18:00", title: "COPD observations", summary: "Oxygen saturation slightly reduced but stable for patient.", authoredBy: "Practice nurse", source: "clinic observations", payload: { vitals: { systolic: 136, diastolic: 80, heartRate: 82, temperatureC: 36.9, oxygenSaturation: 94, respiratoryRate: 18 } } },
  { patientIndex: 5, type: "referral", occurredAt: "2026-02-05T10:00:00", title: "Pulmonary rehab referral sent", summary: "Referral sent to community respiratory team.", authoredBy: "Dr. Mason", source: "admin task", payload: { referral: { specialty: "Respiratory medicine", destination: "Community respiratory team", status: "sent" } } },
  { patientIndex: 6, kind: "visit", occurredAt: "2026-03-16T16:00:00", title: "Eczema flare", summary: "Dry itchy flexural rash treated with short steroid course.", authoredBy: "Dr. Reed", source: "in-person consultation", details: { subjective: "Itch worse overnight after changing laundry detergent.", objective: "Dry erythematous patches in elbow flexures.", assessment: "Eczema flare without infection.", plan: "Emollient routine and short course hydrocortisone.", outcomeType: "prescription", outcomeDetails: "Hydrocortisone 1% cream" } },
  { patientIndex: 6, type: "medication", occurredAt: "2026-03-16T16:20:00", title: "Topical steroid issued", summary: "Hydrocortisone issued with skin care advice.", authoredBy: "Dr. Reed", source: "consultation outcome", payload: { medication: { medication: "Hydrocortisone 1% cream", dose: "Apply thinly twice daily for 7 days", status: "started" } } },
  { patientIndex: 7, type: "document", occurredAt: "2025-11-15T12:10:00", title: "School allergy plan updated", summary: "Peanut allergy plan refreshed for school records.", authoredBy: "Practice nurse", source: "school form request", payload: { document: { documentType: "School allergy action plan", status: "sent" } } },
  { patientIndex: 7, type: "body-metrics", occurredAt: "2026-01-08T09:00:00", title: "Growth check", summary: "Height and weight tracking along expected centile.", authoredBy: "Practice nurse", source: "clinic observations", payload: { bodyMetrics: { heightCm: 154, weightKg: 45.2, bmi: 19.1 } } },
  { patientIndex: 8, kind: "visit", occurredAt: "2026-04-02T13:10:00", title: "Anxiety and sleep review", summary: "Work stress affecting sleep; no immediate risk concerns.", authoredBy: "Dr. Mason", source: "in-person consultation", details: { subjective: "Stress at work, early waking, no self-harm thoughts.", objective: "Calm, coherent, future-oriented.", assessment: "Anxiety symptoms with sleep disturbance.", plan: "Talking therapy self-referral and sleep routine advice.", outcomeType: "referral", outcomeDetails: "Primary care mental health service" } },
  { patientIndex: 8, type: "referral", occurredAt: "2026-04-02T14:00:00", title: "Mental health self-referral information sent", summary: "Portal message sent with local talking therapy details.", authoredBy: "Dr. Mason", source: "portal document", payload: { referral: { specialty: "Mental health", destination: "Primary care mental health service", status: "requested" } } },
  { patientIndex: 9, type: "lab-result", occurredAt: "2026-01-12T08:00:00", title: "Urate elevated", summary: "Serum urate elevated during gout flare investigation.", authoredBy: "Brighton Pathology", source: "lab feed", payload: { labResult: { testName: "Serum urate", result: "510", unit: "umol/L", referenceRange: "200-430", status: "abnormal" } } },
  { patientIndex: 9, type: "patient-message", occurredAt: "2026-03-22T08:40:00", title: "Toe pain flare call", summary: "Patient called reception with recurrent first toe pain.", authoredBy: "Reception", source: "telephone request", payload: { message: { channel: "phone", detail: "Pain started overnight after restaurant meal; no trauma." } } },
  { patientIndex: 10, type: "lab-result", occurredAt: "2026-02-27T08:00:00", title: "Thyroid function stable", summary: "TSH within target range on current levothyroxine dose.", authoredBy: "Brighton Pathology", source: "lab feed", payload: { labResult: { testName: "TSH", result: "2.1", unit: "mIU/L", referenceRange: "0.4-4.0", status: "normal" } } },
  { patientIndex: 10, type: "medication", occurredAt: "2026-02-28T10:30:00", title: "Levothyroxine repeat renewed", summary: "Repeat prescription renewed after stable thyroid result.", authoredBy: "Dr. Reed", source: "results review", payload: { medication: { medication: "Levothyroxine", dose: "75 mcg daily", status: "renewed" } } },
  { patientIndex: 11, type: "document", occurredAt: "2026-04-16T15:45:00", title: "Brand new patient record created", summary: "No clinical backstory has arrived yet from prior practice.", authoredBy: "Reception", source: "registration workflow", payload: { document: { documentType: "New patient registration", status: "created" } } },
  { patientIndex: 12, kind: "visit", occurredAt: "2026-02-08T11:20:00", title: "Acne medication review", summary: "Topical treatment helping but causing dryness.", authoredBy: "Dr. Reed", source: "in-person consultation", details: { subjective: "Fewer inflamed lesions; dryness around mouth.", objective: "Mild inflammatory acne on cheeks.", assessment: "Partial response to topical therapy.", plan: "Reduce frequency and moisturise; review in eight weeks.", outcomeType: "prescription", outcomeDetails: "Adapalene/benzoyl peroxide gel" } },
  { patientIndex: 12, type: "medication", occurredAt: "2026-02-08T11:40:00", title: "Acne gel continued", summary: "Topical treatment continued with amended instructions.", authoredBy: "Dr. Reed", source: "consultation outcome", payload: { medication: { medication: "Adapalene/benzoyl peroxide gel", dose: "Apply alternate nights", status: "changed" } } },
  { patientIndex: 13, type: "vitals", occurredAt: "2026-03-07T15:35:00", title: "AF follow-up observations", summary: "Rate acceptable at palpitations follow-up.", authoredBy: "Practice nurse", source: "clinic observations", payload: { vitals: { systolic: 130, diastolic: 78, heartRate: 80, oxygenSaturation: 97 } } },
  { patientIndex: 13, kind: "visit", occurredAt: "2026-03-07T15:40:00", title: "Palpitations follow-up", summary: "Known AF; no syncope and symptoms brief.", authoredBy: "Dr. Mason", source: "in-person consultation", details: { subjective: "Brief intermittent palpitations, no syncope or chest pain.", objective: "Pulse irregularly irregular, rate acceptable.", assessment: "Known atrial fibrillation, rate controlled.", plan: "Continue current anticoagulation and safety-net worsening symptoms.", outcomeType: "none" } },
  { patientIndex: 13, type: "medication", occurredAt: "2026-03-08T09:00:00", title: "Apixaban repeat renewed", summary: "Repeat anticoagulant authorised after AF review.", authoredBy: "Dr. Mason", source: "results review", payload: { medication: { medication: "Apixaban", dose: "5 mg twice daily", status: "renewed" } } },
  { patientIndex: 14, type: "lab-result", occurredAt: "2026-03-18T08:00:00", title: "PCOS metabolic screen", summary: "Lipids and HbA1c within monitoring range.", authoredBy: "Brighton Pathology", source: "lab feed", payload: { labResult: { testName: "HbA1c", result: "39", unit: "mmol/mol", referenceRange: "<42", status: "normal" } } },
  { patientIndex: 14, type: "body-metrics", occurredAt: "2026-03-18T09:00:00", title: "PCOS review measurements", summary: "Weight stable compared with last year.", authoredBy: "Practice nurse", source: "clinic observations", payload: { bodyMetrics: { heightCm: 164, weightKg: 74.8, bmi: 27.8 } } },
  { patientIndex: 15, type: "lab-result", occurredAt: "2026-01-09T08:00:00", title: "Cholesterol profile high", summary: "LDL above target; medication discussion planned.", authoredBy: "Brighton Pathology", source: "lab feed", payload: { labResult: { testName: "LDL cholesterol", result: "4.2", unit: "mmol/L", referenceRange: "<3.0", status: "abnormal" } } },
  { patientIndex: 15, type: "medication", occurredAt: "2026-01-18T10:00:00", title: "Atorvastatin started", summary: "Statin started after shared decision-making.", authoredBy: "Dr. Mason", source: "telephone review", payload: { medication: { medication: "Atorvastatin", dose: "20 mg nightly", status: "started", instructions: "Repeat lipids in three months." } } },
  { patientIndex: 16, type: "document", occurredAt: "2026-04-11T14:00:00", title: "Registration note", summary: "Patient has no active conditions and has not yet needed a clinical appointment.", authoredBy: "Reception", source: "registration workflow", payload: { document: { documentType: "Registration summary", status: "created" } } },
  { patientIndex: 17, type: "document", occurredAt: "2026-01-20T09:45:00", title: "Egg allergy plan updated", summary: "Nursery allergy action plan updated and sent to parent.", authoredBy: "Practice nurse", source: "parent request", payload: { document: { documentType: "Nursery allergy action plan", status: "sent" } } },
  { patientIndex: 17, type: "body-metrics", occurredAt: "2026-03-02T09:00:00", title: "Growth measurement", summary: "Height and weight recorded at eczema review.", authoredBy: "Practice nurse", source: "clinic observations", payload: { bodyMetrics: { heightCm: 123, weightKg: 24.1, bmi: 15.9 } } },
  { patientIndex: 18, kind: "visit", occurredAt: "2026-01-29T10:00:00", title: "Knee pain review", summary: "Osteoarthritis flare managed conservatively.", authoredBy: "Dr. Reed", source: "in-person consultation", details: { subjective: "Pain worse after walking; morning stiffness under 30 minutes.", objective: "Mild crepitus, no hot swollen joint.", assessment: "Likely osteoarthritis flare.", plan: "Exercise sheet and topical analgesia.", outcomeType: "prescription", outcomeDetails: "Topical diclofenac gel" } },
  { patientIndex: 18, type: "vitals", occurredAt: "2026-01-29T09:55:00", title: "Older adult review observations", summary: "Observations stable during knee pain review.", authoredBy: "Practice nurse", source: "clinic observations", payload: { vitals: { systolic: 138, diastolic: 84, heartRate: 73, temperatureC: 36.4 } } },
  { patientIndex: 18, type: "medication", occurredAt: "2026-01-29T10:20:00", title: "Topical NSAID prescribed", summary: "Topical analgesia preferred due to age and comorbidity risk.", authoredBy: "Dr. Reed", source: "consultation outcome", payload: { medication: { medication: "Diclofenac gel", dose: "Apply up to four times daily", status: "started" } } },
  { patientIndex: 19, kind: "visit", occurredAt: "2026-03-05T09:20:00", title: "Reflux review", summary: "Symptoms worse after late meals; no alarm features.", authoredBy: "Dr. Reed", source: "telephone consultation", details: { subjective: "Burning after meals, no dysphagia or weight loss.", assessment: "GERD flare likely diet related.", plan: "Lifestyle advice and short PPI course.", outcomeType: "prescription", outcomeDetails: "Omeprazole 20 mg" } },
  { patientIndex: 19, type: "medication", occurredAt: "2026-03-05T09:35:00", title: "PPI course started", summary: "Short PPI course prescribed for reflux flare.", authoredBy: "Dr. Reed", source: "telephone consultation", payload: { medication: { medication: "Omeprazole", dose: "20 mg daily for 28 days", status: "started" } } },
];

export const seedData = {
  patients,
  appointments,
  recordEntries: recordEntries.flatMap(expandRecordEntry),
};