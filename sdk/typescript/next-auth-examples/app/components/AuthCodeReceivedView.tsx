"use client";

import { CopyableField } from "@/app/components/CopyableField";

type AuthCodeReceivedViewProps = {
  code: string;
  onProceed: () => void;
  loading: boolean;
  error: string | null;
};

export function AuthCodeReceivedView({
  code,
  onProceed,
  loading,
  error,
}: AuthCodeReceivedViewProps) {
  return (
    <div className="w-full max-w-md mx-auto space-y-5 text-left">
      <p className="text-green-700 font-medium text-center">
        Authorization code received.
      </p>
      <CopyableField
        label="Authorization code"
        value={code}
        masked={code.slice(0, 12) + "…"}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-center pt-1">
        <button
          type="button"
          onClick={onProceed}
          disabled={loading}
          className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Authenticating…" : "Proceed with authentication"}
        </button>
      </div>
    </div>
  );
}
