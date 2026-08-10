/**
 * EİP illustration system — the "Mühür" (seal) family.
 *
 * Hand-drawn inline SVGs, one shared grammar: 44×44 icon grid or 240×200
 * scene grid, stroke width 2 (icons) / 2.5 (scenes), round caps, and at
 * most three colors pulled from the design tokens:
 *
 *   var(--brand)    brass — the seal, the highlight, the "verified" moment
 *   var(--fg-mute)  warm grey — paper edges, secondary linework
 *   var(--line-strong) — fills read as shadow on the ink ground
 *
 * No external assets, no emoji. Every component takes className and is
 * aria-hidden by default (pass a title via the surrounding markup instead).
 */

type IllustrationProps = {
  className?: string;
};

const LINE = "var(--fg-mute)";
const BRAND = "var(--brand)";
const FILL = "var(--line-strong)";

/* ── Logo mark: scalloped seal rosette with a check ─────────────────── */

export function SealMark({ className }: IllustrationProps) {
  // 12-lobed rosette approximated with a smooth star path.
  return (
    <svg
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M22 3l3.2 3 4.3-1 1.8 4 4.4.8-.3 4.4 3.6 2.6-2.3 3.8 2.3 3.8-3.6 2.6.3 4.4-4.4.8-1.8 4-4.3-1-3.2 3-3.2-3-4.3 1-1.8-4-4.4-.8.3-4.4L4.7 24 7 20.2 4.7 16.4l3.6-2.6-.3-4.4 4.4-.8 1.8-4 4.3 1 3.2-3z"
        fill={BRAND}
        fillOpacity="0.14"
        stroke={BRAND}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M15.5 22.5l4.5 4.5 8.5-9.5"
        stroke={BRAND}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Hero scene: certificate with wax seal and ribbons ──────────────── */

export function DocumentSeal({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 240 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Back sheet, slightly rotated — the pile of paperwork behind every career */}
      <rect
        x="52"
        y="18"
        width="128"
        height="158"
        rx="10"
        transform="rotate(-4 52 18)"
        fill={FILL}
        fillOpacity="0.45"
        stroke={LINE}
        strokeWidth="2"
      />
      {/* Front certificate — a lifted "paper" panel (raised surface) so the
          document reads as a solid object, not a wireframe of loose lines. */}
      <rect
        x="64"
        y="24"
        width="128"
        height="158"
        rx="10"
        fill="var(--raised)"
        stroke={LINE}
        strokeWidth="2.5"
      />
      {/* Folded corner */}
      <path
        d="M164 24h18a10 10 0 0 1 10 10v14h-28V24z"
        fill={FILL}
        fillOpacity="0.6"
      />
      <path d="M164 24l28 24" stroke={LINE} strokeWidth="2" strokeLinecap="round" />
      {/* Title rule + text lines */}
      <path d="M82 56h64" stroke={BRAND} strokeWidth="3" strokeLinecap="round" />
      <path d="M82 74h92" stroke={LINE} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M82 88h92" stroke={LINE} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M82 102h64" stroke={LINE} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M82 116h78" stroke={LINE} strokeWidth="2.5" strokeLinecap="round" />
      {/* Signature flourish */}
      <path
        d="M84 148c8-10 12 4 20-4s10 2 18-2"
        stroke={LINE}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Ribbon tails */}
      <path
        d="M158 158l-8 26 10-8 8 10 4-26"
        fill={BRAND}
        fillOpacity="0.22"
        stroke={BRAND}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Wax seal rosette */}
      <path
        d="M162 128l4.4 4.1 5.9-1.4 2.5 5.5 6 1.1-.4 6.1 4.9 3.6-3.1 5.2 3.1 5.2-4.9 3.6.4 6.1-6 1.1-2.5 5.5-5.9-1.4-4.4 4.1-4.4-4.1-5.9 1.4-2.5-5.5-6-1.1.4-6.1-4.9-3.6 3.1-5.2-3.1-5.2 4.9-3.6-.4-6.1 6-1.1 2.5-5.5 5.9 1.4 4.4-4.1z"
        fill="var(--bg)"
        stroke={BRAND}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="162" cy="156" r="14" stroke={BRAND} strokeWidth="2" opacity="0.5" />
      <path
        d="M155 156.5l5 5 9.5-10.5"
        stroke={BRAND}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Feature: magnifier over a certificate — "belgeniz okunur" ──────── */

export function MagnifierDoc({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 240 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="58"
        y="26"
        width="124"
        height="150"
        rx="10"
        fill="var(--surface)"
        stroke={LINE}
        strokeWidth="2.5"
      />
      <path d="M76 54h58" stroke={LINE} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M76 70h88" stroke={LINE} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M76 86h88" stroke={LINE} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M76 102h52" stroke={LINE} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M76 142h44" stroke={LINE} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M76 156h58" stroke={LINE} strokeWidth="2.5" strokeLinecap="round" />
      {/* Lens */}
      <circle
        cx="146"
        cy="116"
        r="34"
        fill="var(--bg)"
        fillOpacity="0.85"
        stroke={BRAND}
        strokeWidth="3"
      />
      {/* Magnified line inside the lens */}
      <path d="M130 108h32" stroke={BRAND} strokeWidth="3.5" strokeLinecap="round" />
      <path
        d="M132 124l7 7 14-16"
        stroke={BRAND}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Handle */}
      <path
        d="M170 141l22 22"
        stroke={BRAND}
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ── Feature: shield with keyhole — "onay sizde" ────────────────────── */

export function ShieldConsent({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 240 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Shield */}
      <path
        d="M120 24l58 20v52c0 40-26 66-58 80-32-14-58-40-58-80V44l58-20z"
        fill="var(--surface)"
        stroke={LINE}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M120 40l44 15v41c0 31-20 51-44 63-24-12-44-32-44-63V55l44-15z"
        stroke={FILL}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Keyhole — consent is the key that opens processing */}
      <circle cx="120" cy="94" r="14" fill="var(--bg)" stroke={BRAND} strokeWidth="3" />
      <path
        d="M114 128l3-24h6l3 24a12 6 0 0 1-12 0z"
        fill={BRAND}
        fillOpacity="0.25"
        stroke={BRAND}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Approval ticks orbiting the shield */}
      <path d="M44 60l6 6 10-11" stroke={BRAND} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M182 128l6 6 10-11" stroke={BRAND} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
    </svg>
  );
}

/* ── Feature: ledger with reasoned entries — "gerekçeli sonuç" ──────── */

export function LedgerCheck({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 240 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="48"
        y="24"
        width="144"
        height="152"
        rx="10"
        fill="var(--surface)"
        stroke={LINE}
        strokeWidth="2.5"
      />
      {/* Ledger margin rule */}
      <path d="M76 24v152" stroke={FILL} strokeWidth="2" />
      {/* Entries: status dot in the margin, reason line in the body */}
      <circle cx="62" cy="58" r="5" fill={BRAND} />
      <path d="M88 58h84" stroke={LINE} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="62" cy="88" r="5" stroke={BRAND} strokeWidth="2.5" />
      <path d="M88 88h68" stroke={LINE} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="62" cy="118" r="5" fill={BRAND} />
      <path d="M88 118h84" stroke={LINE} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="62" cy="148" r="5" stroke={BRAND} strokeWidth="2.5" />
      <path d="M88 148h56" stroke={LINE} strokeWidth="2.5" strokeLinecap="round" />
      {/* Margin note bracket — the "why" attached to a verdict */}
      <path
        d="M180 48c10 0 10 6 10 10v40c0 4 0 10 10 10-10 0-10 6-10 10v40c0 4 0 10-10 10"
        stroke={BRAND}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ── Small trust icons (44×44 grid, stroke 2) ───────────────────────── */

export function IconConsent({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <rect x="7" y="10" width="24" height="28" rx="4" stroke={LINE} strokeWidth="2" />
      <path d="M13 19h12M13 25h12M13 31h7" stroke={LINE} strokeWidth="2" strokeLinecap="round" />
      <circle cx="32" cy="30" r="9" fill="var(--bg)" stroke={BRAND} strokeWidth="2" />
      <path d="M28.5 30l2.5 2.5 4.5-5" stroke={BRAND} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconKvkk({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      {/* Scales of justice, simplified */}
      <path d="M22 8v26" stroke={LINE} strokeWidth="2" strokeLinecap="round" />
      <path d="M10 13h24" stroke={LINE} strokeWidth="2" strokeLinecap="round" />
      <path d="M14 34h16" stroke={LINE} strokeWidth="2" strokeLinecap="round" />
      <path d="M10 13l-5 11a6 5 0 0 0 10 0l-5-11z" stroke={BRAND} strokeWidth="2" strokeLinejoin="round" />
      <path d="M34 13l-5 11a6 5 0 0 0 10 0l-5-11z" stroke={BRAND} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function IconHumanReview({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      {/* An eye over a document: files are looked at by a person first */}
      <rect x="9" y="6" width="26" height="32" rx="4" stroke={LINE} strokeWidth="2" />
      <path d="M15 14h14M15 20h14" stroke={LINE} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 30c3.5-5 16.5-5 20 0-3.5 5-16.5 5-20 0z" stroke={BRAND} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="22" cy="30" r="2.5" fill={BRAND} />
    </svg>
  );
}

export function IconZeroTrust({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      {/* Padlock inside a sealed route */}
      <rect x="12" y="19" width="20" height="16" rx="4" stroke={BRAND} strokeWidth="2" />
      <path d="M16 19v-4a6 6 0 0 1 12 0v4" stroke={LINE} strokeWidth="2" strokeLinecap="round" />
      <circle cx="22" cy="27" r="2.5" fill={BRAND} />
      <path d="M4 27h4M36 27h4" stroke={LINE} strokeWidth="2" strokeLinecap="round" strokeDasharray="1 4" />
    </svg>
  );
}
