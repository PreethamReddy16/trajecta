// `report` command: generates a single self-contained HTML file per run.
// Inline CSS/JS only — no CDN, opens offline.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertSafeSlug, isTrajectory } from "./validate.js";
import type { RunSummary, Trajectory } from "./types.js";

export interface ReportOptions {
  label: string;
  runsDir?: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

const CSS = `
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:960px;margin:0 auto;padding:24px;color:#1a1a1a;background:#fafafa}
h1{font-size:24px;margin-bottom:4px}h2{font-size:18px;margin-top:32px}
.meta{color:#666;font-size:14px;margin-bottom:16px}
.stats{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}
.stat{background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:12px 16px;min-width:120px}
.stat .v{font-size:22px;font-weight:700}.stat .k{font-size:12px;color:#666}
.task{background:#fff;border:1px solid #e0e0e0;border-radius:8px;margin:16px 0;overflow:hidden}
.task-head{padding:14px 16px;display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none}
.task-head:hover{background:#f5f5f5}
.badge{font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;color:#fff}
.pass{background:#2e7d32}.fail{background:#c62828}
.task-name{font-weight:600;font-size:16px}
.task-sub{font-size:12px;color:#666;margin-left:auto}
.task-body{padding:0 16px 16px;display:none}
.task.open .task-body{display:block}
table{border-collapse:collapse;width:100%;font-size:13px;margin:8px 0}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top}
th{color:#666;font-weight:600}
.ok{color:#2e7d32;font-weight:700}.bad{color:#c62828;font-weight:700}.skip{color:#e65100;font-weight:700}
pre{background:#f4f4f4;padding:10px;border-radius:6px;overflow:auto;font-size:12px;max-height:300px}
.step-err{color:#c62828;font-size:12px}
footer{margin-top:40px;color:#999;font-size:12px}
`;

const JS = `
document.querySelectorAll('.task-head').forEach(h=>{
  h.addEventListener('click',()=>h.parentElement.classList.toggle('open'));
});
`;

export function generateReport(opts: ReportOptions): string {
  assertSafeSlug(opts.label, "Run label");
  const runsDir = opts.runsDir ?? "runs";
  const file = join(runsDir, opts.label, "summary.json");
  let summary: RunSummary;
  try {
    summary = JSON.parse(readFileSync(file, "utf8")) as RunSummary;
  } catch {
    throw new Error(`Cannot load run "${opts.label}" (looked for ${file}). Run it first.`);
  }

  const t = summary.totals;
  const taskHtml = summary.tasks
    .map((task) => {
      const traj = loadTrajectory(runsDir, opts.label, task.name);
      const badge = task.passed
        ? `<span class="badge pass">PASS</span>`
        : `<span class="badge fail">FAIL</span>`;

      const assertionRows = task.assertions
        .map((a) => {
          const cls = a.skipped ? "skip" : a.passed ? "ok" : "bad";
          const verdict = a.skipped ? "SKIP" : a.passed ? "PASS" : "FAIL";
          return `<tr><td class="${cls}">${verdict}</td><td><code>${esc(a.type)}</code></td><td>${esc(a.message)}</td></tr>`;
        })
        .join("");

      const stepRows = traj
        ? traj.steps
            .map(
              (s) =>
                `<tr><td>${s.seq}</td><td><code>${esc(s.action)}</code></td>` +
                `<td>${esc(s.detail)}</td><td>${esc(s.target ?? "—")}</td>` +
                `<td>${esc(s.url.length > 60 ? s.url.slice(0, 60) + "…" : s.url)}</td>` +
                `<td>${s.tokens ?? "—"}</td><td>${s.latencyMs ?? "—"}</td>` +
                `<td>${s.error ? `<span class="step-err">${esc(s.error)}</span>` : "—"}</td></tr>`,
            )
            .join("")
        : `<tr><td colspan="8">trajectory file missing</td></tr>`;

      const extracted = traj
        ? `<h3>Extracted data</h3><pre>${esc(JSON.stringify(traj.extractedData, null, 2))}</pre>`
        : "";

      return `
      <div class="task${task.passed ? "" : " open"}">
        <div class="task-head">${badge}<span class="task-name">${esc(task.name)}</span>
          <span class="task-sub">${task.steps} steps · ${task.tokens} tokens · ${(task.latencyMs / 1000).toFixed(1)}s</span></div>
        <div class="task-body">
          <h3>Assertions</h3>
          <table><tr><th>Result</th><th>Type</th><th>Detail</th></tr>${assertionRows}</table>
          <h3>Trajectory</h3>
          <table><tr><th>#</th><th>Action</th><th>Detail</th><th>Target</th><th>URL</th><th>Tokens</th><th>Latency ms</th><th>Error</th></tr>${stepRows}</table>
          ${extracted}
        </div>
      </div>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Eval report — ${esc(summary.label)}</title>
<style>${CSS}</style></head>
<body>
<h1>Browser agent eval — ${esc(summary.label)}</h1>
<div class="meta">agent: ${esc(summary.agent)} · model: ${esc(summary.model)} · ${esc(summary.startedAt)}</div>
<div class="stats">
  <div class="stat"><div class="v">${t.passed}/${t.tasks}</div><div class="k">tasks passed</div></div>
  <div class="stat"><div class="v">${t.failed}</div><div class="k">failed</div></div>
  <div class="stat"><div class="v">${t.tokens}</div><div class="k">total tokens</div></div>
  <div class="stat"><div class="v">${(t.latencyMs / 1000).toFixed(1)}s</div><div class="k">total latency</div></div>
</div>
<h2>Tasks</h2>
${taskHtml}
<footer>Generated by browser-agent-eval v1. Click a task header to expand.</footer>
<script>${JS}</script>
</body></html>`;

  const out = join(runsDir, opts.label, "report.html");
  writeFileSync(out, html);
  return out;
}
