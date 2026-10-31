import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Approval Queue",
  description: "AI agents submit drafts; a human approves, edits or rejects them before anything is sent."
};

export const viewport: Viewport = { themeColor: "#0e1512" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
