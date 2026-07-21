export default function ReportPage({ params }: { params: { id: string } }) {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="border-b border-border-color pb-4 mb-8 text-center">
        <h1 className="text-xl font-bold uppercase text-border-color mb-2">Candidate: Alice Chen</h1>
        <h2 className="text-3xl font-bold text-primary">Senior React Engineer Match Analysis</h2>
      </div>

      <div className="space-y-6 mb-8">
        <div className="bg-surface p-6 rounded-lg border border-border-color shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-semibold">[+] REQUIREMENT: State Management (Context/Redux)</h3>
            <span className="px-3 py-1 bg-green-900/30 text-green-400 border border-green-500/50 rounded text-sm font-bold">VERIFIED ✅</span>
          </div>
          <div className="bg-background p-4 rounded mb-4">
            <p className="text-sm mb-2"><strong className="text-primary">AI REASONING:</strong> "Alice has implemented complex global state using React Context in multiple repositories."</p>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center">
              <span className="w-24 text-border-color">EVIDENCE 1:</span>
              <a href="#" className="text-blue-400 hover:underline">🔗 github.com/alice/ecommerce-app/commit/9f8d7a (View Diff)</a>
            </div>
            <div className="flex items-center">
              <span className="w-24 text-border-color">EVIDENCE 2:</span>
              <a href="#" className="text-blue-400 hover:underline">🔗 github.com/alice/dashboard-ui/pull/12 (Code Review Log)</a>
            </div>
          </div>
        </div>

        <div className="bg-surface p-6 rounded-lg border border-border-color shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-semibold">[-] REQUIREMENT: CI/CD Pipelines</h3>
            <span className="px-3 py-1 bg-yellow-900/30 text-yellow-400 border border-yellow-500/50 rounded text-sm font-bold">INSUFFICIENT EVIDENCE ⚠️</span>
          </div>
          <div className="bg-background p-4 rounded mb-4">
            <p className="text-sm mb-2"><strong className="text-primary">AI REASONING:</strong> "No GitHub Actions or TravisCI configurations were found in the provided repositories. The ChatGPT logs also do not contain discussions about deployment pipelines."</p>
          </div>
          <div className="text-sm p-3 border border-yellow-500/30 bg-yellow-900/10 rounded">
            <strong className="text-yellow-500">SUGGESTION:</strong> Ask candidate about this in the human interview.
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center pt-8 border-t border-border-color">
        <button className="px-6 py-3 border border-red-500/50 text-red-400 rounded hover:bg-red-900/20 transition font-semibold">Decline Candidate</button>
        <button className="px-6 py-3 bg-primary text-white rounded hover:bg-blue-700 transition font-semibold">Schedule Human Interview</button>
      </div>
    </div>
  );
}
