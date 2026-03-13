"use client";

import type { Dispatch, SetStateAction, SubmitEvent } from "react";
import { Button } from "@/app/components/Button";
import { FormField } from "@/app/components/FormField";
import { CONSOLE_URL } from "@/app/lib/constants";
import type { AuthCodeFormState } from "@/app/lib/types";

type AuthCodeCredentialsFormProps = {
  form: AuthCodeFormState;
  setForm: Dispatch<SetStateAction<AuthCodeFormState>>;
  onSubmit: (e: SubmitEvent) => void;
  tokenError: string | null;
  tokenLoading: boolean;
};

export function AuthCodeCredentialsForm({
  form,
  setForm,
  onSubmit,
  tokenError,
  tokenLoading,
}: AuthCodeCredentialsFormProps) {
  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm mx-auto space-y-4 text-left">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        You need to choose &quot;Use with Embedded Assistant&quot; and select &quot;Auth Code
        (without PKCE)&quot; there to create this kind of account. In the{" "}
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
          id="authcode-client-id"
          label="CLIENT_ID="
          type="text"
          value={form.clientId}
          onChange={(v) => setForm((f) => ({ ...f, clientId: v }))}
          placeholder="your client id"
        />
        <FormField
          id="authcode-client-secret"
          label="CLIENT_SECRET="
          type="password"
          value={form.clientSecret}
          onChange={(v) => setForm((f) => ({ ...f, clientSecret: v }))}
          placeholder="your client secret"
        />
        <FormField
          id="authcode-environment"
          label="ENVIRONMENT="
          type="text"
          value={form.environment}
          onChange={(v) => setForm((f) => ({ ...f, environment: v }))}
          placeholder="e.g. eu"
        />
        <FormField
          id="authcode-tenant"
          label="TENANT="
          type="text"
          value={form.tenant}
          onChange={(v) => setForm((f) => ({ ...f, tenant: v }))}
          placeholder="your tenant name"
        />
        <FormField
          id="authcode-redirect-uri"
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
