import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Braces, Check, Copy, Play, Webhook } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

interface ApiPlaygroundProps {
  latest: unknown;
  history: unknown;
  forecast?: unknown;
  className?: string;
}

type TabId = "latest" | "history" | "forecast" | "webhook";

const TABS: Array<{ id: TabId; method: "GET" | "POST"; path: string }> = [
  { id: "latest", method: "GET", path: "/api/v1/apix/latest" },
  { id: "history", method: "GET", path: "/api/v1/apix/history?days=30&Format=JSON" },
  { id: "forecast", method: "GET", path: "/api/v1/apix/forecast?scope=NATIONAL&horizon=7" },
  {
    id: "webhook",
    method: "POST",
    path: "/api/v1/webhooks/register",
  },
];

const SAMPLE_WEBHOOK_BODY = {
  target_url: "https://nso.gov.in/feeds/apix",
  event: "apix.daily_publish",
  contact_email: "apix-ops@mospi.gov.in",
};

const SAMPLE_WEBHOOK_RESPONSE = {
  status: "success",
  message:
    "Webhook registered for event 'apix.daily_publish'. APIx daily publications will be pushed to your endpoint.",
  webhook_id: "wh_3606235638",
  target_url: "https://nso.gov.in/feeds/apix",
  event: "apix.daily_publish",
  registered_at: "2026-09-11T08:20:00+0530",
};

// ---------------------------------------------------------------------------
// Minimal JSON syntax highlighter (token spans — no external dependency)
// ---------------------------------------------------------------------------

const TOKEN_CLASS: Record<string, string> = {
  key: "text-sky-300",
  string: "text-emerald-300",
  number: "text-amber-300",
  boolean: "text-violet-300",
  null: "text-slate-500",
  punctuation: "text-slate-500",
};

type TokenType = keyof typeof TOKEN_CLASS;

interface Token {
  type: TokenType;
  value: string;
  /** True when the token sits on a COICOP-2018 metadata path. */
  isCoicop?: boolean;
}

function highlightJson(json: unknown): Token[][] {
  const text = JSON.stringify(json, null, 2);
  const tokenRegex =
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\bnull\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],])/g;
  const lines: Token[][] = [[]];
  let match: RegExpExecArray | null;
  let inCoicop = false;
  let coicopDepth = 0;

  const push = (type: TokenType, value: string) => {
    lines[lines.length - 1].push({ type, value, isCoicop: inCoicop });
  };

  while ((match = tokenRegex.exec(text)) !== null) {
    const [full, str, colon, boolWord, nullWord, num, punct] = match;
    if (str && colon) {
      const keyName = JSON.parse(`"${str.slice(1, -1)}"`);
      if (keyName === "coicop") {
        inCoicop = true;
        coicopDepth = (text.slice(match.index).match(/\{/g) ?? []).length;
      }
      push("key", full);
      // colon whitespace
      if (colon.length > 1) push("punctuation", colon.slice(1));
      continue;
    }
    if (str) {
      push("string", str);
      continue;
    }
    if (boolWord) {
      push("boolean", boolWord);
      continue;
    }
    if (nullWord) {
      push("null", nullWord);
      continue;
    }
    if (num) {
      push("number", num);
      continue;
    }
    if (punct) {
      if (inCoicop) {
        if (punct === "{") coicopDepth++;
        if (punct === "}") {
          coicopDepth--;
          if (coicopDepth <= 0) inCoicop = false;
        }
      }
      push("punctuation", punct);
      if (punct === "\n") lines.push([]);
      continue;
    }
  }
  return lines;
}

function JsonView({ json }: { json: unknown }) {
  const lines = useMemo(() => highlightJson(json), [json]);
  return (
    <pre className="overflow-auto font-mono text-[11.5px] leading-relaxed">
      {lines.map((tokens, i) => (
        <div key={i} className="flex px-3 hover:bg-slate-800/30">
          <span className="w-8 shrink-0 select-none text-right text-slate-600">{i + 1}</span>
          <span className="whitespace-pre pl-3">
            {tokens.map((token, j) => (
              <span
                key={j}
                className={cn(
                  TOKEN_CLASS[token.type],
                  token.isCoicop && "rounded bg-indigo-500/15 ring-1 ring-inset ring-indigo-400/30",
                )}
              >
                {token.value}
              </span>
            ))}
          </span>
        </div>
      ))}
    </pre>
  );
}

// ---------------------------------------------------------------------------

export function ApiPlayground({ latest, history, forecast, className }: ApiPlaygroundProps) {
  const [activeTab, setActiveTab] = useState<TabId>("latest");
  const [copied, setCopied] = useState(false);
  const tr = useT();

  const payload: Record<TabId, unknown> = {
    latest,
    history,
    forecast: forecast ?? {
      scope: "NATIONAL",
      model: { family: "ARIMA", order: { p: 0, d: 1, q: 1 }, aic: 0, nObs: 0, estimator: "hannan-rissanen", selection: "aic-grid p<=3, q<=2" },
      anchorDate: "—",
      anchorApix: 0,
      horizon: 7,
      predictions: [],
      coicop: { division: "07", divisionName: "Transport", subClass: "07.3.1.2", subClassName: "Passenger transport by air", framework: "COICOP-2018", baseYear: "2024" },
    },
    webhook: SAMPLE_WEBHOOK_RESPONSE,
  };

  const currentTab = TABS.find((t) => t.id === activeTab)!;
  const jsonText = useMemo(
    () =>
      activeTab === "webhook"
        ? JSON.stringify(SAMPLE_WEBHOOK_BODY, null, 2)
        : JSON.stringify(payload[activeTab], null, 2),
    [activeTab, payload],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
    } catch {
      // Clipboard API can be unavailable (insecure context) — fall back.
      const textarea = document.createElement("textarea");
      textarea.value = jsonText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.6, ease: "easeOut" }}
      className={`glass-panel flex flex-col rounded-2xl p-4 ${className ?? ""}`}
      data-keep-dark-code
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-white">{tr("playgroundTitle")}</h2>
          <p className="text-xs text-slate-400">
            {tr("playgroundSub")}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "relative flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all",
            copied
              ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-300"
              : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500 hover:text-white",
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied!" : "Copy to Clipboard"}
          {/* toast confirmation */}
          <AnimatePresence>
            {copied && (
              <motion.span
                initial={{ opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.95 }}
                className="absolute -top-9 right-0 rounded-lg border border-emerald-400/50 bg-emerald-950/95 px-3 py-1.5 text-[11px] font-bold text-emerald-300 shadow-xl"
              >
                Copied to clipboard ✓
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Endpoint tabs */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-all",
              activeTab === tab.id
                ? "border-indigo-400/50 bg-indigo-500/15 text-white shadow-lg shadow-indigo-950/40"
                : "border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-600 hover:text-slate-200",
            )}
          >
            <span
              className={cn(
                "rounded px-1 py-0.5 text-[9px] font-bold",
                tab.method === "GET" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300",
              )}
            >
              {tab.method}
            </span>
            <span className="max-w-64 truncate">{tab.path}</span>
          </button>
        ))}
      </div>

      {/* Request line + viewer */}
      <div className="keep-dark flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/80">
        <div className="flex items-center gap-2 border-b border-slate-800/80 px-3 py-2 font-mono text-[11px]">
          <Play className="h-3 w-3 text-emerald-400" />
          <span className={currentTab.method === "GET" ? "text-emerald-300" : "text-amber-300"}>
            {currentTab.method}
          </span>
          <span className="text-slate-300">/api/v1{currentTab.path.replace(/^\/api\/v1/, "")}</span>
          <span className="ml-auto flex items-center gap-1 text-slate-500">
            <Braces className="h-3 w-3" />
            application/json
          </span>
        </div>

        {activeTab === "webhook" && (
          <div className="border-b border-slate-800/80 px-3 py-2 font-mono text-[11px] text-slate-400">
            <span className="text-slate-500">request body:</span>
            <pre className="mt-1 whitespace-pre-wrap text-emerald-300/90">
              {JSON.stringify(SAMPLE_WEBHOOK_BODY, null, 2)}
            </pre>
          </div>
        )}

        <div className="min-h-72 max-h-80 flex-1 overflow-auto py-2">
          <JsonView json={activeTab === "webhook" ? SAMPLE_WEBHOOK_RESPONSE : payload[activeTab]} />
        </div>

        <div className="flex items-center gap-1.5 border-t border-slate-800/80 px-3 py-1.5 text-[10px] text-slate-500">
          <Webhook className="h-3 w-3 text-indigo-400" />
          Highlighted blocks carry COICOP-2018 classification metadata (Division 07 → 07.3.1.2)
        </div>
      </div>
    </motion.div>
  );
}

export default ApiPlayground;
