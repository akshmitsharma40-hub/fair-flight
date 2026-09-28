import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Bot,
  CalendarRange,
  CornerDownLeft,
  Flame,
  LayoutDashboard,
  Moon,
  ReceiptText,
  Route as RouteIcon,
  Satellite,
  Scale,
  Search,
  Sun,
  TrendingUp,
} from "lucide-react";
import { ABOUT_OPEN_EVENT } from "@/components/dashboard/about-panel";
import { LogoAeroTrend } from "@/components/logo-aero-trend";
import { MACRO_EVENTS, ROUTES, type BaseYear, type Horizon, type SectorScope } from "@/lib/series";
import type { ThemeName } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  scope: SectorScope;
  baseYear: BaseYear;
  horizon: Horizon;
  theme: ThemeName;
  onScope: (scope: SectorScope) => void;
  onBaseYear: (base: BaseYear) => void;
  onHorizon: (horizon: Horizon) => void;
  onTheme: (theme: ThemeName) => void;
  onAssistant: () => void;
}

interface Command {
  id: string;
  label: string;
  hint?: string;
  section: string;
  icon: React.ReactNode;
  keywords: string;
  run: () => void;
  active?: boolean;
}

/** Custom event fired when the palette requests the assistant to open. */
export const ASSISTANT_OPEN_EVENT = "apix:open-assistant";

export function CommandPalette({
  open,
  onClose,
  scope,
  baseYear,
  horizon,
  theme,
  onScope,
  onBaseYear,
  onHorizon,
  onTheme,
  onAssistant,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset per open so every launch starts from a clean search.
  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      // Focus after the entrance animation mounts the input.
      const t = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        id: "scope-national",
        label: "National Aggregate (Weighted)",
        hint: "Laspeyres 5-corridor basket",
        section: "Sector",
        icon: <LayoutDashboard className="h-4 w-4 text-sky-400" />,
        keywords: "national all weighted aggregate index basket",
        run: () => onScope("NATIONAL"),
        active: scope === "NATIONAL",
      },
      ...ROUTES.map((route) => ({
        id: `scope-${route.id}`,
        label: route.corridor,
        hint: `${route.id} · DGCA weight ${(route.weight * 100).toFixed(0)}%`,
        section: "Sector",
        icon: <RouteIcon className="h-4 w-4 text-indigo-400" />,
        keywords: `${route.id} ${route.corridor} route sector corridor isolate`,
        run: () => onScope(route.id),
        active: scope === route.id,
      })),
      {
        id: "base-2024",
        label: "Base 2024=100",
        hint: "Current MoSPI mandate",
        section: "Index base",
        icon: <Scale className="h-4 w-4 text-sky-400" />,
        keywords: "base year 2024 reindex mandate mospi",
        run: () => onBaseYear("2024"),
        active: baseYear === "2024",
      },
      {
        id: "base-2012",
        label: "Base 2012=100",
        hint: "Legacy series (×1.18 re-index)",
        section: "Index base",
        icon: <Scale className="h-4 w-4 text-violet-400" />,
        keywords: "base year 2012 legacy reindex",
        run: () => onBaseYear("2012"),
        active: baseYear === "2012",
      },
      ...(["7D", "1M", "3M", "ALL"] as Horizon[]).map((h) => ({
        id: `horizon-${h}`,
        label: h === "7D" ? "7-day view" : h === "1M" ? "1-month view" : h === "3M" ? "3-month view" : "Full history",
        hint: `${h} horizon slice`,
        section: "Horizon",
        icon: <CalendarRange className="h-4 w-4 text-emerald-400" />,
        keywords: `${h} horizon range date slice view window`,
        run: () => onHorizon(h),
        active: horizon === h,
      })),
      {
        id: "theme-toggle",
        label: theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
        hint: "Aurora ⇄ RBI-portal paper",
        section: "Appearance",
        icon:
          theme === "dark" ? (
            <Sun className="h-4 w-4 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4 text-sky-400" />
          ),
        keywords: "theme light dark mode appearance toggle",
        run: () => onTheme(theme === "dark" ? "light" : "dark"),
      },
      {
        id: "about",
        label: "What is FAIR FLIGHT? (About panel)",
        hint: "Every acronym, formula, panel & pipeline stage explained",
        section: "Tools",
        icon: <BookOpen className="h-4 w-4 text-amber-400" />,
        keywords: "about help documentation encyclopedia glossary what is fair flight acronyms formulas learn",
        run: () => window.dispatchEvent(new CustomEvent(ABOUT_OPEN_EVENT)),
      },
      {
        id: "assistant",
        label: "Open the analyst assistant",
        hint: "Grounded chat on live index data",
        section: "Tools",
        icon: <Bot className="h-4 w-4 text-fuchsia-400" />,
        keywords: "assistant chat bot ask question analyst ai",
        run: () => {
          window.dispatchEvent(new CustomEvent(ASSISTANT_OPEN_EVENT));
          onAssistant();
        },
      },
      {
        id: "section-controls",
        label: "Go to Controls & KPIs",
        section: "Navigate",
        icon: <Satellite className="h-4 w-4 text-slate-400" />,
        keywords: "go controls kpi section jump navigate top",
        run: () => document.getElementById("sec-controls")?.scrollIntoView({ behavior: "smooth" }),
      },
      {
        id: "section-chart",
        label: "Go to APIx time series",
        section: "Navigate",
        icon: <TrendingUp className="h-4 w-4 text-sky-400" />,
        keywords: "go chart time series forecast arima navigate",
        run: () => document.getElementById("sec-chart")?.scrollIntoView({ behavior: "smooth" }),
      },
      {
        id: "section-decomp",
        label: "Go to fare decomposition",
        section: "Navigate",
        icon: <ReceiptText className="h-4 w-4 text-indigo-400" />,
        keywords: "go decomposition taxes fees base fare navigate",
        run: () => document.getElementById("sec-decomp")?.scrollIntoView({ behavior: "smooth" }),
      },
      {
        id: "section-telemetry",
        label: "Go to telemetry & API playground",
        section: "Navigate",
        icon: <Flame className="h-4 w-4 text-orange-400" />,
        keywords: "go telemetry scraper health api playground navigate",
        run: () => document.getElementById("sec-telemetry")?.scrollIntoView({ behavior: "smooth" }),
      },
      ...MACRO_EVENTS.map((event) => ({
        id: `event-${event.label}`,
        label: `Highlight event: ${event.label}`,
        hint: `${event.kind} shock · jumps to the annotated chart`,
        section: "Events",
        icon: <Flame className="h-4 w-4 text-amber-400" />,
        keywords: `event ${event.label} ${event.kind} ${event.short} macro`,
        run: () => {
          onHorizon("ALL");
          document.getElementById("sec-chart")?.scrollIntoView({ behavior: "smooth" });
        },
      })),
    ];
    return list;
  }, [scope, baseYear, horizon, theme, onScope, onBaseYear, onHorizon, onTheme, onAssistant]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (cmd) => cmd.label.toLowerCase().includes(q) || cmd.keywords.toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Keep the cursor inside the list as the query narrows it.
  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  const runCommand = useCallback(
    (cmd: Command | undefined) => {
      if (!cmd) return;
      cmd.run();
      onClose();
    },
    [onClose],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (filtered.length ? (c + 1) % filtered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (filtered.length ? (c - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runCommand(filtered[cursor]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Scroll the highlighted row into view while arrowing through the list.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-cmd-idx="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  // Group filtered commands by section for scannable headers.
  const grouped = useMemo(() => {
    const map = new Map<string, Array<{ cmd: Command; idx: number }>>();
    filtered.forEach((cmd, idx) => {
      const bucket = map.get(cmd.section) ?? [];
      bucket.push({ cmd, idx });
      map.set(cmd.section, bucket);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-950/60 px-4 pt-[14vh] backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          <motion.div
            initial={{ opacity: 0, y: -18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="glass-panel w-full max-w-xl overflow-hidden rounded-2xl shadow-2xl shadow-slate-950/70"
          >
            {/* Brand + search */}
            <div className="flex items-center gap-3 border-b border-slate-700/50 px-4 py-3.5">
              <LogoAeroTrend className="h-7 w-7 shrink-0" />
              <Search className="h-4.5 w-4.5 shrink-0 text-slate-500" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search commands — routes, base year, horizon, theme…"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
                autoComplete="off"
                spellCheck={false}
              />
              <kbd className="rounded-md border border-slate-700/70 bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[46vh] overflow-y-auto py-2">
              {grouped.length === 0 && (
                <p className="px-5 py-8 text-center text-sm text-slate-500">
                  No commands match “{query}”
                </p>
              )}
              {grouped.map(([section, entries]) => (
                <div key={section}>
                  <p className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                    {section}
                  </p>
                  {entries.map(({ cmd, idx }) => (
                    <button
                      key={cmd.id}
                      type="button"
                      data-cmd-idx={idx}
                      onMouseMove={() => setCursor(idx)}
                      onClick={() => runCommand(cmd)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        idx === cursor ? "bg-indigo-500/15" : "hover:bg-slate-800/30",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700/60",
                          idx === cursor ? "border-indigo-400/50 bg-indigo-500/15" : "bg-slate-900/60",
                        )}
                      >
                        {cmd.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-slate-200">
                          {cmd.label}
                        </span>
                        {cmd.hint && (
                          <span className="block truncate text-[11px] text-slate-500">{cmd.hint}</span>
                        )}
                      </span>
                      {cmd.active && (
                        <span className="shrink-0 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                          ACTIVE
                        </span>
                      )}
                      <span className="shrink-0 text-slate-600">
                        {idx === cursor ? (
                          <CornerDownLeft className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowRight className="h-3.5 w-3.5 opacity-40" />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>

            {/* Footer hints */}
            <div className="flex items-center gap-4 border-t border-slate-700/50 px-4 py-2.5 text-[10.5px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <kbd className="rounded border border-slate-700/70 bg-slate-900/80 px-1 py-0.5 font-semibold">↑↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="rounded border border-slate-700/70 bg-slate-900/80 px-1 py-0.5 font-semibold">↵</kbd>
                run
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <LogoAeroTrend className="h-3 w-3" /> FAIR FLIGHT palette
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default CommandPalette;
