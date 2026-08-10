"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { loginUser, registerUser, getMe, setAuthToken, UserAccount, type CompanyProfile } from "@/lib/api";

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

  useEffect(() => {
    const savedToken = localStorage.getItem("eip_token");
    if (savedToken) {
      setToken(savedToken);
      setAuthToken(savedToken);
      getMe(savedToken)
        .then((userData) => {
          setUser(userData);
        })
        .catch(() => {
          localStorage.removeItem("eip_token");
          setAuthToken(null);
          setToken(null);
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const data = await loginUser(email, password);
    setToken(data.access_token);
    setAuthToken(data.access_token);
    localStorage.setItem("eip_token", data.access_token);

    const profile = await getMe(data.access_token).catch(() => ({
      id: 0,
      email: data.email,
      role: data.role,
    }));
    setUser(profile);
    return profile;
  };

  const register = async (email: string, password: string, role: string, fullName?: string, company?: CompanyProfile) => {
    const data = await registerUser(email, password, role, fullName, company);
    setToken(data.access_token);
    setAuthToken(data.access_token);
    localStorage.setItem("eip_token", data.access_token);

    const profile = await getMe(data.access_token).catch(() => ({
      id: 0,
      email: data.email,
      role: data.role,
    }));
    setUser(profile);
    return profile;
  };

  const logout = () => {
    localStorage.removeItem("eip_token");
    setAuthToken(null);
    setToken(null);
    setUser(null);
  };

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
