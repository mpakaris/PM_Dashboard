"use client";

import { pushDevToProd, pushProdToDev, flushDevDb } from "@/actions/devTools";
import { logout } from "@/actions/auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useToast } from "@/components/ToastProvider";
import { useConfirm } from "@/components/ConfirmDialogProvider";
import { useTranslations } from "next-intl";
import type { Role } from "@/lib/auth";
import { LOCALE_KEY, DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n";

export default function Sidebar({
  open = true,
  onToggle,
  role,
}: {
  open?: boolean;
  onToggle?: () => void;
  role?: Role;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  const sections = [
    {
      key: "organisation",
      items: [
        { key: "teamMembers", href: "/team" },
        { key: "roles", href: "/roles" },
        { key: "profiles", href: "/profiles" },
        { key: "subs", href: "/subs" },
      ],
    },
    {
      key: "projects",
      items: [
        { key: "dashboard", href: "/" },
        { key: "projects", href: "/projects" },
        { key: "assignments", href: "/assignments" },
        { key: "performance", href: "/overview" },
      ],
    },
    {
      key: "forecast",
      items: [
        { key: "planning", href: "/planning" },
        { key: "timesheets", href: "/timesheets" },
        { key: "projektAnalysis", href: "/projekt-analysis" },
      ],
    },
    {
      key: "sapImport",
      items: [{ key: "elsap", href: "/elsap" }],
    },
    {
      key: "bookkeeping",
      items: [
        { key: "invoicingClient", href: "/invoicing" },
        { key: "invoicingSubs", href: "/subinvoices" },
      ],
    },
    {
      key: "fmo",
      items: [
        { key: "import",      href: "/fmo/import" },
        { key: "wbs",         href: "/fmo/wbs" },
        { key: "tickets",     href: "/fmo/tickets" },
        { key: "members",     href: "/fmo/members" },
        { key: "utilization", href: "/fmo/utilization" },
        { key: "projects",    href: "/fmo/projects" },
        { key: "planning",    href: "/fmo/planning" },
      ],
    },
  ];

  return (
    <aside
      className={`fixed left-0 top-0 h-full w-60 bg-slate-800 text-slate-100 flex flex-col z-40 transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"}`}
    >
      <div className="px-6 py-5 border-b border-slate-700 flex items-center justify-between">
        <h1 className="text-lg font-bold text-white leading-tight">
          {t("appTitle")}
        </h1>
        <button
          onClick={onToggle}
          title={t("hideSidebar")}
          className="text-slate-400 hover:text-white transition-colors p-1 rounded hover:bg-slate-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.key}>
            <p className="px-3 mb-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t(section.key as Parameters<typeof t>[0])}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-slate-700 text-white"
                        : "text-slate-300 hover:bg-slate-700 hover:text-white"
                    }`}
                  >
                    {t(item.key as Parameters<typeof t>[0])}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {role && (
        <div className="px-3 py-3 border-t border-slate-700 space-y-2">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              role === "admin" ? "bg-amber-500/20 text-amber-300" : "bg-slate-600 text-slate-300"
            }`}>
              {role === "admin" ? t("admin") : t("viewer")}
            </span>
            <form action={logout}>
              <button
                type="submit"
                className="text-xs text-slate-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-slate-700"
              >
                {t("signOut")}
              </button>
            </form>
          </div>
          <LocaleToggle />
        </div>
      )}

      {process.env.NODE_ENV === "development" && role === "admin" && <DevToolsPanel />}
    </aside>
  );
}

function LocaleToggle() {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = localStorage.getItem(LOCALE_KEY) as Locale | null;
    if (stored && LOCALES.includes(stored)) setLocale(stored);
  }, []);

  function switchLocale(next: Locale) {
    if (next === locale) return;
    localStorage.setItem(LOCALE_KEY, next);
    document.cookie = `${LOCALE_KEY}=${next};path=/;max-age=31536000`;
    window.location.reload();
  }

  return (
    <div className="flex items-center gap-1">
      {LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => switchLocale(l)}
          className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${
            locale === l
              ? 'bg-slate-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function DevToolsPanel() {
  const confirm = useConfirm();
  const toast   = useToast();
  const [devState, setDevState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [prodState, setProdState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [flushState, setFlushState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  async function handleFlushDev() {
    if (!await confirm("Flush ENTIRE DEV database?", { body: "All data (FMO, WBS, tickets, members, project analysis…) will be permanently deleted. PROD is not affected.", destructive: true, confirmLabel: "Flush DEV" })) return;
    setFlushState("busy");
    try {
      const r = await flushDevDb();
      if (r.ok) {
        setFlushState("done");
        toast.success("DEV database flushed");
        setTimeout(() => setFlushState("idle"), 3000);
      } else {
        setErrMsg(r.error ?? "Unknown error");
        setFlushState("error");
        toast.error(r.error ?? "Flush failed");
        setTimeout(() => setFlushState("idle"), 5000);
      }
    } catch (e) {
      setErrMsg(String(e));
      setFlushState("error");
      toast.error(String(e));
      setTimeout(() => setFlushState("idle"), 5000);
    }
  }

  async function handlePushToProd() {
    if (!await confirm("Push DEV → PROD?", { body: "This overwrites production with your local dev data. Cannot be undone.", destructive: true, confirmLabel: "Push to PROD" }))
      return;
    setDevState("busy");
    try {
      const r = await pushDevToProd();
      if (r.ok) {
        setDevState("done");
        toast.success("DEV pushed to PROD");
        setTimeout(() => setDevState("idle"), 3000);
      } else {
        setErrMsg(r.error ?? "Unknown error");
        setDevState("error");
        toast.error(r.error ?? "Push failed");
        setTimeout(() => setDevState("idle"), 5000);
      }
    } catch (e) {
      setErrMsg(String(e));
      setDevState("error");
      toast.error(String(e));
      setTimeout(() => setDevState("idle"), 5000);
    }
  }

  async function handlePullFromProd() {
    if (!await confirm("Pull PROD → DEV?", { body: "This flushes the local dev database and replaces it with production data.", destructive: true, confirmLabel: "Pull from PROD" }))
      return;
    setProdState("busy");
    try {
      const r = await pushProdToDev();
      if (r.ok) {
        setProdState("done");
        toast.success("PROD pulled to DEV");
        setTimeout(() => setProdState("idle"), 3000);
      } else {
        setErrMsg(r.error ?? "Unknown error");
        setProdState("error");
        toast.error(r.error ?? "Pull failed");
        setTimeout(() => setProdState("idle"), 5000);
      }
    } catch (e) {
      setErrMsg(String(e));
      setProdState("error");
      toast.error(String(e));
      setTimeout(() => setProdState("idle"), 5000);
    }
  }

  return (
    <div className="px-3 pb-4 pt-3 border-t border-slate-700 space-y-2">
      <p className="px-3 mb-2 text-xs font-semibold text-amber-500 uppercase tracking-wider">
        Dev Tools
      </p>
      <button
        type="button"
        onClick={handlePullFromProd}
        disabled={prodState === "busy"}
        className="w-full px-3 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 bg-sky-700 hover:bg-sky-600 text-white"
      >
        {prodState === "busy" && "Pulling…"}
        {prodState === "done" && "✓ DEV restored from PROD"}
        {prodState === "error" && `Error: ${errMsg}`}
        {prodState === "idle" && "Pull PROD → DEV"}
      </button>
      <button
        type="button"
        onClick={handlePushToProd}
        disabled={devState === "busy"}
        className="w-full px-3 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 bg-amber-600 hover:bg-amber-500 text-white"
      >
        {devState === "busy" && "Pushing…"}
        {devState === "done" && "✓ Pushed to PROD"}
        {devState === "error" && `Error: ${errMsg}`}
        {devState === "idle" && "Push DEV → PROD"}
      </button>
      <button
        type="button"
        onClick={handleFlushDev}
        disabled={flushState === "busy"}
        className="w-full px-3 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 bg-red-800 hover:bg-red-700 text-white"
      >
        {flushState === "busy" && "Flushing…"}
        {flushState === "done" && "✓ DEV DB cleared"}
        {flushState === "error" && `Error: ${errMsg}`}
        {flushState === "idle" && "Flush DEV DB"}
      </button>
    </div>
  );
}
