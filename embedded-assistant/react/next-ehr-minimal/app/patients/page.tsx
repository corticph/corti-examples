import { EhrSidebar } from "@/components/ehr-sidebar";
import { PatientList } from "@/components/ehr-parts";
import { PageShell } from "@/components/ui";
import { getAllPatients } from "@/lib/ehr-db";

export default function PatientsPage() {
  const patients = getAllPatients();

  return (
    <PageShell sidebar={<EhrSidebar activePath="/patients" />}>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-black tracking-tight">Patients</h1>
          <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--muted-foreground))]">
            Review patient demographics, background, recent record activity, and
            upcoming appointments.
          </p>
        </header>
        <PatientList patients={patients} />
      </div>
    </PageShell>
  );
}
