"use client";

import { WARNING_COPY } from "@/app/lib/constants";

export function WarningBanner() {
  return (
    <div
      role="alert"
      className="w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 text-center"
    >
      {WARNING_COPY}
    </div>
  );
}
