// Agent adapters. Every agent records a Trajectory for a Task.
//
// v1 ships two implementations:
//   - FixtureAgent: replays canned trajectories from JSON files. Needs no keys,
//     no network. This is what `npm run demo` uses.
//   - StagehandAgent: stub with the real integration points marked TODO.
//     See README "Wiring a real Stagehand agent" for the keys you need.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isTrajectory } from "./validate.js";
import type { Task, Trajectory } from "./types.js";

export interface TrajectoryRecorder {
  /** Human-readable agent name, recorded on every trajectory. */
  readonly name: string;
  runTask(task: Task, label: string): Promise<Trajectory>;
}

/**
 * Replays canned trajectories shaped like real Stagehand runs.
 * Looks for `<fixtureDir>/trajectory-<taskName>.json`.
 */
export class FixtureAgent implements TrajectoryRecorder {
  readonly name = "fixture";
  private fixtureDir: string;
  private model: string;

  constructor(fixtureDir: string, model = "fixture-model") {
    this.fixtureDir = fixtureDir;
    this.model = model;
  }

  async runTask(task: Task, label: string): Promise<Trajectory> {
    const file = join(this.fixtureDir, `trajectory-${task.name}.json`);
    if (!existsSync(file)) {
      throw new Error(
        `FixtureAgent: no fixture for task "${task.name}" (looked for ${file}). ` +
          `Add one, or run a live agent instead.`,
      );
    }
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!isTrajectory(parsed)) {
      throw new Error(`FixtureAgent: ${file} is not a valid trajectory JSON`);
    }
    if (parsed.taskName !== task.name) {
      throw new Error(
        `FixtureAgent: fixture taskName "${parsed.taskName}" does not match task "${task.name}"`,
      );
    }
    // Stamp the run label onto the replayed trajectory.
    return { ...parsed, label, agent: this.name, model: this.model };
  }
}

/**
 * Stub adapter for a real Stagehand-driven agent.
 *
 * TODO (to wire a live run):
 *  1. `npm i @browserbasehq/stagehand` (or point at your Stagehand fork).
 *  2. Set ANTHROPIC_API_KEY (Claude models) and/or OPENAI_API_KEY.
 *     If you drive a remote browser, also set BROWSERBASE_API_KEY (+ PROJECT_ID).
 *  3. Replace the body of runTask below:
 *       - new Stagehand({ env: "LOCAL" | "BROWSERBASE", modelName, ... })
 *       - await stagehand.init(); await page.goto(task.startUrl)
 *       - loop: page.act(instruction) / page.extract(...) / page.observe(...)
 *       - append every action to `steps` with url, timestampMs, tokens, latencyMs
 *       - on failure set step.error (and keep going — assertions decide pass/fail)
 *       - await stagehand.close()
 *  4. Return the assembled Trajectory.
 *
 * See README "Wiring a real Stagehand agent" for a fuller sketch.
 */
export class StagehandAgent implements TrajectoryRecorder {
  readonly name = "stagehand";
  private modelName: string;

  constructor(modelName = "claude-sonnet-4-5") {
    this.modelName = modelName;
  }

  async runTask(task: Task, _label: string): Promise<Trajectory> {
    const hasKey = Boolean(
      process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,
    );
    throw new Error(
      `StagehandAgent is a stub in v1 and cannot run task "${task.name}" yet. ` +
        (hasKey
          ? "An LLM API key was found, but the Stagehand integration is not implemented — see the TODO in src/agents.ts and README."
          : "No ANTHROPIC_API_KEY or OPENAI_API_KEY is set, and the Stagehand integration is not implemented — see the TODO in src/agents.ts and README. " +
            "Use --agent fixture for keyless runs."),
    );
  }
}

export function createAgent(kind: string, opts: { fixtureDir?: string; model?: string }): TrajectoryRecorder {
  if (kind === "fixture") {
    return new FixtureAgent(opts.fixtureDir ?? "fixtures", opts.model);
  }
  if (kind === "stagehand") {
    return new StagehandAgent(opts.model);
  }
  throw new Error(`Unknown agent "${kind}" (expected "fixture" or "stagehand")`);
}
