import { motion } from "framer-motion";
import { CalendarRange, ChevronDown, Filter, Scale } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { HORIZON_DAYS, ROUTES, type BaseYear, type Horizon, type SectorScope } from "@/lib/series";
import { useT } from "@/lib/i18n";

interface DashboardControlsProps {
  baseYear: BaseYear;
  horizon: Horizon;
  scope: SectorScope;
  onBaseYearChange: (year: BaseYear) => void;
  onHorizonChange: (horizon: Horizon) => void;
  onScopeChange: (scope: SectorScope) => void;
}

const HORIZONS: Array<{ id: Horizon; label: string }> = [
  { id: "7D", label: "7D" },
  { id: "1M", label: "1M" },
  { id: "3M", label: "3M" },
  { id: "ALL", label: "ALL" },
];

const BASE_YEARS: Array<{ id: BaseYear; label: string; hintKey: "baseCurrentHint" | "baseLegacyHint" }> = [
  { id: "2024", label: "Base 2024=100", hintKey: "baseCurrentHint" },
  { id: "2012", label: "Base 2012=100", hintKey: "baseLegacyHint" },
];

export function DashboardControls({
  baseYear,
  horizon,
  scope,
  onBaseYearChange,
  onHorizonChange,
  onScopeChange,
}: DashboardControlsProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const tr = useT();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeScopeLabel =
    scope === "NATIONAL" ? tr("national") : ROUTES.find((r) => r.id === scope)!.corridor;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="glass-panel relative z-20 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl px-5 py-4"
    >
      {/* ---------------------------------------------------------- */}
      {/* Base year segmented pill toggle                             */}
      {/* ---------------------------------------------------------- */}
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          <Scale className="h-3 w-3" /> {tr("indexBase")}
        </p>
        <div className="flex rounded-xl border border-slate-700/70 bg-slate-900/70 p-1">
          {BASE_YEARS.map((option) => {
            const active = baseYear === option.id;
            return (
              <button
                key={option.id}
                type="button"
                title={tr(option.hintKey)}
                onClick={() => onBaseYearChange(option.id)}
                className={cn(
                  "relative rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  active ? "text-white" : "text-slate-400 hover:text-slate-200",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="base-year-pill"
                    className="absolute inset-0 rounded-lg bg-gradient-to-r from-indigo-600 to-sky-500 shadow-lg shadow-indigo-950/50"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------------------------------------------------------- */}
      {/* Time-horizon selector                                       */}
      {/* ---------------------------------------------------------- */}
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          <CalendarRange className="h-3 w-3" /> {tr("horizon")} ({HORIZON_DAYS[horizon]}d)
        </p>
        <div className="flex rounded-xl border border-slate-700/70 bg-slate-900/70 p-1">
          {HORIZONS.map((option) => {
            const active = horizon === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onHorizonChange(option.id)}
                className={cn(
                  "relative rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  active ? "text-white" : "text-slate-400 hover:text-slate-200",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="horizon-pill"
                    className="absolute inset-0 rounded-lg bg-gradient-to-r from-indigo-600 to-sky-500 shadow-lg shadow-indigo-950/50"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------------------------------------------------------- */}
      {/* Sector filter dropdown                                      */}
      {/* ---------------------------------------------------------- */}
      <div className="min-w-56" ref={dropdownRef}>
        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          <Filter className="h-3 w-3" /> {tr("sector")}
        </p>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={open}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700/70 bg-slate-900/70 px-3.5 py-2 text-left text-sm font-medium text-slate-200 transition-colors hover:border-slate-500"
          >
            <span className="truncate">
              {scope !== "NATIONAL" && (
                <span className="mr-2 rounded-md bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300">
                  {scope}
                </span>
              )}
              {activeScopeLabel}
            </span>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
            />
          </button>

          {open && (
            <motion.ul
              role="listbox"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.16 }}
              className="glass-panel absolute z-50 mt-2 w-full overflow-hidden rounded-xl py-1 shadow-2xl"
            >
              <li role="option" aria-selected={scope === "NATIONAL"}>
                <button
                  type="button"
                  onClick={() => {
                    onScopeChange("NATIONAL");
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between px-3.5 py-2 text-left text-sm transition-colors hover:bg-indigo-500/15",
                    scope === "NATIONAL" ? "text-sky-300" : "text-slate-300",
                  )}
                >
                  <span className="font-medium">{tr("national")}</span>
                  <span className="text-[10px] text-slate-500">{tr("nationalHint")}</span>
                </button>
              </li>
              <li className="my-1 border-t border-slate-700/50" aria-hidden />
              {ROUTES.map((route) => (
                <li key={route.id} role="option" aria-selected={scope === route.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onScopeChange(route.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between px-3.5 py-2 text-left text-sm transition-colors hover:bg-indigo-500/15",
                      scope === route.id ? "text-sky-300" : "text-slate-300",
                    )}
                  >
                    <span>
                      <span className="mr-2 rounded-md bg-slate-700/60 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">
                        {route.id}
                      </span>
                      {route.corridor}
                    </span>
                    <span className="text-[10px] text-slate-500">{tr("weightLabel")} {(route.weight * 100).toFixed(0)}%</span>
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default DashboardControls;
