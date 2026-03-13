"use client";

import type { Dispatch, SetStateAction, SubmitEvent } from "react";
import { Button } from "@/app/components/Button";
import { FormField } from "@/app/components/FormField";
import { CONSOLE_URL } from "@/app/lib/constants";
import type { RopcFormState } from "@/app/lib/types";

type RopcCredentialsFormProps = {
  form: RopcFormState;
  setForm: Dispatch<SetStateAction<RopcFormState>>;
  onSubmit: (e: SubmitEvent) => void;
  tokenError: string | null;
  tokenLoading: boolean;
};

export function RopcCredentialsForm({
  form,
  setForm,
  onSubmit,
  tokenError,
  tokenLoading,
}: RopcCredentialsFormProps) {
  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm mx-auto space-y-4 text-left">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        You need to choose &quot;Use with Embedded Assistant&quot; and select &quot;ROPC&quot; there
        to create this kind of account. In the{" "}
        <a
          href={CONSOLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-medium"
        >
          Console
        </a>{" "}
        &quot;customers&quot; tab, add a client with their own password.
      </div>
      <div className="grid gap-3">
        <FormField
          id="ropc-client-id"
          label="CLIENT_ID="
          type="text"
          value={form.clientId}
          onChange={(v) => setForm((f) => ({ ...f, clientId: v }))}
          placeholder="your client id"
        />
        <FormField
          id="ropc-environment"
          label="ENVIRONMENT="
          type="text"
          value={form.environment}
          onChange={(v) => setForm((f) => ({ ...f, environment: v }))}
          placeholder="e.g. eu"
        />
        <FormField
          id="ropc-tenant"
          label="TENANT="
          type="text"
          value={form.tenant}
          onChange={(v) => setForm((f) => ({ ...f, tenant: v }))}
          placeholder="your tenant name"
        />
        <FormField
          id="ropc-username"
          label="USERNAME="
          type="text"
          value={form.username}
          onChange={(v) => setForm((f) => ({ ...f, username: v }))}
          placeholder="username"
        />
        <FormField
          id="ropc-password"
          label="PASSWORD="
          type="password"
          value={form.password}
          onChange={(v) => setForm((f) => ({ ...f, password: v }))}
          placeholder="password"
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
