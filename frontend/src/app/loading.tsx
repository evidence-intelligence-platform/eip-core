import { SealMark } from "@/components/illustrations";

/**
 * Route-transition fallback: shown while a server-rendered segment streams
 * in. Client pages still manage their own in-page loading; this covers the
 * gap between a click and the next screen so navigation never flashes blank.
 */
export default function Loading() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4">
      <SealMark className="w-12 h-12 opacity-80 animate-float" />
      {/* role="status" announces the transition politely; the spinner is
          purely decorative next to the visible text. */}
      <div role="status" className="flex items-center gap-2 text-fg-mute text-sm">
        <span
          aria-hidden="true"
          className="w-4 h-4 border-2 border-brand/30 border-t-brand rounded-full animate-spin"
        />
        Yükleniyor…
      </div>
    </div>
  );
}
