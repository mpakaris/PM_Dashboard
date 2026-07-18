"use client";

import { pushDevToProd, pushProdToDev } from "@/actions/devTools";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const sections = [
  {
    label: "Organisation",
    items: [
      { label: "Team Members", href: "/team" },
      { label: "Roles", href: "/roles" },
      { label: "Profiles", href: "/profiles" },
      { label: "Subs", href: "/subs" },
    ],
  },
  {
    label: "Projects",
    items: [
      { label: "Dashboard", href: "/" },
      { label: "Projects", href: "/projects" },
      { label: "Assignments", href: "/assignments" },
      { label: "Performance", href: "/overview" },
    ],
  },
  {
    label: "Forecast",
    items: [
      { label: "Planning", href: "/planning" },
      { label: "Timesheets", href: "/timesheets" },
    ],
  },
  {
    label: "SAP Import",
    items: [{ label: "ELSAP", href: "/elsap" }],
  },
  {
    label: "Bookkeeping",
    items: [
      { label: "Invoicing Client", href: "/invoicing" },
      { label: "Invoicing Subs", href: "/subinvoices" },
    ],
  },
];

export default function Sidebar({
  open = true,
  onToggle,
}: {
  open?: boolean;
  onToggle?: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={`fixed left-0 top-0 h-full w-60 bg-slate-800 text-slate-100 flex flex-col z-40 transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"}`}
    >
      <div className="px-6 py-5 border-b border-slate-700 flex items-center justify-between">
        <h1 className="text-lg font-bold text-white leading-tight">
          Resource Dashboard
        </h1>
        <button
          onClick={onToggle}
          title="Hide sidebar"
          className="text-slate-400 hover:text-white transition-colors p-1 rounded hover:bg-slate-700"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href ||
                      pathname.startsWith(item.href + "/");
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
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {process.env.NODE_ENV === "development" && <DevToolsPanel />}
    </aside>
  );
}

function DevToolsPanel() {
  const [devState, setDevState] = useState<"idle" | "busy" | "done" | "error">(
    "idle",
  );
  const [prodState, setProdState] = useState<
    "idle" | "busy" | "done" | "error"
  >("idle");
  const [errMsg, setErrMsg] = useState("");

  async function handlePushToProd() {
    if (
      !confirm(
        "Push DEV → PROD?\n\nThis overwrites production with your local dev data. Cannot be undone.",
      )
    )
      return;
    setDevState("busy");
    try {
      const r = await pushDevToProd();
      if (r.ok) {
        setDevState("done");
        setTimeout(() => setDevState("idle"), 3000);
      } else {
        setErrMsg(r.error ?? "Unknown error");
        setDevState("error");
        setTimeout(() => setDevState("idle"), 5000);
      }
    } catch (e) {
      setErrMsg(String(e));
      setDevState("error");
      setTimeout(() => setDevState("idle"), 5000);
    }
  }

  async function handlePullFromProd() {
    if (
      !confirm(
        "Pull PROD → DEV?\n\nThis flushes the local dev database and replaces it with production data.",
      )
    )
      return;
    setProdState("busy");
    try {
      const r = await pushProdToDev();
      if (r.ok) {
        setProdState("done");
        setTimeout(() => setProdState("idle"), 3000);
      } else {
        setErrMsg(r.error ?? "Unknown error");
        setProdState("error");
        setTimeout(() => setProdState("idle"), 5000);
      }
    } catch (e) {
      setErrMsg(String(e));
      setProdState("error");
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
    </div>
  );
}
