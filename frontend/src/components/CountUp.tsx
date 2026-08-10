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

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const run = () => {
      if (started.current) return;
      started.current = true;
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min((t - t0) / duration, 1);
        // ease-out cubic — fast start, settled landing
        const eased = 1 - Math.pow(1 - p, 3);
        setValue(Math.round(eased * end));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    if (typeof IntersectionObserver === "undefined") {
      // No observer support: settle on the final value on the next frame
      // (synchronous setState inside an effect would cascade a re-render).
      const id = requestAnimationFrame(() => setValue(end));
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
    return () => observer.disconnect();
  }, [end, duration]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {value}
      {suffix}
    </span>
  );
}
