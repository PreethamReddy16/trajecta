#!/usr/bin/env bash
# Demo: two keyless fixture runs, a regression diff, and an HTML report.
# Zero API keys, zero network calls to LLM providers.
set -u
cd "$(dirname "$0")/.."

echo "== Building =="
npm run build --silent

echo ""
echo "== Run 1: baseline (fixtures) =="
node dist/cli.js run --tasks examples/tasks.yaml --label baseline --fixtures fixtures/baseline

echo ""
echo "== Run 2: candidate (fixtures, with a planted regression) =="
node dist/cli.js run --tasks examples/tasks.yaml --label candidate --fixtures fixtures/candidate

echo ""
echo "== Diff: baseline vs candidate =="
# diff exits 1 when the candidate has new failures (CI-friendly); that is
# expected here, so don't let it stop the demo.
node dist/cli.js diff --base baseline --candidate candidate || true

echo ""
echo "== Report: candidate =="
node dist/cli.js report --label candidate

echo ""
echo "Demo complete. Open runs/candidate/report.html in a browser."
