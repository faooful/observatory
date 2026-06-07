import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Observatory",
  description: "OSRS topographic map interaction prototype"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
