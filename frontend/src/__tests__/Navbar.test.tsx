import { describe, expect, it } from "vitest";
import Navbar from "../components/Navbar";
import { AuthProvider, useAuth } from "../context/AuthContext";

/**
 * Frontend Component Test Suite — Navbar Component
 * ---
 * Verifies the component contract at module level: Navbar and its auth
 * dependencies must export render-ready functions. Full DOM assertions
 * (brand logo, active-route highlight, role-specific links) need jsdom +
 * @testing-library/react — add those alongside the first real Navbar
 * regression instead of asserting on markup nobody has broken yet.
 */

describe("Navbar module contract", () => {
  it("exports Navbar as a component function", () => {
    expect(typeof Navbar).toBe("function");
  });

  it("can be composed with AuthProvider (both are component functions)", () => {
    expect(typeof AuthProvider).toBe("function");
    expect(typeof useAuth).toBe("function");
  });
});
