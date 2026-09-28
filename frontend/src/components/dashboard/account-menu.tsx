import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CircleUserRound, KeyRound, Loader2, LogOut, Mail, ShieldCheck, X } from "lucide-react";
import { LogoAeroTrend } from "@/components/logo-aero-trend";
import type { AuthController } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface AccountMenuProps {
  auth: AuthController;
  className?: string;
}

/**
 * Masthead account chip + auth modal. The dashboard stays fully browsable
 * signed-out; the chip advertises sign-in for the higher institutional tier.
 * Signed-in, the chip opens a small popover with the profile and sign-out.
 */
export function AccountMenu({ auth, className }: AccountMenuProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organisation, setOrganisation] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close the signed-in popover on outside click.
  useEffect(() => {
    if (!popoverOpen) return;
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [popoverOpen]);

  const submit = async () => {
    const account =
      mode === "signin"
        ? await auth.signIn(email, password)
        : await auth.register(email, password, organisation || undefined);
    if (account) {
      setModalOpen(false);
      setPassword("");
    }
  };

  const tierBadge = (tier: string) => (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide",
        tier === "institutional" ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-700/60 text-slate-300",
      )}
    >
      {tier}
    </span>
  );

  return (
    <div className={cn("relative", className)}>
      {/* Account chip */}
      <button
        type="button"
        onClick={() => (auth.account ? setPopoverOpen((v) => !v) : setModalOpen(true))}
        title={auth.account ? `Signed in as ${auth.account.email}` : "Sign in for the institutional API tier"}
        aria-expanded={auth.account ? popoverOpen : modalOpen}
        className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-900/60 px-3 py-2 text-sm font-medium text-slate-300 transition-all hover:border-indigo-400/60 hover:text-slate-200"
      >
        <CircleUserRound className={cn("h-4.5 w-4.5", auth.account ? "text-emerald-400" : "text-slate-400")} />
        <span className="hidden max-w-40 truncate md:inline">
          {auth.account ? auth.account.email.split("@")[0] : "Sign in"}
        </span>
        {auth.account && tierBadge(auth.account.tier)}
      </button>

      {/* Signed-in popover */}
      <AnimatePresence>
        {auth.account && popoverOpen && (
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className="glass-panel absolute right-0 top-12 z-[93] w-64 overflow-hidden rounded-2xl shadow-2xl"
          >
            <div className="border-b border-slate-700/50 px-4 py-3">
              <p className="truncate text-sm font-bold text-white">{auth.account.email}</p>
              <p className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                {auth.account.organisation ?? "Independent access"} {tierBadge(auth.account.tier)}
              </p>
            </div>
            <div className="px-4 py-3 text-[11px] leading-relaxed text-slate-400">
              <p>
                Rate tier: <span className="font-bold text-slate-200">
                  {auth.account.tier === "institutional" ? "600" : "240"}
                </span>{" "}
                req/min
              </p>
              <p className="mt-0.5 text-slate-500">
                HMAC bearer session · 12h expiry · member since{" "}
                {auth.account.createdAt?.slice(0, 10) ?? "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                auth.signOut();
                setPopoverOpen(false);
              }}
              className="flex w-full items-center gap-2 border-t border-slate-700/50 px-4 py-2.5 text-left text-[12.5px] font-semibold text-slate-300 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sign-in / register modal */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[92] flex items-center justify-center bg-slate-950/65 px-4 backdrop-blur-sm"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setModalOpen(false);
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Sign in to FAIR FLIGHT"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
              className="glass-panel w-full max-w-sm rounded-2xl p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <LogoAeroTrend className="logo-shimmer mt-0.5 h-10 w-10 shrink-0" />
                  <div>
                    <h2 className="text-lg font-bold text-white">
                      {mode === "signin" ? "Sign in to FAIR FLIGHT" : "Create your account"}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Institutional tier for gov.in / nic.in emails · 600 req/min
                    </p>
                  </div>
                </div>
                <button type="button" onClick={() => setModalOpen(false)} aria-label="Close sign-in" className="rounded p-1 text-slate-500 hover:text-slate-200">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form
                className="mt-5 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <label className="block">
                  <span className="mb-1 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                    <Mail className="h-3 w-3" /> Email
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="analyst@mospi.gov.in"
                    className="w-full rounded-xl border border-slate-700/80 bg-slate-950/60 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                    <KeyRound className="h-3 w-3" /> Password
                  </span>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="min 8 characters"
                    className="w-full rounded-xl border border-slate-700/80 bg-slate-950/60 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                  />
                </label>
                {mode === "register" && (
                  <label className="block">
                    <span className="mb-1 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                      <ShieldCheck className="h-3 w-3" /> Organisation (optional)
                    </span>
                    <input
                      type="text"
                      value={organisation}
                      onChange={(e) => setOrganisation(e.target.value)}
                      placeholder="MoSPI · RBI · judge"
                      className="w-full rounded-xl border border-slate-700/80 bg-slate-950/60 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                    />
                  </label>
                )}

                {auth.error && (
                  <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{auth.error}</p>
                )}

                <button
                  type="submit"
                  disabled={auth.signingIn}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60"
                >
                  {auth.signingIn && <Loader2 className="h-4 w-4 animate-spin" />}
                  {mode === "signin" ? "Sign in" : "Create account"}
                </button>
              </form>

              <div className="mt-4 flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={() => setMode(mode === "signin" ? "register" : "signin")}
                  className="font-semibold text-indigo-300 hover:text-indigo-200"
                >
                  {mode === "signin" ? "Need an account? Register" : "Have an account? Sign in"}
                </button>
                <span className="text-slate-500">PBKDF2 · HMAC bearer</span>
              </div>

              {mode === "signin" && (
                <p className="mt-3 rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
                  <span className="font-bold text-slate-300">Demo account:</span> analyst@mospi.gov.in · fairflight-demo
                  <br />
                  <span className="text-slate-500">institutional tier — signed-in sessions get 600 req/min</span>
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AccountMenu;
