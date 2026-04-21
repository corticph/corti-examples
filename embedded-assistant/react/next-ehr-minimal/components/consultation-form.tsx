"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import {
  completeAppointmentAction,
  type InteractionFormState,
} from "@/app/actions";

type ConsultationFormProps = {
  appointmentId: number;
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
  clinician,
  reason,
}: ConsultationFormProps) {
  const [state, formAction] = useActionState(
    completeAppointmentAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="appointmentId" value={appointmentId} />

      <div className="border-b border-[hsl(var(--border))] pb-4">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
          SOAP note
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight">
          Consultation record
        </h2>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          Record the patient history, objective findings, assessment, and plan
          in a single structured note.
        </p>
      </div>

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
        <div className="grid gap-5 md:grid-cols-[0.4fr_0.6fr]">
          <label className="block text-sm">
            <span className="mb-2 block font-semibold">Outcome type</span>
            <select
              name="outcomeType"
              defaultValue="none"
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
