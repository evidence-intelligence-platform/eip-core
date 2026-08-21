"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animated counter: counts from 0 to `end` the first time it scrolls into
 * view. Numbers are the fastest thing on a landing page to skim — making
 * them move once earns a glance without looping distraction.
 */
export default function CountUp({
  end,
  duration = 1400,
  suffix = "",
  className = "",
}: {
  end: number;
  duration?: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);
  const started = useRef(false);
  // Tracks the in-flight rAF id so unmount (e.g. an SPA nav away mid-count)
  // can cancel it — otherwise `tick` keeps calling setValue on an unmounted
  // component for the rest of `duration`.
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const run = () => {
      if (started.current) return;
      started.current = true;
      // Match Tilt/BackgroundFX: a reduced-motion reader gets the final
      // number immediately instead of watching it climb from 0.
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setValue(end);
        return;
      }
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min((t - t0) / duration, 1);
        // ease-out cubic — fast start, settled landing
        const eased = 1 - Math.pow(1 - p, 3);
        setValue(Math.round(eased * end));
        rafId.current = p < 1 ? requestAnimationFrame(tick) : null;
      };
      rafId.current = requestAnimationFrame(tick);
    };

    if (typeof IntersectionObserver === "undefined") {
      // No observer support: settle on the final value on the next frame
      // (synchronous setState inside an effect would cascade a re-render).
      const id = requestAnimationFrame(() => setValue(end));
      rafId.current = id;
      return () => cancelAnimationFrame(id);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          run();
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    };
  }, [end, duration]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {value}
      {suffix}
    </span>
  );
}
