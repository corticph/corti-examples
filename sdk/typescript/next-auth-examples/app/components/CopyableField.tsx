"use client";

import { useCallback, useState } from "react";

type CopyableFieldProps = {
  value: string;
  masked: string;
  label: string;
};

export function CopyableField({ value, masked, label }: CopyableFieldProps) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [value]);
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
      </label>
      <div className="flex gap-2 items-center">
        <code className="flex-1 bg-gray-100 px-3 py-2 rounded-lg text-sm truncate border border-gray-200">
          {masked}
        </code>
        <button
          type="button"
          onClick={copy}
          className="px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-sm font-medium transition-colors shrink-0"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
