import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NeuroTrack", template: "%s · NeuroTrack" },
  description:
    "Open-source research platform for addiction neuroscience, behavioural research and experimental quantum computing. Educational, not clinical.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
