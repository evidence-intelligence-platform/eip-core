// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Navbar from "@/components/Navbar";
import { AuthProvider } from "@/context/AuthContext";
import { getMe, setAuthToken } from "@/lib/api";

/**
 * Frontend Component Test Suite — Navbar Component
 * ---
 * Real render (jsdom) behind a real AuthProvider: the signed-out bar offers
 * sign-in, a restored employer session shows the role links, and "Çıkış yap"
 * actually ends the session (eip_token removed, links swap back).
 */

// Navbar only reads the current route; a static one is enough here.
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

// Mock only the network call the provider makes on mount.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getMe: vi.fn(),
  };
});

// React 19 only silences its act() warnings when this flag is set.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockedGetMe = vi.mocked(getMe);

function renderNavbar() {
  return render(
    <AuthProvider>
      <Navbar />
    </AuthProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  setAuthToken(null);
  mockedGetMe.mockReset();
});

afterEach(cleanup);

// Tolerate both capitalizations ("Giriş Yap"/"Giriş yap"): the CTA copy is
// being normalized to sentence case, and this behavior test is about the
// session contract, not the casing.
const GIRIS = /^Giriş [Yy]ap$/;
const CIKIS = /^Çıkış [Yy]ap$/;
const HESAP_OLUSTUR = /^Hesap [Oo]luştur$/;
const ISVEREN_PANELI = /^İşveren [Pp]aneli$/;
const ADAY_PANELI = /^Aday [Pp]aneli$/;

describe("Navbar", () => {
  it("offers sign-in, not role links, to a signed-out visitor", async () => {
    renderNavbar();

    // The link set renders twice (desktop bar + mobile drawer).
    await waitFor(() => expect(screen.getAllByText(GIRIS).length).toBeGreaterThan(0));
    expect(screen.getAllByText(HESAP_OLUSTUR).length).toBeGreaterThan(0);
    expect(screen.queryByText(CIKIS)).toBeNull();
    expect(screen.queryByText(ISVEREN_PANELI)).toBeNull();
    expect(screen.queryByText(ADAY_PANELI)).toBeNull();
  });

  it("shows employer links for a restored session and Çıkış yap ends it", async () => {
    localStorage.setItem("eip_token", "tok-employer");
    mockedGetMe.mockResolvedValue({ id: 3, email: "patron@firma.com", role: "employer" });

    const { container } = renderNavbar();

    await waitFor(() => expect(screen.getAllByText(ISVEREN_PANELI).length).toBeGreaterThan(0));
    expect(screen.getAllByText("İşveren").length).toBeGreaterThan(0); // role badge
    expect(screen.getAllByText("patron@firma.com").length).toBeGreaterThan(0);

    // Open the desktop account menu, then sign out from it.
    const acctButton = container.querySelector<HTMLButtonElement>("[data-acct-menu] button");
    expect(acctButton).not.toBeNull();
    fireEvent.click(acctButton!);
    fireEvent.click(screen.getAllByText(CIKIS)[0]);

    await waitFor(() => expect(screen.getAllByText(GIRIS).length).toBeGreaterThan(0));
    expect(localStorage.getItem("eip_token")).toBeNull();
    expect(screen.queryByText(ISVEREN_PANELI)).toBeNull();
  });
});
