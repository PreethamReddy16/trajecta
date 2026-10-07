#!/usr/bin/env node
// CLI: bae run | bae diff | bae report
import { Command } from "commander";
import { runSuite } from "./runner.js";
import { diffRuns, printDiff } from "./diff.js";
import { generateReport } from "./report.js";

const program = new Command();
program.name("bae").description("Regression eval harness for browser agents").version("0.1.0");

program
  .command("run")
  .description("Run a task suite and record trajectories")
  .requiredOption("--tasks <file>", "task definition YAML file")
  .requiredOption("--label <label>", "run label (used for runs/<label>/)")
  .option("--agent <kind>", "fixture | stagehand", "fixture")
  .option("--fixtures <dir>", "fixture directory for --agent fixture", "fixtures")
  .option("--model <name>", "model name recorded on trajectories")
  .action(async (o) => {
    try {
      await runSuite({
        tasksFile: o.tasks,
        label: o.label,
        agent: o.agent,
        fixtureDir: o.fixtures,
        model: o.model,
      });
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(2);
    }
  });

program
  .command("diff")
  .description("Diff two runs; exits 1 if the candidate has new failures")
  .requiredOption("--base <label>", "baseline run label")
  .requiredOption("--candidate <label>", "candidate run label")
  .action((o) => {
    try {
      const d = diffRuns({ base: o.base, candidate: o.candidate });
      printDiff(d);
      process.exit(d.newFailures.length > 0 ? 1 : 0);
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(2);
    }
  });

program
  .command("report")
  .description("Generate a self-contained HTML report for a run")
  .requiredOption("--label <label>", "run label")
  .action((o) => {
    try {
      const out = generateReport({ label: o.label });
      console.log(`Wrote ${out}`);
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(2);
    }
  });

program.parseAsync(process.argv);
