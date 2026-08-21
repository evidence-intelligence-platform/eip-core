import Link from "next/link";

/** Slim cross-link over to the candidate side — mirrors candidate/layout.tsx.
    Points at the candidate hub so "platformuna geçin" actually switches
    platforms; the hub's own guard routes signed-out visitors to login. */
export default function EmployerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="border-b border-line bg-well/60">
        <div className="container mx-auto px-4 py-2 text-center text-xs text-fg-mute">
          İş mi arıyorsunuz?{" "}
          <Link
            href="/candidate/hub"
            className="text-brand hover:text-brand-strong hover:underline font-semibold transition-colors"
          >
            Aday platformuna geçin &rarr;
          </Link>
        </div>
      </div>
      {children}
    </div>
  );
}
