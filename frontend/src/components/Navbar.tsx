import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="bg-zinc-900 border-b border-zinc-800 text-zinc-100 p-4">
      <div className="container mx-auto flex items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-tight text-white hover:text-zinc-300 transition-colors">
          Evidence Intelligence Platform
        </Link>
        <div className="flex space-x-6">
          <Link href="/candidates" className="hover:text-blue-400 transition-colors">
            Candidates
          </Link>
          <Link href="/requirements" className="hover:text-blue-400 transition-colors">
            Requirements
          </Link>
        </div>
      </div>
    </nav>
  );
}
