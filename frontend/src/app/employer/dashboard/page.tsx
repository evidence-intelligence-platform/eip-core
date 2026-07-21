export default function EmployerDashboard() {
  return (
    <div className="p-8">
      <div className="flex justify-between items-center border-b border-border-color pb-4 mb-8">
        <h1 className="text-2xl font-bold text-primary">EIP Employer Dashboard</h1>
        <div className="flex space-x-4 text-sm">
          <span className="cursor-pointer hover:text-primary">Dashboard</span>
          <span className="cursor-pointer hover:text-primary">Jobs</span>
          <span className="cursor-pointer hover:text-primary">Team Settings</span>
        </div>
      </div>

      <div className="bg-surface p-6 rounded-lg border border-border-color shadow-sm mb-8">
        <h2 className="text-xl font-semibold mb-4">[ Senior React Engineer ] - 14 Candidates Analyzed</h2>
        <div className="bg-background p-4 rounded border border-border-color">
          <h3 className="font-semibold mb-2">AI Extracted Requirements:</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span>✔ State Management (Context/Redux)</span>
            <span>✔ CI/CD Pipelines</span>
            <span>✔ Team Communication & Code Review</span>
            <span>✔ API Integration</span>
          </div>
        </div>
      </div>

      <div className="bg-surface p-6 rounded-lg border border-border-color shadow-sm">
        <h3 className="text-lg font-semibold mb-4">CANDIDATE LIST (Sorted by Evidence Density, not random scores):</h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center p-4 bg-background rounded border border-border-color">
            <div>
              <span className="font-bold">1. Alice Chen</span>
              <span className="mx-2 text-border-color">|</span>
              <span className="text-green-500">Evidence Match: HIGH</span>
              <span className="mx-2 text-border-color">|</span>
              <span className="text-sm">14 Verified Pointers</span>
            </div>
            <button className="px-4 py-2 bg-primary text-white text-sm rounded hover:bg-blue-700 transition">View Report</button>
          </div>
          
          <div className="flex justify-between items-center p-4 bg-background rounded border border-border-color">
            <div>
              <span className="font-bold">2. Bob Smith</span>
              <span className="mx-2 text-border-color">|</span>
              <span className="text-yellow-500">Evidence Match: MED</span>
              <span className="mx-2 text-border-color">|</span>
              <span className="text-sm">5 Verified Pointers</span>
            </div>
            <button className="px-4 py-2 bg-primary text-white text-sm rounded hover:bg-blue-700 transition">View Report</button>
          </div>

          <div className="flex justify-between items-center p-4 bg-background rounded border border-border-color opacity-70">
            <div>
              <span className="font-bold">3. Charlie Doe</span>
              <span className="mx-2 text-border-color">|</span>
              <span className="text-red-400">INSUFFICIENT DATA</span>
              <span className="mx-2 text-border-color">|</span>
              <span className="text-sm">0 Verified Pointers</span>
            </div>
            <button className="px-4 py-2 border border-border-color text-sm rounded hover:bg-surface transition">Request More</button>
          </div>
        </div>
      </div>
    </div>
  );
}
