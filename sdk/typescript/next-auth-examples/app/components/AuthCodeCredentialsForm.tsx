"use client";

import type { AuthCodeFormState } from "@/app/lib/types";
import { CONSOLE_URL } from "@/app/lib/constants";

type AuthCodeCredentialsFormProps = {
  form: AuthCodeFormState;
  setForm: React.Dispatch<React.SetStateAction<AuthCodeFormState>>;
  onSubmit: (e: React.FormEvent) => void;
  tokenError: string | null;
  tokenLoading: boolean;
};

const inputClassName =
  "flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

export function AuthCodeCredentialsForm({
  form,
  setForm,
  onSubmit,
  tokenError,
  tokenLoading,
}: AuthCodeCredentialsFormProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm mx-auto space-y-4 text-left"
    >
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        You need to choose &quot;Use with Embedded Assistant&quot; and select
        &quot;Auth Code (without PKCE)&quot; there to create this kind of
        account. In the{" "}
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
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm font-medium text-gray-700 shrink-0">
            CLIENT_ID=
          </label>
          <input
            type="text"
            value={form.clientId}
            onChange={(e) =>
              setForm((f) => ({ ...f, clientId: e.target.value }))
            }
            className={inputClassName}
            placeholder="your client id"
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm font-medium text-gray-700 shrink-0">
            CLIENT_SECRET=
          </label>
          <input
            type="password"
            value={form.clientSecret}
            onChange={(e) =>
              setForm((f) => ({ ...f, clientSecret: e.target.value }))
            }
            className={inputClassName}
            placeholder="your client secret"
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm font-medium text-gray-700 shrink-0">
            ENVIRONMENT=
          </label>
          <input
            type="text"
            value={form.environment}
            onChange={(e) =>
              setForm((f) => ({ ...f, environment: e.target.value }))
            }
            className={inputClassName}
            placeholder="e.g. eu"
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm font-medium text-gray-700 shrink-0">
            TENANT=
          </label>
          <input
            type="text"
            value={form.tenant}
            onChange={(e) => setForm((f) => ({ ...f, tenant: e.target.value }))}
            className={inputClassName}
            placeholder="your tenant name"
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm font-medium text-gray-700 shrink-0">
            REDIRECT_URI=
          </label>
          <input
            type="text"
            value={form.redirectUri}
            onChange={(e) =>
              setForm((f) => ({ ...f, redirectUri: e.target.value }))
            }
            className={inputClassName}
            placeholder="https://your-app/callback"
          />
        </div>
      </div>
      {tokenError && (
        <p className="text-sm text-red-600">{tokenError}</p>
      )}
      <div className="flex justify-center pt-1">
        <button
          type="submit"
          disabled={tokenLoading}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {tokenLoading ? "Redirecting…" : "Get token"}
        </button>
      </div>
    </form>
  );
}
