/**
 * auth.ts — FAIR FLIGHT account sessions.
 *
 * Signs in against the FastAPI backend (POST /api/v1/auth/login) and stores
 * the HMAC bearer token in localStorage. All dashboard fetches prefer the
 * signed-in session (higher rate tier + /auth/me profile); anonymous users
 * keep full read access — auth gates the *experience*, not the data.
 */

import { useCallback, useState } from "react";
import { apiUrl } from "@/lib/api";

export type AuthTier = "public" | "institutional";

export interface AuthAccount {
  email: string;
  organisation: string | null;
  tier: AuthTier;
  createdAt: string | null;
}

interface AuthResponse {
  status: string;
  token: string;
  tokenType: string;
  expiresIn: number;
  account: AuthAccount;
}

const TOKEN_KEY = "fairflight-token";
const ACCOUNT_KEY = "fairflight-account";

export function readStoredAccount(): AuthAccount | null {
  try {
    const raw = window.localStorage.getItem(ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as AuthAccount) : null;
  } catch {
    return null;
  }
}

export function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** fetch wrapper that always attaches the bearer token when signed in. */
export async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = readStoredToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}

export interface AuthController {
  account: AuthAccount | null;
  signingIn: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<AuthAccount | null>;
  register: (email: string, password: string, organisation?: string) => Promise<AuthAccount | null>;
  signOut: () => void;
}

export function useAuth(): AuthController {
  const [account, setAccount] = useState<AuthAccount | null>(readStoredAccount);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persist = useCallback((token: string, next: AuthAccount) => {
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
      window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(next));
    } catch {
      // private mode — session stays in memory only
    }
    setAccount(next);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setSigningIn(true);
      setError(null);
      try {
        const response = await fetch(apiUrl("/api/v1/auth/login"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => null);
          throw new Error(detail?.detail ?? `sign-in failed (${response.status})`);
        }
        const data = (await response.json()) as AuthResponse;
        persist(data.token, data.account);
        return data.account;
      } catch (e) {
        setError(e instanceof Error ? e.message : "sign-in failed");
        return null;
      } finally {
        setSigningIn(false);
      }
    },
    [persist],
  );

  const register = useCallback(
    async (email: string, password: string, organisation?: string) => {
      setSigningIn(true);
      setError(null);
      try {
        const response = await fetch(apiUrl("/api/v1/auth/register"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, organisation }),
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => null);
          throw new Error(detail?.detail ?? `registration failed (${response.status})`);
        }
        const data = (await response.json()) as { token: string; account: AuthAccount };
        persist(data.token, data.account);
        return data.account;
      } catch (e) {
        setError(e instanceof Error ? e.message : "registration failed");
        return null;
      } finally {
        setSigningIn(false);
      }
    },
    [persist],
  );

  const signOut = useCallback(() => {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(ACCOUNT_KEY);
    } catch {
      // non-fatal
    }
    setAccount(null);
  }, []);

  return { account, signingIn, error, signIn, register, signOut };
}
