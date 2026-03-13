"use client";

import type { Dispatch, SetStateAction, SubmitEvent } from "react";
import { Button } from "@/app/components/Button";
import { FormField } from "@/app/components/FormField";
import { CONSOLE_URL } from "@/app/lib/constants";
import type { FormState } from "@/app/lib/types";

type ClientCredentialsFormProps = {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  onSubmit: (e: SubmitEvent) => void;
  tokenError: string | null;
  tokenLoading: boolean;
};

export function ClientCredentialsForm({
  form,
  setForm,
  onSubmit,
  tokenError,
  tokenLoading,
}: ClientCredentialsFormProps) {
  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm mx-auto space-y-4 text-left">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        You need to go to{" "}
        <a
          href={CONSOLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-medium"
        >
          Console
        </a>{" "}
        to create or copy these values. This is the default client created when you create a new API
        Client there.
      </div>
      <div className="grid gap-3">
        <FormField
          id="cc-client-id"
          label="CLIENT_ID="
          type="text"
          value={form.clientId}
          onChange={(v) => setForm((f) => ({ ...f, clientId: v }))}
          placeholder="your client id"
        />
        <FormField
          id="cc-client-secret"
          label="CLIENT_SECRET="
          type="password"
          value={form.clientSecret}
          onChange={(v) => setForm((f) => ({ ...f, clientSecret: v }))}
          placeholder="your client secret"
        />
        <FormField
          id="cc-environment"
          label="ENVIRONMENT="
          type="text"
          value={form.environment}
          onChange={(v) => setForm((f) => ({ ...f, environment: v }))}
          placeholder="e.g. eu"
        />
        <FormField
          id="cc-tenant"
          label="TENANT="
          type="text"
          value={form.tenant}
          onChange={(v) => setForm((f) => ({ ...f, tenant: v }))}
          placeholder="your tenant name"
        />
      </div>
      {tokenError && <p className="text-sm text-red-600">{tokenError}</p>}
      <div className="flex justify-center pt-1">
        <Button type="submit" disabled={tokenLoading}>
          {tokenLoading ? "Loading…" : "Get token"}
        </Button>
      </div>
    </form>
  );
}
