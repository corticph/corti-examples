// Mock patient + clinician directories (stubbed identity, no real provider).
// The MRNs match the patient records in search-documents-mcp's docs so scoped
// retrieval lines up. This is the file you'd edit to change who sees what.

export interface Clinician {
  id: string;
  name: string;
  role: string;
  patients: string[];
}

export interface PatientRef {
  mrn: string;
  name: string;
}

export interface ClinicianProfile {
  id: string;
  name: string;
  role: string;
  patients: PatientRef[];
}

export const PATIENTS: Record<string, string> = {
  "000-MOCK-1234": "Jane A. Sample",
  "000-MOCK-5678": "John B. Placeholder",
  "000-MOCK-9012": "Maria O. Example",
  "000-MOCK-3456": "Sam P. Test",
};

export const CLINICIANS: Clinician[] = [
  {
    id: "dr-reyes",
    name: "Dr. A. Reyes",
    role: "Cardiology",
    patients: ["000-MOCK-5678", "000-MOCK-9012"],
  },
  {
    id: "dr-okafor",
    name: "Dr. B. Okafor",
    role: "Internal Medicine",
    patients: ["000-MOCK-1234", "000-MOCK-5678", "000-MOCK-9012", "000-MOCK-3456"],
  },
  {
    id: "dr-tanaka",
    name: "Dr. C. Tanaka",
    role: "Family Medicine",
    patients: ["000-MOCK-1234", "000-MOCK-3456"],
  },
];

export function clinicianProfile(clinician: Clinician): ClinicianProfile {
  return {
    id: clinician.id,
    name: clinician.name,
    role: clinician.role,
    patients: clinician.patients.map((mrn) => ({ mrn, name: PATIENTS[mrn] ?? mrn })),
  };
}
