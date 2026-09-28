import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

interface TelemetryFeedProps {
  className?: string;
}

interface WorkerRow {
  corridor: string;
  status: "OK" | "SLOW";
  ms: number;
  yieldPct: number;
}

const WORKERS: WorkerRow[] = [
  { corridor: "DEL-BOM", status: "OK", ms: 1840, yieldPct: 99.6 },
  { corridor: "DEL-BLR", status: "OK", ms: 2105, yieldPct: 99.2 },
  { corridor: "BOM-BLR", status: "OK", ms: 1962, yieldPct: 99.5 },
  { corridor: "BLR-HYD", status: "SLOW", ms: 3410, yieldPct: 98.1 },
  { corridor: "DEL-CCU", status: "OK", ms: 2287, yieldPct: 99.0 },
];

function useIstClock(): string {
  const [now, setNow] = useState("--:--:--");
  useEffect(() => {
    const tick = () => {
      const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
      setNow(ist.toISOString().slice(11, 19));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function TelemetryFeed({ className }: TelemetryFeedProps) {
  const clock = useIstClock();

  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.55, duration: 0.6, ease: "easeOut" }}
      className={`glass-panel keep-dark flex flex-col overflow-hidden rounded-2xl ${className ?? ""}`}
    >
      {/* Terminal title bar */}
      <div className="keep-dark flex items-center justify-between border-b border-slate-800/80 bg-slate-950/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
          </span>
          <span className="ml-2 flex items-center gap-1.5 font-mono text-[11px] font-semibold text-slate-400">
            <Terminal className="h-3.5 w-3.5" />
            apix-worker@mospi-sandbox:~
          </span>
        </div>
        <span className="font-mono text-[11px] text-slate-500">{clock} IST</span>
      </div>

      <div className="flex-1 space-y-3 p-4 font-mono text-[12px] leading-relaxed">
        {/* Pipeline status */}
        <div className="flex items-center gap-2.5">
          <motion.span
            className="relative flex h-2.5 w-2.5"
            animate={{ opacity: [1, 0.55, 1] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
          >
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.7)]" />
          </motion.span>
          <span className="text-slate-400">pipeline_status:</span>
          <span className="font-bold text-emerald-400">HEALTHY (200 OK)</span>
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
          <div>
            <span className="text-slate-500">last_extraction:</span>{" "}
            <span className="text-slate-200">02:00 AM IST</span>
          </div>
          <div>
            <span className="text-slate-500">next_run:</span>{" "}
            <span className="text-slate-200">cron(0 0 * * *) UTC</span>
          </div>
          <div>
            <span className="text-slate-500">extraction_yield:</span>{" "}
            <span className="text-sky-300">99.4%</span>
          </div>
          <div>
            <span className="text-slate-500">anti_bot_evasions:</span>{" "}
            <span className="text-amber-300">4 Cloudflare challenges bypassed</span>
          </div>
          <div>
            <span className="text-slate-500">active_workers:</span>{" "}
            <span className="text-indigo-300">5 Playwright instances</span>
          </div>
          <div>
            <span className="text-slate-500">fallback_layer:</span>{" "}
            <span className="text-slate-300">armed · 0 invocations</span>
          </div>
        </div>

        {/* Per-corridor worker table */}
        <div className="pt-1">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-[10px] uppercase tracking-wider text-slate-600">
            <span>corridor</span>
            <span className="text-right">latency</span>
            <span className="text-right">yield</span>
          </div>
          {WORKERS.map((worker, i) => (
            <motion.div
              key={worker.corridor}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.65 + i * 0.05, duration: 0.3 }}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-t border-slate-800/50 py-1"
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-block h-1.5 w-1.5 rounded-full",
                    worker.status === "OK" ? "bg-emerald-400" : "bg-amber-400",
                  )}
                />
                <span className="text-slate-200">{worker.corridor}</span>
                <span
                  className={cn(
                    "rounded px-1 text-[9px] font-bold",
                    worker.status === "OK"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-amber-500/15 text-amber-400",
                  )}
                >
                  {worker.status}
                </span>
              </span>
              <span className="text-right text-slate-400">{worker.ms} ms</span>
              <span className={cn("text-right", worker.yieldPct >= 99 ? "text-sky-300" : "text-amber-300")}>
                {worker.yieldPct}%
              </span>
            </motion.div>
          ))}
        </div>

        {/* Throughput bar */}
        <div>
          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>extraction_throughput (quotes/min)</span>
            <span className="text-slate-300">284</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-sky-400 to-indigo-500"
              initial={{ width: "0%" }}
              animate={{ width: "87%" }}
              transition={{ delay: 0.8, duration: 1.1, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Footer badge */}
        <div className="flex items-center gap-1.5 border-t border-slate-800/60 pt-2 text-[10px] text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          synthetic failover armed · scraper never fails closed · CI: daily_scrape.yml
        </div>
      </div>
    </motion.div>
  );
}

export default TelemetryFeed;
