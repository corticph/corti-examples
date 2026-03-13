"use client";

import { Button } from "@/app/components/Button";
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
      <p className="text-green-700 font-medium text-center">Authorization code received.</p>
      <CopyableField label="Authorization code" value={code} masked={`${code.slice(0, 12)}…`} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-center pt-1">
        <Button type="button" size="lg" onClick={onProceed} disabled={loading}>
          {loading ? "Authenticating…" : "Proceed with authentication"}
        </Button>
      </div>
    </div>
  );
}
