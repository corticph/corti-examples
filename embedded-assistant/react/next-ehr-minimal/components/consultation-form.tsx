"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import {
  completeAppointmentAction,
  type InteractionFormState,
} from "@/app/actions";
import {
  getConsultationFormEntryTypes,
  getConsultationTemplate,
} from "@/lib/consultation-templates";
import type { ConsultationType } from "@/lib/ehr-types";
import { recordEntryTypeLabel } from "@/lib/ehr-utils";

type ConsultationFormProps = {
  appointmentId?: number;
  patientId: number;
  consultationType: ConsultationType;
  clinician: string;
  reason: string;
};

const initialState: InteractionFormState = {
  message: null,
  fieldErrors: {},
};

function fieldClass(hasError: boolean) {
  return [
    "w-full rounded-xl px-3 py-2.5",
    hasError
      ? "border-[hsl(var(--variant-error-border))] bg-[hsl(var(--variant-error-bg))]"
      : "",
  ]
    .join(" ")
    .trim();
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <p className="mt-2 text-sm text-[hsl(var(--variant-error-text))]">
      {message}
    </p>
  );
}

function SoapSection({
  letter,
  title,
  description,
  children,
}: {
  letter: "S" | "O" | "A" | "P";
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[hsl(var(--border))] bg-background p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--border))] font-mono-data text-sm font-bold">
          {letter}
        </div>
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        backgroundColor: "hsl(var(--primary))",
        color: "hsl(var(--primary-foreground))",
      }}
      className="button-primary inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save consultation"}
    </button>
  );
}

export function ConsultationForm({
  appointmentId,
  patientId,
  consultationType,
  clinician,
  reason,
}: ConsultationFormProps) {
  const [state, formAction] = useActionState(
    completeAppointmentAction,
    initialState,
  );
  const template = getConsultationTemplate(consultationType);
  const defaultEntryTypes = [...template.defaultEntryTypes];
  const formSupportedEntryTypes = getConsultationFormEntryTypes(consultationType);
  const showMaternityFields = consultationType === "prenatal";
  const optionalEntryTypes = formSupportedEntryTypes.filter(
    (entryType) =>
      !defaultEntryTypes.some((defaultEntryType) => defaultEntryType === entryType),
  );
  const defaultOutcomeType =
    consultationType === "medication-review" ? "prescription" : "none";

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="patientId" value={patientId} />
      {appointmentId ? (
        <input type="hidden" name="appointmentId" value={appointmentId} />
      ) : null}
      <input type="hidden" name="consultationType" value={consultationType} />
      {defaultEntryTypes.map((entryType) => (
        <input key={entryType} type="hidden" name="entryTypes" value={entryType} />
      ))}

      <div className="border-b border-[hsl(var(--border))] pb-4">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
          {template.label}
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight">
          Consultation record
        </h2>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          {template.description}
        </p>
      </div>

      <section className="rounded-2xl border border-[hsl(var(--border))] bg-background p-4 sm:p-5">
        <h2 className="text-lg font-bold">Record entries</h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          This consultation type creates these entries by default. Add more if the encounter needs them.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {defaultEntryTypes.map((entryType) => (
            <span
              key={entryType}
              className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-1.5 text-sm font-semibold"
            >
              {recordEntryTypeLabel(entryType)}
            </span>
          ))}
        </div>
        {optionalEntryTypes.length > 0 ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-[hsl(var(--muted-foreground))]">
              Add extra entry types
            </summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {optionalEntryTypes.map((entryType) => (
                <label
                  key={entryType}
                  className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm"
                >
                  <input type="checkbox" name="entryTypes" value={entryType} />
                  {recordEntryTypeLabel(entryType)}
                </label>
              ))}
            </div>
          </details>
        ) : null}
      </section>

      {state.message ? (
        <div className="rounded-xl border border-[hsl(var(--variant-error-border))] bg-[hsl(var(--variant-error-bg))] px-4 py-3 text-sm text-[hsl(var(--variant-error-text))]">
          {state.message}
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-2 block font-semibold">Clinician</span>
          <input
            name="clinician"
            defaultValue={clinician}
            aria-invalid={Boolean(state.fieldErrors.clinician)}
            className={fieldClass(Boolean(state.fieldErrors.clinician))}
          />
          <FieldError message={state.fieldErrors.clinician} />
        </label>
        <label className="block text-sm">
          <span className="mb-2 block font-semibold">Reason for visit</span>
          <input
            name="reason"
            defaultValue={reason}
            aria-invalid={Boolean(state.fieldErrors.reason)}
            className={fieldClass(Boolean(state.fieldErrors.reason))}
          />
          <FieldError message={state.fieldErrors.reason} />
        </label>
      </div>

      <SoapSection
        letter="S"
        title="Subjective"
        description="Patient-reported symptoms, concerns, relevant history, and context."
      >
        <label className="block text-sm">
          <span className="mb-2 block font-semibold">Subjective note</span>
          <textarea
            name="subjective"
            rows={5}
            placeholder="Describe the presenting complaint, symptom history, and anything important from the patient perspective."
            aria-invalid={Boolean(state.fieldErrors.subjective)}
            className={fieldClass(Boolean(state.fieldErrors.subjective))}
          />
          <FieldError message={state.fieldErrors.subjective} />
        </label>
      </SoapSection>

      <SoapSection
        letter="O"
        title="Objective"
        description="Examination findings and measurements. Leave fields blank if not recorded."
      >
        <div className="space-y-5">
          <label className="block text-sm">
            <span className="mb-2 block font-semibold">Objective findings</span>
            <textarea
              name="objective"
              rows={4}
              placeholder="Examination findings, observed appearance, or other objective details."
              aria-invalid={Boolean(state.fieldErrors.objective)}
              className={fieldClass(Boolean(state.fieldErrors.objective))}
            />
            <FieldError message={state.fieldErrors.objective} />
          </label>

          <div className="grid gap-5 md:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-2 block font-semibold">Blood pressure</span>
              <input
                name="bloodPressure"
                placeholder="e.g. 124/78"
                aria-invalid={Boolean(state.fieldErrors.bloodPressure)}
                className={`font-mono-data ${fieldClass(Boolean(state.fieldErrors.bloodPressure))}`}
              />
              <FieldError message={state.fieldErrors.bloodPressure} />
            </label>
            <label className="block text-sm">
              <span className="mb-2 block font-semibold">Heart rate</span>
              <input
                name="heartRate"
                type="number"
                min="40"
                max="180"
                placeholder="e.g. 76"
                aria-invalid={Boolean(state.fieldErrors.heartRate)}
                className={`font-mono-data ${fieldClass(Boolean(state.fieldErrors.heartRate))}`}
              />
              <FieldError message={state.fieldErrors.heartRate} />
            </label>
            <label className="block text-sm">
              <span className="mb-2 block font-semibold">Temperature C</span>
              <input
                name="temperatureC"
                type="number"
                min="34"
                max="42"
                step="0.1"
                placeholder="e.g. 36.7"
                aria-invalid={Boolean(state.fieldErrors.temperatureC)}
                className={`font-mono-data ${fieldClass(Boolean(state.fieldErrors.temperatureC))}`}
              />
              <FieldError message={state.fieldErrors.temperatureC} />
            </label>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-2 block font-semibold">Height cm</span>
              <input
                name="heightCm"
                type="number"
                min="40"
                max="230"
                step="0.1"
                aria-invalid={Boolean(state.fieldErrors.heightCm)}
                className={`font-mono-data ${fieldClass(Boolean(state.fieldErrors.heightCm))}`}
              />
              <FieldError message={state.fieldErrors.heightCm} />
            </label>
            <label className="block text-sm">
              <span className="mb-2 block font-semibold">Weight kg</span>
              <input
                name="weightKg"
                type="number"
                min="1"
                max="350"
                step="0.1"
                aria-invalid={Boolean(state.fieldErrors.weightKg)}
                className={`font-mono-data ${fieldClass(Boolean(state.fieldErrors.weightKg))}`}
              />
              <FieldError message={state.fieldErrors.weightKg} />
            </label>
            <label className="block text-sm">
              <span className="mb-2 block font-semibold">BMI</span>
              <input
                name="bmi"
                type="number"
                min="5"
                max="80"
                step="0.1"
                aria-invalid={Boolean(state.fieldErrors.bmi)}
                className={`font-mono-data ${fieldClass(Boolean(state.fieldErrors.bmi))}`}
              />
              <FieldError message={state.fieldErrors.bmi} />
            </label>
          </div>
        </div>
      </SoapSection>

      <div className="grid gap-6 xl:grid-cols-2">
        <SoapSection
          letter="A"
          title="Assessment"
          description="Working diagnosis, interpretation, or clinical impression."
        >
          <label className="block text-sm">
            <span className="mb-2 block font-semibold">Assessment</span>
            <textarea
              name="assessment"
              rows={5}
              placeholder="Summarise the clinical impression or differential diagnosis."
              aria-invalid={Boolean(state.fieldErrors.assessment)}
              className={fieldClass(Boolean(state.fieldErrors.assessment))}
            />
            <FieldError message={state.fieldErrors.assessment} />
          </label>
        </SoapSection>

        <SoapSection
          letter="P"
          title="Plan"
          description="Advice, follow-up, prescriptions, investigations, or referrals."
        >
          <label className="block text-sm">
            <span className="mb-2 block font-semibold">Plan</span>
            <textarea
              name="plan"
              rows={5}
              placeholder="Document management, safety-netting, follow-up, and any planned actions."
              aria-invalid={Boolean(state.fieldErrors.plan)}
              className={fieldClass(Boolean(state.fieldErrors.plan))}
            />
            <FieldError message={state.fieldErrors.plan} />
          </label>
        </SoapSection>
      </div>

      <section className="rounded-2xl border border-[hsl(var(--border))] bg-background p-4 sm:p-5">
        <h2 className="text-lg font-bold">Template-specific entries</h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Fill the sections that match the selected consultation type or any extra entry types you added.
        </p>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-2 block font-semibold">Test ordered</span>
            <input
              name="testName"
              placeholder="e.g. HbA1c, FBC, urine culture"
              aria-invalid={Boolean(state.fieldErrors.testName)}
              className={fieldClass(Boolean(state.fieldErrors.testName))}
            />
            <FieldError message={state.fieldErrors.testName} />
          </label>
          <label className="block text-sm">
            <span className="mb-2 block font-semibold">Test reason</span>
            <input
              name="testReason"
              placeholder="Why the investigation is needed"
              aria-invalid={Boolean(state.fieldErrors.testReason)}
              className={fieldClass(Boolean(state.fieldErrors.testReason))}
            />
            <FieldError message={state.fieldErrors.testReason} />
          </label>
          <label className="block text-sm">
            <span className="mb-2 block font-semibold">Vaccine</span>
            <input
              name="vaccine"
              placeholder="e.g. Influenza, MMR, COVID booster"
              aria-invalid={Boolean(state.fieldErrors.vaccine)}
              className={fieldClass(Boolean(state.fieldErrors.vaccine))}
            />
            <FieldError message={state.fieldErrors.vaccine} />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-2 block font-semibold">Dose</span>
              <input name="vaccineDose" className={fieldClass(false)} />
            </label>
            <label className="block text-sm">
              <span className="mb-2 block font-semibold">Site</span>
              <input name="vaccineSite" className={fieldClass(false)} />
            </label>
            <label className="block text-sm">
              <span className="mb-2 block font-semibold">Batch</span>
              <input name="vaccineBatch" className={fieldClass(false)} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-2 block font-semibold">Vaccination status</span>
            <select name="vaccineStatus" defaultValue="administered" className={fieldClass(false)}>
              <option value="administered">Administered</option>
              <option value="planned">Planned</option>
              <option value="declined">Declined</option>
            </select>
          </label>
          {showMaternityFields ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm">
                  <span className="mb-2 block font-semibold">Gestation weeks</span>
                  <input
                    name="gestationWeeks"
                    type="number"
                    min="4"
                    max="43"
                    step="0.1"
                    aria-invalid={Boolean(state.fieldErrors.gestationWeeks)}
                    className={`font-mono-data ${fieldClass(Boolean(state.fieldErrors.gestationWeeks))}`}
                  />
                  <FieldError message={state.fieldErrors.gestationWeeks} />
                </label>
                <label className="block text-sm">
                  <span className="mb-2 block font-semibold">Fetal HR</span>
                  <input
                    name="fetalHeartRate"
                    type="number"
                    min="80"
                    max="220"
                    aria-invalid={Boolean(state.fieldErrors.fetalHeartRate)}
                    className={`font-mono-data ${fieldClass(Boolean(state.fieldErrors.fetalHeartRate))}`}
                  />
                  <FieldError message={state.fieldErrors.fetalHeartRate} />
                </label>
                <label className="block text-sm">
                  <span className="mb-2 block font-semibold">Fundal height</span>
                  <input
                    name="fundalHeightCm"
                    type="number"
                    min="8"
                    max="50"
                    step="0.1"
                    aria-invalid={Boolean(state.fieldErrors.fundalHeightCm)}
                    className={`font-mono-data ${fieldClass(Boolean(state.fieldErrors.fundalHeightCm))}`}
                  />
                  <FieldError message={state.fieldErrors.fundalHeightCm} />
                </label>
              </div>
              <label className="block text-sm lg:col-span-2">
                <span className="mb-2 block font-semibold">Maternity notes</span>
                <textarea
                  name="maternityNotes"
                  rows={3}
                  placeholder="Antenatal observations, concerns, fetal movement, or follow-up."
                  aria-invalid={Boolean(state.fieldErrors.maternityNotes)}
                  className={fieldClass(Boolean(state.fieldErrors.maternityNotes))}
                />
                <FieldError message={state.fieldErrors.maternityNotes} />
              </label>
            </>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-[hsl(var(--border))] bg-background p-4 sm:p-5">
        <div className="grid gap-5 md:grid-cols-[0.4fr_0.6fr]">
          <label className="block text-sm">
            <span className="mb-2 block font-semibold">Outcome type</span>
            <select
              name="outcomeType"
              defaultValue={defaultOutcomeType}
              aria-invalid={Boolean(state.fieldErrors.outcomeType)}
              className={fieldClass(Boolean(state.fieldErrors.outcomeType))}
            >
              <option value="none">Advice only</option>
              <option value="prescription">Prescription</option>
              <option value="referral">Referral letter</option>
            </select>
            <FieldError message={state.fieldErrors.outcomeType} />
          </label>

          <label className="block text-sm">
            <span className="mb-2 block font-semibold">Outcome details</span>
            <input
              name="outcomeDetails"
              placeholder="Medication, destination specialty, or leave blank for advice only."
              aria-invalid={Boolean(state.fieldErrors.outcomeDetails)}
              className={fieldClass(Boolean(state.fieldErrors.outcomeDetails))}
            />
            <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
              Required when the outcome is a prescription or referral.
            </p>
            <FieldError message={state.fieldErrors.outcomeDetails} />
          </label>
        </div>
      </section>

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
