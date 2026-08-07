import { Evidence, isEvidenceApproved, summarizeEvidences } from '../lib/api';

/**
 * Frontend Unit Test Suite — Report Summary & Moderation Gate
 * ---
 * Verifies that pending/rejected evidence never counts toward the
 * candidate-facing score. The backend serves employers only approved rows,
 * so the same report URL must add up to the same score for both viewers.
 */

const row = (overrides: Partial<Evidence>): Evidence => ({
  candidate_external_id: 'cand_test',
  requirement_external_id: 'req_test',
  status: 'VERIFIED',
  reasoning: 'test',
  ...overrides,
});

export function testApprovalGate() {
  console.log('[TEST] Verifying isEvidenceApproved moderation gate...');
  if (!isEvidenceApproved(row({ review_status: 'approved' }))) {
    throw new Error('Approved evidence must pass the gate!');
  }
  // Legacy rows predate moderation and were always shown.
  if (!isEvidenceApproved(row({}))) {
    throw new Error('Evidence without review_status must pass the gate!');
  }
  if (isEvidenceApproved(row({ review_status: 'pending' }))) {
    throw new Error('Pending evidence must not pass the gate!');
  }
  if (isEvidenceApproved(row({ review_status: 'rejected' }))) {
    throw new Error('Rejected evidence must not pass the gate!');
  }
  console.log('  [PASS] Only approved (or legacy) evidence passes the gate.');
}

export function testRejectedEvidenceDoesNotScore() {
  console.log('[TEST] Verifying a rejected VERIFIED row cannot yield %100...');
  // The confirmed defect: one rejected row whose AI status is VERIFIED
  // showed the candidate %100 while the employer saw %0.
  const summary = summarizeEvidences([
    row({ status: 'VERIFIED', review_status: 'rejected' }),
  ]);
  if (summary.total !== 0 || summary.verified !== 0 || summary.score !== 0) {
    throw new Error(
      `Rejected evidence leaked into the score: ${JSON.stringify(summary)}`
    );
  }
  console.log('  [PASS] Rejected evidence yields total 0 / score 0.');
}

export function testCandidateAndEmployerScoresMatch() {
  console.log('[TEST] Verifying candidate and employer views compute the same score...');
  const approved = row({ status: 'VERIFIED', review_status: 'approved' });
  // The candidate additionally receives their pending/rejected rows.
  const candidateView = [
    approved,
    row({ status: 'VERIFIED', review_status: 'pending' }),
    row({ status: 'CONTRADICTION', review_status: 'rejected' }),
  ];
  const employerView = [approved];

  const a = summarizeEvidences(candidateView);
  const b = summarizeEvidences(employerView);
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(
      `Score diverges by viewer: candidate=${JSON.stringify(a)} employer=${JSON.stringify(b)}`
    );
  }
  if (a.total !== 1 || a.verified !== 1 || a.score !== 100 || a.contradictions !== 0) {
    throw new Error(`Unexpected summary: ${JSON.stringify(a)}`);
  }
  console.log('  [PASS] Both viewers see 1/1 → %100; pending/rejected rows are excluded.');
}

export function testMixedStatusesCountApprovedOnly() {
  console.log('[TEST] Verifying counts over mixed AI statuses...');
  const summary = summarizeEvidences([
    row({ status: 'VERIFIED', review_status: 'approved' }),
    row({ status: 'INSUFFICIENT EVIDENCE', review_status: 'approved' }),
    row({ status: 'CONTRADICTION' }), // legacy row, counts
    row({ status: 'VERIFIED', review_status: 'pending' }), // excluded
  ]);
  if (
    summary.total !== 3 ||
    summary.verified !== 1 ||
    summary.insufficient !== 1 ||
    summary.contradictions !== 1 ||
    summary.score !== Math.round((1 / 3) * 100)
  ) {
    throw new Error(`Unexpected mixed summary: ${JSON.stringify(summary)}`);
  }
  console.log('  [PASS] Approved and legacy rows count; pending rows do not.');
}

// Self-executing runner for verification
if (require.main === module) {
  try {
    testApprovalGate();
    testRejectedEvidenceDoesNotScore();
    testCandidateAndEmployerScoresMatch();
    testMixedStatusesCountApprovedOnly();
    console.log('[SUCCESS] All Report Summary Unit Tests Passed!');
  } catch (err: unknown) {
    console.error(
      '[FAIL] Report Summary Unit Test Failed:',
      err instanceof Error ? err.message : err
    );
    process.exit(1);
  }
}
