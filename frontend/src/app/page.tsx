import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-8">
      <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl">
        Evidence Intelligence Platform
      </h1>
      <p className="mt-6 text-lg leading-8 text-zinc-400 max-w-2xl">
        AI-driven skill extraction. Define requirements, provide candidate data, and let the AI find verifiable evidence without bias or guesswork.
      </p>
      <div className="mt-10 flex items-center justify-center gap-x-6">
        <Link
          href="/candidates"
          className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
        >
          Manage Candidates
        </Link>
        <Link
          href="/requirements"
          className="text-sm font-semibold leading-6 text-white hover:text-zinc-300"
        >
          Define Requirements <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}
