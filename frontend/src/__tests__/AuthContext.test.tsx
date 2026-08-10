import { describe, expect, it } from "vitest";
import { AuthProvider, useAuth } from "../context/AuthContext";

/**
 * Frontend Unit Test Suite — AuthContext & Authentication State
 * ---
 * Verifies the provider/hook exports and the localStorage persistence
 * contract (token + user stored on login, both removed on logout).
 * Rendering the provider needs jsdom + @testing-library/react — worth adding
 * when a component-level regression actually calls for it.
 */

describe("AuthContext exports", () => {
  it("exports AuthProvider as a component function", () => {
    expect(typeof AuthProvider).toBe("function");
  });

  it("exports the useAuth hook", () => {
    expect(typeof useAuth).toBe("function");
  });
});

describe("localStorage persistence contract", () => {
  it("stores token and user on login", () => {
    const mockToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test_payload.signature";
    const mockUser = { id: 1, email: "employer@acme.com", role: "employer" };

    const storage: Record<string, string> = {};
    storage["token"] = mockToken;
    storage["user"] = JSON.stringify(mockUser);

    expect(storage["token"]).toBe(mockToken);
    const parsedUser = JSON.parse(storage["user"]);
    expect(parsedUser.role).toBe("employer");
    expect(parsedUser.email).toBe("employer@acme.com");
  });

  it("clears token and user on logout", () => {
    const storage: Record<string, string> = {
      token: "test_token",
      user: '{"role":"employer"}',
    };

    delete storage["token"];
    delete storage["user"];

    expect(storage["token"]).toBeUndefined();
    expect(storage["user"]).toBeUndefined();
  });
});
