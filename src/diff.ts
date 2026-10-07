// `diff` command: compares two runs and reports regressions.
// Exits non-zero when the candidate introduces new failures (CI-friendly).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertSafeSlug, isTrajectory } from "./validate.js";
import type {
  CostDelta,
  DiffResult,
  RunSummary,
  SequenceChange,
  Trajectory,
} from "./types.js";

export interface DiffOptions {
  base: string;
  candidate: string;
  runsDir?: string;
}

function loadSummary(runsDir: string, label: string): RunSummary {
  const file = join(runsDir, label, "summary.json");
  try {
    return JSON.parse(readFileSync(file, "utf8")) as RunSummary;
  } catch {
    throw new Error(`Cannot load run "${label}" (looked for ${file}). Run it first.`);
  }
}

function loadTrajectory(runsDir: string, label: string, task: string): Trajectory | null {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(join(runsDir, label, `trajectory-${task}.json`), "utf8"),
    );
    return isTrajectory(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function actionSequence(t: Trajectory | null): string[] {
  return t ? t.steps.map((s) => s.action) : [];
}

export function diffRuns(opts: DiffOptions): DiffResult {
  assertSafeSlug(opts.base, "Base label");
  assertSafeSlug(opts.candidate, "Candidate label");
  const runsDir = opts.runsDir ?? "runs";
  const base = loadSummary(runsDir, opts.base);
  const cand = loadSummary(runsDir, opts.candidate);

  const baseByTask = new Map(base.tasks.map((t) => [t.name, t]));
  const candByTask = new Map(cand.tasks.map((t) => [t.name, t]));

  const newFailures: string[] = [];
  const fixed: string[] = [];
  const changedSequences: SequenceChange[] = [];
  const costDeltas: CostDelta[] = [];

  for (const [name, b] of baseByTask) {
    const c = candByTask.get(name);
    if (!c) continue; // task removed from suite; not a regression
    if (b.passed && !c.passed) newFailures.push(name);
    if (!b.passed && c.passed) fixed.push(name);

    const baseSeq = actionSequence(loadTrajectory(runsDir, opts.base, name));
    const candSeq = actionSequence(loadTrajectory(runsDir, opts.candidate, name));
    if (baseSeq.join(">") !== candSeq.join(">")) {
      changedSequences.push({ task: name, base: baseSeq, candidate: candSeq });
    }

    costDeltas.push({
      task: name,
      tokensBase: b.tokens,
      tokensCandidate: c.tokens,
      tokensDelta: c.tokens - b.tokens,
      latencyBaseMs: b.latencyMs,
      latencyCandidateMs: c.latencyMs,
      latencyDeltaMs: c.latencyMs - b.latencyMs,
    });
  }
  // Tasks that only exist in the candidate are new coverage, not regressions.
  for (const [name] of candByTask) {
    if (!baseByTask.has(name)) {
      const c = candByTask.get(name)!;
      costDeltas.push({
        task: name,
        tokensBase: 0,
        tokensCandidate: c.tokens,
        tokensDelta: c.tokens,
        latencyBaseMs: 0,
        latencyCandidateMs: c.latencyMs,
        latencyDeltaMs: c.latencyMs,
      });
    }
  }

  const result: DiffResult = {
    base: opts.base,
    candidate: opts.candidate,
    newFailures,
    fixed,
    changedSequences,
    costDeltas,
    totalsDelta: {
      tokens: cand.totals.tokens - base.totals.tokens,
      latencyMs: cand.totals.latencyMs - base.totals.latencyMs,
    },
  };

  const diffDir = join(runsDir, "diffs");
  mkdirSync(diffDir, { recursive: true });
  writeFileSync(
    join(diffDir, `${opts.base}--vs--${opts.candidate}.json`),
    JSON.stringify(result, null, 2) + "\n",
  );
  return result;
}

function fmtDelta(n: number, unit: string): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}${unit}`;
}

export function printDiff(d: DiffResult): void {
  console.log(`\nDiff: ${d.base} → ${d.candidate}\n`);

  if (d.newFailures.length > 0) {
    console.log("New failures (passed before, failing now):");
    for (const t of d.newFailures) console.log(`  ✗ ${t}`);
  } else {
    console.log("New failures: none");
  }

  if (d.fixed.length > 0) {
    console.log("Fixed (failing before, passing now):");
    for (const t of d.fixed) console.log(`  ✓ ${t}`);
  }

  if (d.changedSequences.length > 0) {
    console.log("\nChanged action sequences:");
    for (const c of d.changedSequences) {
      console.log(`  ${c.task}:`);
      console.log(`    base:      ${c.base.join(" → ")}`);
      console.log(`    candidate: ${c.candidate.join(" → ")}`);
    }
  } else {
    console.log("\nChanged action sequences: none");
  }

  console.log("\nCost / latency deltas per task:");
  for (const c of d.costDeltas) {
    console.log(
      `  ${c.task}: tokens ${fmtDelta(c.tokensDelta, "")} ` +
        `(${c.tokensBase} → ${c.tokensCandidate}), ` +
        `latency ${fmtDelta(c.latencyDeltaMs, "ms")}`,
    );
  }
  console.log(
    `\nTotals: tokens ${fmtDelta(d.totalsDelta.tokens, "")}, ` +
      `latency ${fmtDelta(d.totalsDelta.latencyMs, "ms")}`,
  );

  if (d.newFailures.length > 0) {
    console.log(`\nResult: REGRESSION — ${d.newFailures.length} new failure(s).`);
  } else {
    console.log("\nResult: OK — no new failures.");
  }
}
