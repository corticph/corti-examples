import type { HTMLAttributes, ReactNode } from "react";

export function Card({
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={`rounded-xl border border-muted-300/60 bg-paper shadow-card ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
