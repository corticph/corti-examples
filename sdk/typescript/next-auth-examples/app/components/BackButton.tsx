"use client";

type BackButtonProps = {
  onClick: () => void;
};

export function BackButton({ onClick }: BackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
      aria-label="Back"
    >
      <span aria-hidden>←</span>
      <span>Back</span>
    </button>
  );
}
