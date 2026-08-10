"use client";

import { useEffect, useRef } from "react";

/**
 * Ambient, interactive background for the whole app — two layers:
 *
 * 1. A faint ledger grid (inline SVG, no requests): the paper the platform's
 *    "Mühür" identity writes on. Sits under everything at ~2% opacity.
 * 2. A brass glow that follows the pointer. Desktop-only (pointer: fine),
 *    rAF-throttled, transform/opacity only — no layout work per frame.
 *
 * Both layers are decorative (aria-hidden) and disabled when the OS asks
 * for reduced motion.
 */
export default function BackgroundFX() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const glow = glowRef.current;
    if (!glow) return;

    // Touch screens have no hover to follow, and reduced-motion users asked
    // us not to move things around the page.
    const fine = window.matchMedia("(pointer: fine)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || still.matches) return;

    let raf = 0;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 3;

    const paint = () => {
      raf = 0;
      glow.style.transform = `translate3d(${x - 300}px, ${y - 300}px, 0)`;
      glow.style.opacity = "1";
    };

    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(paint);
    };

    const onLeave = () => {
      glow.style.opacity = "0";
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div aria-hidden="true" className="fixed inset-0 -z-20 pointer-events-none overflow-hidden">
      {/* Ledger paper grid */}
      <div
        className="absolute inset-0 opacity-[0.022]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56'%3E%3Cpath d='M56 .5H0M.5 0v56' fill='none' stroke='%23e3a84e' stroke-width='1'/%3E%3C/svg%3E\")",
        }}
      />
      {/* Pointer-following brass glow */}
      <div
        ref={glowRef}
        className="absolute top-0 left-0 w-[600px] h-[600px] opacity-0 transition-opacity duration-700"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--brand) 7%, transparent), transparent 70%)",
          willChange: "transform",
        }}
      />
    </div>
  );
}
