import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "CrewUp — Great projects start with the right people",
  description:
    "Build your next project team. One workspace for projects, open roles, and hiring.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
