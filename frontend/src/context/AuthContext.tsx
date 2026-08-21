"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  loginUser,
  registerUser,
  getMe,
  setAuthToken,
  setUnauthorizedHandler,
  ApiError,
  UserAccount,
  type CompanyProfile,
} from "@/lib/api";

interface AuthContextType {
  user: UserAccount | null;
  token: string | null;
  loading: boolean;
  // login/register return the profile: callers need the role to route the user
  // to the right home, and reading useAuth().user right after awaiting would
  // still see the stale value from this render's closure.
  login: (email: string, password: string) => Promise<UserAccount>;
  register: (email: string, password: string, role: string, fullName?: string, company?: CompanyProfile) => Promise<UserAccount>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const clearSession = useCallback(() => {
    localStorage.removeItem("eip_token");
    setAuthToken(null);
    setToken(null);
    setUser(null);
  }, []);

  // Central 401 hook: when any API call is refused as unauthenticated (the
  // 24h token expired mid-session), clear the session app-wide so the Navbar
  // and route guards react at once — instead of every click repeating the
  // same "giriş yapın" error under a UI that still shows the user signed in.
  // api.ts skips the hook for login/register/forgot/reset, where a 401 means
  // wrong credentials, not an expired session.
  useEffect(() => {
    // A 401 does not say *which* token was refused, and the proxy can hold a
    // request for up to 60s — long enough for the user to sign in again while
    // it waits. Signing them out on that late verdict would end the session
    // they just opened, so the refusal is confirmed against the token
    // currently in effect before anything is torn down. The probe's own 401
    // comes back through this same hook and *is* the confirmation, hence the
    // re-entry guard (which also collapses a burst of parallel 401s into one
    // check).
    let verifying = false;
    setUnauthorizedHandler(() => {
      if (verifying) return;
      const current = localStorage.getItem("eip_token");
      if (!current) return;
      verifying = true;
      getMe(current)
        .catch((err: unknown) => {
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            clearSession();
          }
        })
        .finally(() => {
          verifying = false;
        });
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  useEffect(() => {
    const savedToken = localStorage.getItem("eip_token");
    if (!savedToken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating auth state from localStorage on mount is the sync point itself, not a side effect to defer
      setLoading(false);
      return;
    }
    setToken(savedToken);
    setAuthToken(savedToken);
    // If login() replaces the session while this getMe is still in flight
    // (the proxy can hold a request for up to 60s), the late result must not
    // clobber it: `ignore` covers unmount/re-run, and the localStorage
    // re-check covers a token that changed underneath us.
    let ignore = false;
    const isStale = () => ignore || localStorage.getItem("eip_token") !== savedToken;
    getMe(savedToken)
      .then((userData) => {
        if (isStale()) return;
        setUser(userData);
      })
      .catch((err: unknown) => {
        if (isStale()) return;
        // Only a verdict on the token itself ends the session. A 5xx or a
        // network drop says nothing about its validity — deleting the token
        // there turned a 30-second engine outage into a permanent logout for
        // whoever happened to reload during it. Leave the token in place;
        // `user` stays null until a later call succeeds or signs them out.
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          localStorage.removeItem("eip_token");
          setAuthToken(null);
          setToken(null);
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  // A failed getMe used to be swallowed into a fabricated {id: 0} profile —
  // no candidate_external_id, no company_name — leaving the user "signed in"
  // on an account where nothing worked and nothing said why. Fail the call
  // instead: roll the half-opened session back and let the form surface the
  // (already Turkish) error.
  const adoptSession = async (accessToken: string): Promise<UserAccount> => {
    setToken(accessToken);
    setAuthToken(accessToken);
    localStorage.setItem("eip_token", accessToken);

    try {
      const profile = await getMe(accessToken);
      setUser(profile);
      return profile;
    } catch (err) {
      clearSession();
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        // The credentials were accepted a moment ago — it is the profile read
        // that was refused. getMe's generic "giriş yapmanız gerekiyor" would
        // answer a successful sign-in by telling the user to sign in.
        throw new ApiError("Oturum açılamadı. Lütfen tekrar deneyin.", err.status);
      }
      throw err;
    }
  };

  const login = async (email: string, password: string) => {
    const data = await loginUser(email, password);
    return adoptSession(data.access_token);
  };

  const register = async (email: string, password: string, role: string, fullName?: string, company?: CompanyProfile) => {
    const data = await registerUser(email, password, role, fullName, company);
    return adoptSession(data.access_token);
  };

  const logout = clearSession;

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
