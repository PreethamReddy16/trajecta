// `run` command: executes every task, records trajectories, evaluates
// assertions, writes runs/<label>/trajectory-<task>.json + summary.json.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createAgent } from "./agents.js";
import { evaluateTask } from "./assertions.js";
import { loadTasks } from "./tasks.js";
import { assertSafeSlug } from "./validate.js";
import type { RunSummary, Task, TaskResult, Trajectory } from "./types.js";

export interface RunOptions {
  tasksFile: string;
  label: string;
  agent: string;
  fixtureDir: string;
  model?: string;
  outDir?: string;
}

function totals(t: Trajectory): { tokens: number; latencyMs: number } {
  const tokens = t.steps.reduce((n, s) => n + (s.tokens ?? 0), 0);
  const last = t.steps[t.steps.length - 1];
  const latencyMs = last ? last.timestampMs : 0;
  return { tokens, latencyMs };
}

export async function runSuite(opts: RunOptions): Promise<RunSummary> {
  assertSafeSlug(opts.label, "Run label");
  const tasks: Task[] = loadTasks(opts.tasksFile);
  const agent = createAgent(opts.agent, {
    fixtureDir: opts.fixtureDir,
    model: opts.model,
  });
  const runDir = join(opts.outDir ?? "runs", opts.label);
  mkdirSync(runDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const results: TaskResult[] = [];

  for (const task of tasks) {
    process.stdout.write(`  ${task.name} ... `);
    let trajectory: Trajectory;
    try {
      trajectory = await agent.runTask(task, opts.label);
    } catch (e) {
      // A crashed agent run still produces a task result (failed), so one
      // bad task cannot kill the whole suite.
      const message = e instanceof Error ? e.message : String(e);
      console.log("ERROR");
      console.log(`    agent failed: ${message}`);
      results.push({
        name: task.name,
        passed: false,
        assertions: [
          { type: "no_error", passed: false, message: `agent failed: ${message}` },
        ],
        steps: 0,
        tokens: 0,
        latencyMs: 0,
      });
      continue;
    }

    const { passed, results: assertions } = evaluateTask(task, trajectory);
    const { tokens, latencyMs } = totals(trajectory);

    writeFileSync(
      join(runDir, `trajectory-${task.name}.json`),
      JSON.stringify(trajectory, null, 2) + "\n",
    );

    const failed = assertions.filter((a) => !a.passed);
    const skipped = assertions.filter((a) => a.skipped);
    console.log(
      passed
        ? `PASS (${assertions.length} assertions${skipped.length ? `, ${skipped.length} skipped` : ""})`
        : `FAIL (${failed.length}/${assertions.length} failed)`,
    );
    for (const f of failed) {
      console.log(`    ✗ [${f.type}] ${f.message}`);
    }
    for (const s of skipped) {
      console.log(`    ○ [${s.type}] ${s.message}`);
    }

    results.push({
      name: task.name,
      passed,
      assertions,
      steps: trajectory.steps.length,
      tokens,
      latencyMs,
    });
  }

  const summary: RunSummary = {
    label: opts.label,
    agent: agent.name,
    model: opts.model ?? "fixture-model",
    startedAt,
    tasks: results,
    totals: {
      tasks: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      tokens: results.reduce((n, r) => n + r.tokens, 0),
      latencyMs: results.reduce((n, r) => n + r.latencyMs, 0),
    },
  };
  writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");

  console.log(
    `\nRun "${opts.label}": ${summary.totals.passed}/${summary.totals.tasks} passed, ` +
      `${summary.totals.tokens} tokens, ${(summary.totals.latencyMs / 1000).toFixed(1)}s total. ` +
      `Wrote ${runDir}/`,
  );
  return summary;
}
