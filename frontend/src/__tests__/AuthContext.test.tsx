// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ApiError, getMe, getMyInterests, loginUser, setAuthToken } from "@/lib/api";

/**
 * Frontend Unit Test Suite — AuthContext & Authentication State
 * ---
 * Renders the real AuthProvider (jsdom) and verifies the actual contracts:
 *   - the session token lives under the "eip_token" localStorage key;
 *   - the mount-time getMe only discards the token on 401/403 — a 5xx or a
 *     network drop must NOT log the user out;
 *   - a failed profile fetch fails login() and rolls the token back instead
 *     of fabricating an {id: 0} profile;
 *   - a stale mount-time getMe result cannot clobber a newer session.
 */

// Mock only the network calls; ApiError, setAuthToken and
// setUnauthorizedHandler stay real so instanceof checks and the module-level
// token state behave exactly as in the app.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    loginUser: vi.fn(),
    registerUser: vi.fn(),
    getMe: vi.fn(),
  };
});

// React 19 only silences its act() warnings when this flag is set.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockedGetMe = vi.mocked(getMe);
const mockedLoginUser = vi.mocked(loginUser);

const PROFILE = {
  id: 7,
  email: "aday@ornek.com",
  role: "candidate",
  candidate_external_id: "cand_x1",
};

/** Exposes the provider's state and actions to the assertions below. */
function Probe() {
  const { user, token, loading, login, logout } = useAuth();
  const [outcome, setOutcome] = useState("");
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="email">{user?.email ?? "-"}</span>
      <span data-testid="token">{token ?? "-"}</span>
      <span data-testid="outcome">{outcome}</span>
      <button
        onClick={() =>
          login("aday@ornek.com", "sifre").then(
            () => setOutcome("ok"),
            () => setOutcome("failed")
          )
        }
      >
        login
      </button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  setAuthToken(null);
  mockedGetMe.mockReset();
  mockedLoginUser.mockReset();
});

afterEach(cleanup);

describe("login/logout localStorage contract", () => {
  it("login() stores the session under the eip_token key and serves the getMe profile", async () => {
    mockedLoginUser.mockResolvedValue({
      access_token: "tok-1",
      email: PROFILE.email,
      role: PROFILE.role,
    });
    mockedGetMe.mockResolvedValue(PROFILE);

    renderProbe();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    fireEvent.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("outcome").textContent).toBe("ok"));

    expect(localStorage.getItem("eip_token")).toBe("tok-1");
    expect(screen.getByTestId("email").textContent).toBe(PROFILE.email);
    expect(screen.getByTestId("token").textContent).toBe("tok-1");
  });

  it("logout() removes eip_token and clears the user", async () => {
    localStorage.setItem("eip_token", "saved-tok");
    mockedGetMe.mockResolvedValue(PROFILE);

    renderProbe();
    await waitFor(() => expect(screen.getByTestId("email").textContent).toBe(PROFILE.email));

    fireEvent.click(screen.getByText("logout"));
    await waitFor(() => expect(screen.getByTestId("email").textContent).toBe("-"));
    expect(localStorage.getItem("eip_token")).toBeNull();
    expect(screen.getByTestId("token").textContent).toBe("-");
  });
});

describe("mount getMe error classification", () => {
  it("discards the saved token when the engine rejects it (401)", async () => {
    localStorage.setItem("eip_token", "expired-tok");
    mockedGetMe.mockRejectedValue(new ApiError("Bu işlem için giriş yapmanız gerekiyor.", 401));

    renderProbe();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    expect(localStorage.getItem("eip_token")).toBeNull();
    expect(screen.getByTestId("token").textContent).toBe("-");
    expect(screen.getByTestId("email").textContent).toBe("-");
  });

  it("keeps the saved token through a 5xx outage", async () => {
    localStorage.setItem("eip_token", "valid-tok");
    mockedGetMe.mockRejectedValue(
      new ApiError("Sunucuya şu anda ulaşılamıyor. Lütfen birazdan tekrar deneyin.", 502)
    );

    renderProbe();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    // The outage says nothing about the token — it must survive for the retry.
    expect(localStorage.getItem("eip_token")).toBe("valid-tok");
    expect(screen.getByTestId("token").textContent).toBe("valid-tok");
    expect(screen.getByTestId("email").textContent).toBe("-");
  });

  it("keeps the saved token when fetch itself throws (network drop)", async () => {
    localStorage.setItem("eip_token", "valid-tok");
    mockedGetMe.mockRejectedValue(new TypeError("Failed to fetch"));

    renderProbe();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    expect(localStorage.getItem("eip_token")).toBe("valid-tok");
    expect(screen.getByTestId("token").textContent).toBe("valid-tok");
  });
});

describe("login profile failure", () => {
  it("fails the login and rolls the token back instead of fabricating an id:0 profile", async () => {
    mockedLoginUser.mockResolvedValue({
      access_token: "tok-2",
      email: PROFILE.email,
      role: PROFILE.role,
    });
    mockedGetMe.mockRejectedValue(new ApiError("Beklenmeyen bir sunucu hatası oluştu.", 500));

    renderProbe();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    fireEvent.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("outcome").textContent).toBe("failed"));

    expect(localStorage.getItem("eip_token")).toBeNull();
    expect(screen.getByTestId("email").textContent).toBe("-");
    expect(screen.getByTestId("token").textContent).toBe("-");
  });
});

describe("central 401 hook", () => {
  /** Drives a *real* (unmocked) authed call so the 401 travels the production
   *  path: toApiError → setUnauthorizedHandler → the provider's hook. */
  const call401 = () =>
    act(async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ detail: "Not authenticated" }), { status: 401 })
        )
      );
      await getMyInterests().catch(() => {});
      vi.unstubAllGlobals();
    });

  it("ends the session when the live token is refused too", async () => {
    localStorage.setItem("eip_token", "expired-tok");
    mockedGetMe.mockResolvedValueOnce(PROFILE); // mount succeeds; the token dies afterwards
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("email").textContent).toBe(PROFILE.email));

    // The confirmation probe hits the same wall.
    mockedGetMe.mockRejectedValue(new ApiError("Bu işlem için giriş yapmanız gerekiyor.", 401));
    await call401();

    await waitFor(() => expect(localStorage.getItem("eip_token")).toBeNull());
    expect(screen.getByTestId("email").textContent).toBe("-");
  });

  it("keeps a session the live token still proves valid", async () => {
    // The 401 belongs to a request authorised with a token that has since been
    // replaced — a re-login finished while it was in flight.
    localStorage.setItem("eip_token", "fresh-tok");
    mockedGetMe.mockResolvedValue(PROFILE);
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("email").textContent).toBe(PROFILE.email));

    await call401();

    // The probe answered "this token is fine", so nothing is torn down.
    await waitFor(() => expect(mockedGetMe).toHaveBeenCalledTimes(2));
    expect(localStorage.getItem("eip_token")).toBe("fresh-tok");
    expect(screen.getByTestId("email").textContent).toBe(PROFILE.email);
  });

  it("leaves a signed-out visitor alone", async () => {
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    mockedGetMe.mockClear();

    await call401();

    // No stored token means there is no session to confirm or end.
    expect(mockedGetMe).not.toHaveBeenCalled();
    expect(localStorage.getItem("eip_token")).toBeNull();
  });
});

describe("stale mount getMe", () => {
  // Covers the mount effect's own staleness guard. getMe is mocked here, so
  // the rejection never travels through toApiError and never fires the central
  // 401 hook — that half of the race is covered by "central 401 hook" above.
  it("a late mount rejection cannot wipe the session login() just opened", async () => {
    localStorage.setItem("eip_token", "old-tok");
    let rejectMount: (err: unknown) => void = () => {};
    mockedGetMe.mockImplementation((tok: string) =>
      tok === "old-tok"
        ? new Promise((_resolve, reject) => {
            rejectMount = reject;
          })
        : Promise.resolve(PROFILE)
    );
    mockedLoginUser.mockResolvedValue({
      access_token: "new-tok",
      email: PROFILE.email,
      role: PROFILE.role,
    });

    renderProbe();
    // While the mount-time getMe for "old-tok" is still in flight, the user
    // signs in and gets a fresh session.
    fireEvent.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("email").textContent).toBe(PROFILE.email));
    expect(localStorage.getItem("eip_token")).toBe("new-tok");

    // The slow getMe for the *old* token finally fails as unauthorized.
    await act(async () => {
      rejectMount(new ApiError("Bu işlem için giriş yapmanız gerekiyor.", 401));
      await Promise.resolve();
    });

    // The new session must be untouched.
    expect(localStorage.getItem("eip_token")).toBe("new-tok");
    expect(screen.getByTestId("email").textContent).toBe(PROFILE.email);
    expect(screen.getByTestId("token").textContent).toBe("new-tok");
  });
});
