import LayoutShell from "@/components/LayoutShell";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { cookies } from "next/headers";
import { parseSession } from "@/lib/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ressource Dashboard",
  description: "Team ressource management dashboard",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const store = await cookies();
  const role = await parseSession(store.get("session")?.value);

  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="h-full bg-gray-50">
        {role ? (
          <LayoutShell role={role}>{children}</LayoutShell>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
