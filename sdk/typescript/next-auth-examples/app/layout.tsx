import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Corti SDK — Next auth examples",
  description: "Auth examples for @corti/sdk in a Next.js application.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
