import LayoutShell from "@/components/LayoutShell";
import { ToastProvider } from "@/components/ToastProvider";
import { ConfirmDialogProvider } from "@/components/ConfirmDialogProvider";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { cookies } from "next/headers";
import { parseSession } from "@/lib/auth";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

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
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${geistSans.variable} h-full antialiased`}>
      <body className="h-full bg-gray-50">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ToastProvider>
            <ConfirmDialogProvider>
              {role ? (
                <LayoutShell role={role}>{children}</LayoutShell>
              ) : (
                children
              )}
            </ConfirmDialogProvider>
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
