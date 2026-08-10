"use client";

import { useEffect, useRef } from "react";

/**
 * A 2px brass reading-progress line pinned under the navbar. Scale-only
 * updates via rAF; invisible until the reader actually scrolls, and gone
 * entirely on pages short enough not to scroll.
 */
export default function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    let raf = 0;
    const paint = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
      bar.style.transform = `scaleX(${p})`;
      bar.style.opacity = p > 0.005 ? "1" : "0";
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };

    paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 inset-x-0 z-50 h-0.5 pointer-events-none"
    >
      <div
        ref={barRef}
        className="h-full origin-left transition-opacity duration-300"
        style={{
          transform: "scaleX(0)",
          background:
            "linear-gradient(90deg, var(--brand), color-mix(in oklab, var(--brand) 55%, transparent))",
        }}
      />
    </div>
  );
}
