"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Scroll-reveal wrapper. Adds `.is-visible` once the element enters the
 * viewport; globals.css turns that into a rise-and-fade (or a staggered
 * cascade with `stagger`). Reveals once and disconnects — content must
 * never disappear again while the reader scrolls back up.
 *
 * Renders visible-by-default markup when IntersectionObserver is missing,
 * so nothing is lost without JS or in very old browsers.
 */
export default function Reveal({
  children,
  className = "",
  stagger = false,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  /** Cascade direct children with per-child delays instead of moving the block. */
  stagger?: boolean;
  as?: "div" | "section" | "ul" | "ol" | "li" | "article";
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-visible");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      // threshold must stay near zero: for sections taller than the
      // viewport a fractional threshold can never be reached, and the
      // content would simply never appear. The negative bottom margin
      // delays the trigger just enough that the rise is visible.
      { threshold: 0.01, rootMargin: "0px 0px -60px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag ref={ref as any} className={`${stagger ? "reveal-stagger" : "reveal"} ${className}`}>
      {children}
    </Tag>
  );
}
