"use client";

import type { TokenResponse } from "@/app/lib/types";
import { maskToken } from "@/app/lib/utils";
import { CopyableField } from "@/app/components/CopyableField";

type SuccessViewProps = {
  token: TokenResponse;
  interactionsList: unknown[];
  interactionsLoading: boolean;
  interactionsError: string | null;
};

export function SuccessView({
  token,
  interactionsList,
  interactionsLoading,
  interactionsError,
}: SuccessViewProps) {
  return (
    <div className="w-full max-w-md mx-auto space-y-6 text-left">
      <p className="text-green-700 font-medium text-center">
        Token acquired successfully.
      </p>
      <CopyableField
        label="Access token"
        value={token.accessToken}
        masked={maskToken(token.accessToken)}
      />
      {token.refreshToken && (
        <CopyableField
          label="Refresh token"
          value={token.refreshToken}
          masked={maskToken(token.refreshToken)}
        />
      )}
      <p className="text-sm text-gray-600">
        Access token valid for: {token.expiresIn} seconds.
        {token.refreshExpiresIn != null && (
          <> Refresh token valid for: {token.refreshExpiresIn} seconds.</>
        )}
      </p>

      <section className="border-t pt-6">
        <h2 className="text-lg font-semibold mb-2">Request to Corti API</h2>
        <p className="text-sm text-gray-600 mb-3">
          We made a request to the Corti API; here is the result.
        </p>
        {interactionsLoading && (
          <p className="text-sm text-gray-500">Loading interactions…</p>
        )}
        {interactionsError && (
          <p className="text-sm text-red-600">{interactionsError}</p>
        )}
        {!interactionsLoading && !interactionsError && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
            <p className="font-medium text-gray-700 mb-1">
              Interactions (first page): {interactionsList.length} item(s)
            </p>
            {interactionsList.length === 0 ? (
              <p className="text-gray-500">No interactions returned.</p>
            ) : (
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                {interactionsList.slice(0, 5).map((item: unknown, i) => (
                  <li key={i}>
                    {typeof item === "object" && item !== null && "id" in item
                      ? String((item as { id: unknown }).id)
                      : JSON.stringify(item).slice(0, 60) + "…"}
                  </li>
                ))}
                {interactionsList.length > 5 && (
                  <li className="text-gray-500">
                    … and {interactionsList.length - 5} more
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
