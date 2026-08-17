import Link from "next/link";

/** Slim cross-link back to the employer side — the seam between the two
    platforms. Static and server-rendered: it never depends on auth state,
    it just tells a lost employer where the other door is. */
export default function CandidateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="border-b border-line bg-well/60">
        <div className="container mx-auto px-4 py-2 text-center text-xs text-fg-mute">
          İşe alım mı yapacaksınız?{" "}
          <Link
            href="/register/isveren"
            className="text-brand hover:text-brand-strong hover:underline font-semibold transition-colors"
          >
            İşveren platformuna geçin &rarr;
          </Link>
        </div>
      </div>
      {children}
    </div>
  );
}
