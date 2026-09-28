import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, BellOff, TriangleAlert, X } from "lucide-react";
import { ROUTES, getRouteSeries, getNationalSeries, type SectorScope } from "@/lib/series";
import { useT } from "@/lib/i18n";
import { cn, formatSignedPercent } from "@/lib/utils";

interface AlertRule {
  id: string;
  label: string;
  kind: "dod" | "level";
  threshold: number;
}

interface ActiveAlert {
  id: string;
  route: SectorScope;
  message: string;
  severity: "high" | "medium";
  at: string;
}

interface AlertCenterProps {
  scope: SectorScope;
  className?: string;
}

const DEFAULT_RULES: AlertRule[] = [
  { id: "dod", label: "DoD move beyond ±3%", kind: "dod", threshold: 3 },
  { id: "level", label: "APIx level beyond ±15% of par", kind: "level", threshold: 15 },
];

const DEDUPE_MS = 5 * 60 * 1000;

export function AlertCenter({ scope, className }: AlertCenterProps) {
  const [rules] = useState(DEFAULT_RULES);
  const [enabled, setEnabled] = useState(true);
  const tr = useT();
  const [notifications, setNotifications] = useState(false);
  const [alerts, setAlerts] = useState<ActiveAlert[]>([]);
  const firedAtRef = useRef<Map<string, number>>(new Map());

  // Evaluate rules over the active scope + all routes (national included).
  // firedAt lives in a ref: state here would re-trigger the effect and
  // double-fire every breach (React state updates must not drive evaluation).
  useEffect(() => {
    if (!enabled) return;

    const evaluateAll = () => {
      const found: ActiveAlert[] = [];
      const seen = new Set<string>();
      const now = Date.now();

      const evaluate = (routeId: SectorScope) => {
        const series = routeId === "NATIONAL" ? getNationalSeries() : getRouteSeries(routeId);
        const last = series[series.length - 1];
        for (const rule of rules) {
          const breached =
            rule.kind === "dod"
              ? Math.abs(last.dodPct) > rule.threshold
              : Math.abs(last.apix2024 - 100) > rule.threshold;
          if (!breached) continue;
          const key = `${rule.id}:${routeId}:${last.date}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const lastFired = firedAtRef.current.get(key) ?? 0;
          if (now - lastFired < DEDUPE_MS) continue;
          firedAtRef.current.set(key, now);
          found.push({
            id: key,
            route: routeId,
            message:
              rule.kind === "dod"
                ? `${routeId} moved ${formatSignedPercent(last.dodPct)} day-over-day (threshold ±${rule.threshold}%)`
                : `${routeId} at ${last.apix2024.toFixed(1)} — ${Math.abs(last.apix2024 - 100).toFixed(1)} pts ${last.apix2024 > 100 ? "above" : "below"} par`,
            severity: rule.kind === "dod" ? "high" : "medium",
            at: last.date,
          });
        }
      };

      // The active scope first (highlighted), then every corridor once.
      evaluate(scope);
      for (const r of ROUTES) if (r.id !== scope) evaluate(r.id);

      if (found.length) {
        setAlerts((prev) => {
          const existing = new Set(prev.map((a) => a.id));
          const fresh = found.filter((a) => !existing.has(a.id));
          return fresh.length ? [...fresh, ...prev].slice(0, 8) : prev;
        });
      }
    };

    evaluateAll();
    const interval = window.setInterval(evaluateAll, 60_000);
    return () => window.clearInterval(interval);
  }, [scope, rules, enabled]);

  const requestNotifications = useCallback(async () => {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setNotifications(permission === "granted");
    if (permission === "granted") {
      new Notification("APIx alerts enabled", {
        body: "You will be notified when a corridor breaches a threshold.",
      });
    }
  }, []);

  // Push browser notifications for new high-severity alerts.
  useEffect(() => {
    if (!notifications) return;
    const latest = alerts[0];
    if (latest?.severity === "high") {
      try {
        new Notification(`APIx alert · ${latest.route}`, { body: latest.message });
      } catch {
        // Notification constructor quirks are non-fatal.
      }
    }
  }, [alerts, notifications]);

  const highCount = useMemo(() => alerts.filter((a) => a.severity === "high").length, [alerts]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.58, duration: 0.6, ease: "easeOut" }}
      className={`glass-panel flex h-full flex-col rounded-2xl p-5 ${className ?? ""}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <TriangleAlert className={cn("h-4 w-4", highCount ? "text-amber-400" : "text-slate-500")} />
            {tr("alertsTitle")}
            {alerts.length > 0 && (
              <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">{alerts.length}</span>
            )}
          </h2>
          <p className="text-xs text-slate-400">{rules.map((r) => r.label).join(" · ")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEnabled((v) => !v)}
            className={cn(
              "rounded-lg border px-2 py-1.5 text-[10.5px] font-bold transition-all",
              enabled
                ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-300"
                : "border-slate-700 bg-slate-900/50 text-slate-500",
            )}
          >
            {enabled ? "ARMED" : "MUTED"}
          </button>
          <button
            type="button"
            onClick={() => void requestNotifications()}
            title="Enable desktop notifications"
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10.5px] font-bold transition-all",
              notifications
                ? "border-sky-400/50 bg-sky-500/10 text-sky-300"
                : "border-slate-700 bg-slate-900/50 text-slate-400 hover:border-sky-400/50 hover:text-sky-300",
            )}
          >
            {notifications ? <BellRing className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
            {notifications ? "Push on" : "Push"}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
        <AnimatePresence initial={false}>
          {alerts.length === 0 && (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full min-h-16 items-center justify-center text-xs text-slate-500"
            >
              {enabled ? "No breaches in the current window — all corridors nominal" : "Alert evaluation muted"}
            </motion.p>
          )}
          {alerts.map((alert) => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12, height: 0 }}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border px-3 py-2",
                alert.severity === "high"
                  ? "border-rose-500/30 bg-rose-500/10"
                  : "border-amber-500/30 bg-amber-500/10",
              )}
            >
              <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", alert.severity === "high" ? "bg-rose-400" : "bg-amber-400")} />
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] font-semibold text-slate-200">
                  <span className={alert.severity === "high" ? "text-rose-300" : "text-amber-300"}>{alert.route}</span> · {alert.message}
                </p>
                <p className="text-[10px] text-slate-500">observed {alert.at} · rule dedupe 5 min</p>
              </div>
              <button
                type="button"
                onClick={() => setAlerts((prev) => prev.filter((a) => a.id !== alert.id))}
                aria-label="Acknowledge alert"
                className="rounded p-1 text-slate-500 transition-colors hover:text-slate-200"
              >
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default AlertCenter;
