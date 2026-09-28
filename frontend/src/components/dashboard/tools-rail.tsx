import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Bot,
  ChevronRight,
  LayoutDashboard,
  Moon,
  ReceiptText,
  ScrollText,
  Sun,
  Wrench,
  X,
} from "lucide-react";

import { ABOUT_OPEN_EVENT } from "@/components/dashboard/about-panel";
import { openMethodology } from "@/components/dashboard/methodology-panel";
import { LogoAeroTrend } from "@/components/logo-aero-trend";
import { getRouteSeries, ROUTES, type SectorScope } from "@/lib/series";
import { cn, formatInr, formatSignedPercent } from "@/lib/utils";
import type { ThemeName } from "@/lib/theme";

interface ToolsRailProps {
  theme: ThemeName;
  onToggleTheme: () => void;
  scope: SectorScope;
  onSelectScope: (scope: SectorScope) => void;
}

const SECTION_TARGETS: Array<{ id: string; label: string; test: RegExp }> = [
  { id: "top", label: "Executive masthead", test: /^$/ },
  { id: "sec-controls", label: "Controls & KPIs", test: /INDEX BASE|HORIZON/ },
  { id: "sec-chart", label: "APIx time series", test: /APIx Time Series/ },
  { id: "sec-decomp", label: "Fare decomposition", test: /Fare Decomposition|Fare decomposition/i },
  { id: "sec-telemetry", label: "Telemetry & API", test: /PIPELINE TELEMETRY|Scraper|API Playground/i },
];

/** Flyout rows grouped by purpose — everything the old multi-button rail did. */
type FlyoutRow =
  | { kind: "header"; label: string }
  | { kind: "action"; id: string; label: string; hint?: string; icon: React.ReactNode; active?: boolean; badge?: { text: string; tone: "up" | "down" }; run: () => void };

/**
 * Left docked tools rail — ONE button that opens the full toolbox flyout:
 * route watchlist with live prices, section jumps, fare-decomposition and
 * About shortcuts, the analyst assistant, and the theme toggle.
 * Auto-hides on small viewports (the dashboard remains fully usable).
 */
export function ToolsRail({ theme, onToggleTheme, scope, onSelectScope }: ToolsRailProps) {
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("top");
  const railRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  // Reveal after mount so the entrance animation plays once fonts/layout settle.
  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), 150);
    return () => window.clearTimeout(t);
  }, []);

  // Close the flyout on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (railRef.current && !railRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  // Track the section currently in view for the jump-row indicators.
  useEffect(() => {
    const headings = SECTION_TARGETS.filter((s) => s.id !== "top")
      .map((s) => {
        const el = Array.from(document.querySelectorAll("h1, h2, p")).find((h) =>
          s.test.test(h.textContent ?? ""),
        );
        return el ? { id: s.id, top: el.getBoundingClientRect().top + window.scrollY } : null;
      })
      .filter((x): x is { id: string; top: number } => x !== null);
    if (!headings.length) return;
    const onScroll = () => {
      const probe = window.scrollY + 160;
      let current = "top";
      for (const h of headings) if (probe >= h.top) current = h.id;
      setActiveSection(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Watchlist prices are read live from the anchored series (₹ + DoD).
  const watchlist = useMemo(
    () =>
      ROUTES.map((r) => {
        const series = getRouteSeries(r.id);
        const last = series[series.length - 1];
        const prev = series[series.length - 2] ?? last;
        return {
          id: r.id,
          corridor: r.corridor,
          weight: r.weight,
          fare: last.fare,
          dodPct: prev.apix2024 ? ((last.apix2024 - prev.apix2024) / prev.apix2024) * 100 : 0,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const jumpTo = (target: string) => {
    if (target === "top") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const heading = SECTION_TARGETS.find((s) => s.id === target);
    const el = heading
      ? Array.from(document.querySelectorAll("h1, h2, p")).find((h) => heading.test.test(h.textContent ?? ""))
      : null;
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const rows = useMemo<FlyoutRow[]>(
    () => [
      { kind: "header", label: "Routes & prices" },
      {
        kind: "action",
        id: "scope-national",
        label: "National Aggregate",
        hint: "Weighted · all 5 corridors",
        icon: <LayoutDashboard className="h-4 w-4 text-sky-400" />,
        active: scope === "NATIONAL",
        run: () => onSelectScope("NATIONAL"),
      },
      ...watchlist.map(
        (r): FlyoutRow => ({
          kind: "action",
          id: `scope-${r.id}`,
          label: r.corridor,
          hint: `${r.id} · ${formatInr(r.fare)} · w ${(r.weight * 100).toFixed(0)}%`,
          icon: (
            <span className="flex h-6 w-10 shrink-0 items-center justify-center rounded-md bg-slate-800/70 text-[9.5px] font-bold tracking-wide text-slate-300">
              {r.id}
            </span>
          ),
          badge: {
            text: formatSignedPercent(r.dodPct),
            tone: r.dodPct >= 0 ? "up" : "down",
          },
          active: scope === r.id,
          run: () => onSelectScope(r.id),
        }),
      ),
      { kind: "header", label: "Navigate" },
      ...SECTION_TARGETS.map((s): FlyoutRow => ({
        kind: "action",
        id: `jump-${s.id}`,
        label: s.label,
        icon: (
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              activeSection === s.id ? "bg-sky-400" : "bg-slate-600",
            )}
          />
        ),
        active: activeSection === s.id,
        run: () => jumpTo(s.id),
      })),
      { kind: "header", label: "Tools" },
      {
        kind: "action",
        id: "decomp",
        label: "Fare decomposition",
        hint: "Base fare vs taxes by route",
        icon: <ReceiptText className="h-4 w-4 text-indigo-400" />,
        run: () => jumpTo("sec-decomp"),
      },
      {
        kind: "action",
        id: "methodology",
        label: "Methodology",
        hint: "Formal formulas · COICOP mapping",
        icon: <ScrollText className="h-4 w-4 text-sky-400" />,
        run: () => openMethodology(),
      },
      {
        kind: "action",
        id: "about",
        label: "About FAIR FLIGHT",
        hint: "Every term & panel explained",
        icon: <BookOpen className="h-4 w-4 text-amber-400" />,
        run: () => window.dispatchEvent(new CustomEvent(ABOUT_OPEN_EVENT)),
      },
      {
        kind: "action",
        id: "assistant",
        label: "Analyst assistant",
        hint: "Grounded chat on live data",
        icon: <Bot className="h-4 w-4 text-fuchsia-400" />,
        run: () => window.dispatchEvent(new CustomEvent("apix:open-assistant")),
      },
      {
        kind: "action",
        id: "theme",
        label: theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
        hint: "Aurora ⇄ RBI-portal paper",
        icon:
          theme === "dark" ? (
            <Sun className="h-4 w-4 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4 text-sky-400" />
          ),
        run: () => onToggleTheme(),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, theme, activeSection, watchlist],
  );

  const handleRow = (row: Extract<FlyoutRow, { kind: "action" }>) => {
    row.run();
    // Scope/theme changes keep the flyout open so the state is visible;
    // pure navigation (jumps, about, assistant) closes it.
    if (row.id.startsWith("jump-") || row.id === "about" || row.id === "assistant") {
      setOpen(false);
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.aside
          ref={railRef}
          initial={{ x: -72, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 24, delay: 0.2 }}
          className="fixed left-4 top-1/2 z-40 hidden -translate-y-1/2 lg:block"
          aria-label="Dashboard tools"
        >
          {/* THE single docked button */}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="Open the tools menu — routes, sections, about, assistant, theme"
            title="Tools — routes, prices, sections, about, assistant, theme"
            className={cn(
              "glass-panel group flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-300",
              "hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-950/40",
              open && "shadow-xl shadow-indigo-950/40 ring-2 ring-indigo-400/50",
            )}
          >
            <motion.span
              animate={{ rotate: open ? 90 : 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 24 }}
              className="flex"
            >
              {open ? (
                <ChevronRight className="h-6 w-6 text-indigo-300" strokeWidth={2.2} />
              ) : (
                <Wrench className="h-6 w-6 text-indigo-300" strokeWidth={2.2} />
              )}
            </motion.span>
            {!open && (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950" />
            )}
          </button>

          {/* Flyout — the whole toolbox */}
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, x: -14, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -14, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 320, damping: 26 }}
                className="glass-panel absolute left-16 top-1/2 w-72 -translate-y-1/2 overflow-hidden rounded-2xl shadow-2xl"
                role="menu"
                aria-label="Tools menu"
              >
                <header className="flex items-center justify-between border-b border-slate-700/50 px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <LogoAeroTrend className="h-7 w-7" />
                    <div>
                      <p className="text-[12px] font-bold text-white">FAIR FLIGHT tools</p>
                      <p className="text-[10px] text-slate-500">Everything, one menu</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close tools menu"
                    className="rounded-md p-1 text-slate-500 hover:text-slate-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </header>

                <div className="max-h-[62vh] overflow-y-auto py-1.5">
                  {rows.map((row, i) =>
                    row.kind === "header" ? (
                      <p
                        key={`h-${row.label}-${i}`}
                        className="px-4 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500"
                      >
                        {row.label}
                      </p>
                    ) : (
                      <button
                        key={row.id}
                        type="button"
                        role="menuitem"
                        onClick={() => handleRow(row)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-800/40",
                          row.active && "bg-indigo-500/10",
                        )}
                      >
                        <span className="flex h-6 w-10 shrink-0 items-center justify-center">
                          {row.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block truncate text-[13px] font-semibold text-white",
                              row.active && "text-indigo-200",
                            )}
                          >
                            {row.label}
                          </span>
                          {row.hint && (
                            <span className="block truncate text-[10.5px] text-slate-500">
                              {row.hint}
                            </span>
                          )}
                        </span>
                        {row.active && (
                          <span className="shrink-0 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">
                            ACTIVE
                          </span>
                        )}
                        {row.badge && !row.active && (
                          <span
                            className={cn(
                              "shrink-0 text-[11px] font-bold",
                              row.badge.tone === "up" ? "text-emerald-400" : "text-rose-400",
                            )}
                          >
                            {row.badge.text}
                          </span>
                        )}
                      </button>
                    ),
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

export default ToolsRail;
