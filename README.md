# browser-agent-eval

A regression eval harness for browser agents (v1 prototype).

Define tasks in YAML, run a browser agent against them, record the full
trajectory of every run, check assertions (URL reached, text present, extracted
data matches a JSON schema, no errors), diff two runs to catch regressions, and
get a self-contained HTML report. Stagehand-first design.

## Quickstart

```bash
npm install
npm run demo   # zero API keys, zero network calls — runs two fixture suites,
               # diffs them, and writes runs/candidate/report.html
```

Then open `runs/candidate/report.html` in a browser.

What the demo does:

1. Runs the example suite from `examples/tasks.yaml` against canned fixtures
   as the **baseline** — 3/3 tasks pass.
2. Runs the same suite as the **candidate**, with one planted regression —
   2/3 pass.
3. Diffs baseline vs candidate, prints the new failure plus action-sequence
   and cost/latency deltas, and exits 1 (expected — that's the regression).
4. Writes an offline HTML report to `runs/candidate/report.html`.

### CLI

```bash
# Run a suite (fixtures = keyless replay; see below for live runs)
node dist/cli.js run --tasks examples/tasks.yaml --label baseline --fixtures fixtures/baseline

# Diff two runs (exits 1 if the candidate has new failures — CI-friendly)
node dist/cli.js diff --base baseline --candidate candidate

# HTML report for one run (inline CSS/JS only, opens offline)
node dist/cli.js report --label candidate
```

Every run writes `runs/<label>/trajectory-<task>.json` plus `runs/<label>/summary.json`.
Diffs are saved to `runs/diffs/<base>--vs--<candidate>.json`.

### Exit codes

| Command | 0 | 1 | 2 |
|---|---|---|---|
| `run` | suite completed (even with failing tasks — check `summary.json`) | — | invalid input, missing file, or agent crash |
| `diff` | no new failures in the candidate | candidate has new failures | missing run data or invalid input |
| `report` | report written | — | missing run data |

The `diff` exit code is what makes this CI-friendly: fail the build when the
candidate agent regresses vs the baseline.

## Task files

Task names and run labels become file names (`trajectory-<name>.json`,
`runs/<label>/`), so they must be slugs: letters, digits, dot, dash,
underscore, starting with a letter or digit. Duplicate task names are rejected.
A task file looks like this:

```yaml
version: 1
tasks:
  - name: my-task            # slug; must match fixture file trajectory-<name>.json
    startUrl: https://example.com
    goal: Plain-words description of what the agent should do.
    assertions:
      - type: url_contains
        value: example.com
      - type: text_present
        value: Example Domain
      - type: schema
        value:
          type: object
          required: [title]
          properties:
            title: { type: string }
      - type: no_error
      - type: llm_judge
        value: { prompt: "Did the agent complete the goal?" }
```

## Assertion types

| Type | `value` | Passes when |
|---|---|---|
| `url_contains` | non-empty string | any visited step URL contains the substring |
| `text_present` | non-empty string, or `/regex/flags` | the substring (or regex) appears in step details, targets, URLs, errors, or extracted data |
| `schema` | a JSON Schema object | the agent's `extractedData` validates against it (checked with AJV; failures list each schema error) |
| `no_error` | unused | no step recorded an `error` and the trajectory has no top-level error |
| `llm_judge` | optional `{ prompt: "..." }` | skipped in v1 — the harness never calls an LLM provider, so this always reports SKIP with an explanation instead of failing |

Assertion values are validated when the task file loads, so a misconfigured
`value` fails fast with a clear message instead of silently at eval time.
`text_present` treats `/pattern/flags` as a regular expression; anything else
is a plain substring match. An invalid regex fails that assertion with a
message rather than throwing.

## Keyless runs (fixtures)

`--agent fixture` (the default) replays canned trajectories from
`<fixtures-dir>/trajectory-<task-name>.json`, shaped like real Stagehand runs:
steps with action, detail, target, url, timestamps, token usage, latency, and
errors, plus `extractedData`. Fixture files are shape-checked on load; a file
that isn't a valid trajectory is rejected with a clear error. Add your own
fixtures to build regression suites without spending a cent on model calls.

## Wiring a real Stagehand agent

`--agent stagehand` exists as a stub (`src/agents.ts`, `StagehandAgent`) with
the integration points marked TODO. To make it live:

1. `npm i @browserbasehq/stagehand` and implement `runTask` per the TODOs:
   init Stagehand, `goto(task.startUrl)`, loop `act`/`extract`/`observe`,
   append every step (url, timestamp, tokens, latency), set `step.error` on
   failures instead of throwing, close the browser, return the `Trajectory`.
2. Keys you need:
   - `ANTHROPIC_API_KEY` (Claude models) and/or `OPENAI_API_KEY` — whichever
     model Stagehand drives.
   - If you use a cloud browser instead of local Chromium: `BROWSERBASE_API_KEY`
     (and `BROWSERBASE_PROJECT_ID`).
3. No keys are read from files or committed anywhere — pass them as env vars.

## CI usage

```bash
npm run build
node dist/cli.js run --tasks examples/tasks.yaml --label baseline --fixtures fixtures/baseline
node dist/cli.js run --tasks examples/tasks.yaml --label candidate --fixtures fixtures/candidate
node dist/cli.js diff --base baseline --candidate candidate  # exits 1 on regressions
```

## Security notes

- No shell-outs anywhere: the harness never spawns subprocesses, so task
  content cannot become a command-injection vector.
- Task names and run labels are restricted to filename-safe slugs, so a
  crafted YAML cannot write outside `runs/` (path traversal is rejected at
  load time).
- The HTML report escapes all run data before embedding it, so trajectory
  content cannot break out of the report markup.
- API keys are only ever read from environment variables, never from files,
  and never written to run output.

## Roadmap (out of scope for v1)

Hosted service, user accounts/auth, a web UI beyond the static report, billing,
scheduled runs, and the landing page are all explicitly out of scope for v1.
v1 is a local CLI: YAML in, trajectories and HTML out.
