"use client";

import type { ComponentProps, Dispatch, SetStateAction } from "react";
import { Button } from "@/app/components/Button";
import { FormField } from "@/app/components/FormField";
import { CONSOLE_URL } from "@/app/lib/constants";
import type { PkceFormState } from "@/app/lib/types";

type PkceCredentialsFormProps = {
  form: PkceFormState;
  setForm: Dispatch<SetStateAction<PkceFormState>>;
  onSubmit: NonNullable<ComponentProps<"form">["onSubmit"]>;
  tokenError: string | null;
  tokenLoading: boolean;
};

export function PkceCredentialsForm({
  form,
  setForm,
  onSubmit,
  tokenError,
  tokenLoading,
}: PkceCredentialsFormProps) {
  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm mx-auto space-y-4 text-left">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        You need to choose &quot;Use with Embedded Assistant&quot; and select &quot;Auth Code (with
        PKCE)&quot; there to create this kind of account. In the{" "}
        <a
          href={CONSOLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-medium"
        >
          Console
        </a>{" "}
        &quot;customers&quot; tab, add a client. No client secret is needed for PKCE.
      </div>
      <div className="grid gap-3">
        <FormField
          id="pkce-client-id"
          name="clientId"
          label="CLIENT_ID="
          type="text"
          value={form.clientId}
          onChange={(v) => setForm((f) => ({ ...f, clientId: v }))}
          placeholder="your client id"
        />
        <FormField
          id="pkce-environment"
          name="environment"
          label="ENVIRONMENT="
          type="text"
          value={form.environment}
          onChange={(v) => setForm((f) => ({ ...f, environment: v }))}
          placeholder="e.g. eu"
        />
        <FormField
          id="pkce-tenant"
          name="tenant"
          label="TENANT="
          type="text"
          value={form.tenant}
          onChange={(v) => setForm((f) => ({ ...f, tenant: v }))}
          placeholder="your tenant name"
        />
        <FormField
          id="pkce-redirect-uri"
          name="redirectUri"
          label="REDIRECT_URI="
          type="text"
          value={form.redirectUri}
          onChange={(v) => setForm((f) => ({ ...f, redirectUri: v }))}
          placeholder="https://your-app/callback"
        />
      </div>
      {tokenError && <p className="text-sm text-red-600">{tokenError}</p>}
      <div className="flex justify-center pt-1">
        <Button type="submit" disabled={tokenLoading}>
          {tokenLoading ? "Redirecting…" : "Get token"}
        </Button>
      </div>
    </form>
  );
}
