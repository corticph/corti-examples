import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input
      className={`w-full rounded-lg border border-muted-300 bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted-500 focus:border-ink focus:outline-none ${className}`}
      {...rest}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return (
    <textarea
      className={`w-full rounded-lg border border-muted-300 bg-paper px-3 py-2 font-mono text-sm text-ink placeholder:text-muted-500 focus:border-ink focus:outline-none ${className}`}
      {...rest}
    />
  );
}

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-500"
    >
      {children}
    </label>
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", children, ...rest } = props;
  return (
    <select
      className={`w-full rounded-lg border border-muted-300 bg-paper px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}
