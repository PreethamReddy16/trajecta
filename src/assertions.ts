// Assertions engine: evaluates each assertion against a recorded trajectory.
import Ajv from "ajv";
import type { Assertion, AssertionResult, Task, Trajectory } from "./types.js";

const ajv = new Ajv({ allErrors: true, strict: false });

/** All text the agent saw: step details, targets, urls, plus extracted data. */
function haystack(t: Trajectory): string {
  const parts: string[] = [];
  for (const s of t.steps) {
    parts.push(s.detail, s.target ?? "", s.url);
    if (s.error) parts.push(s.error);
  }
  parts.push(JSON.stringify(t.extractedData));
  if (t.error) parts.push(t.error);
  return parts.join("\n");
}

function matchText(hay: string, value: unknown): { ok: boolean; message: string } {
  if (typeof value !== "string") {
    return { ok: false, message: "text_present needs a string value" };
  }
  // /pattern/flags form is treated as a regex; anything else is a substring.
  const m = value.match(/^\/(.+)\/([a-z]*)$/);
  if (m) {
    let re: RegExp;
    try {
      re = new RegExp(m[1], m[2]);
    } catch {
      return { ok: false, message: `text_present: invalid regex ${value}` };
    }
    return re.test(hay)
      ? { ok: true, message: `regex ${value} matched page text` }
      : { ok: false, message: `regex ${value} not found in page text` };
  }
  return hay.includes(value)
    ? { ok: true, message: `found "${value}" in page text` }
    : { ok: false, message: `"${value}" not found in page text` };
}

function checkSchema(t: Trajectory, value: unknown): { ok: boolean; message: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, message: "schema assertion needs a JSON Schema object as value" };
  }
  let validate: ReturnType<Ajv["compile"]>;
  try {
    validate = ajv.compile(value as object);
  } catch (e) {
    return { ok: false, message: `invalid JSON Schema: ${(e as Error).message}` };
  }
  const valid = validate(t.extractedData);
  if (valid) return { ok: true, message: "extractedData matches schema" };
  const errors = (validate.errors ?? [])
    .map((e) => `${e.instancePath || "/"} ${e.message}`)
    .join("; ");
  return { ok: false, message: `extractedData failed schema: ${errors}` };
}

function checkNoError(t: Trajectory): { ok: boolean; message: string } {
  const stepErrors = t.steps.filter((s) => s.error).map((s) => `#${s.seq} ${s.error}`);
  if (t.error) stepErrors.push(`trajectory: ${t.error}`);
  return stepErrors.length === 0
    ? { ok: true, message: "no errors recorded" }
    : { ok: false, message: `errors: ${stepErrors.join("; ")}` };
}

function checkUrlContains(t: Trajectory, value: unknown): { ok: boolean; message: string } {
  if (typeof value !== "string") {
    return { ok: false, message: "url_contains needs a string value" };
  }
  const hit = t.steps.some((s) => s.url.includes(value));
  return hit
    ? { ok: true, message: `visited a URL containing "${value}"` }
    : { ok: false, message: `no visited URL contained "${value}"` };
}

function checkLlmJudge(): { ok: boolean; skipped: true; message: string } {
  // v1 never calls an LLM provider (no network calls by design). The hook is
  // here: when a key exists and a provider client is wired, grade the
  // trajectory against the assertion's { prompt: string } value.
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
  return {
    ok: true,
    skipped: true,
    message: hasKey
      ? "llm_judge skipped: provider call not implemented in v1 (see src/assertions.ts)"
      : "llm_judge skipped: no ANTHROPIC_API_KEY or OPENAI_API_KEY set",
  };
}

export function evaluateAssertion(
  task: Task,
  trajectory: Trajectory,
  assertion: Assertion,
): AssertionResult {
  switch (assertion.type) {
    case "url_contains": {
      const r = checkUrlContains(trajectory, assertion.value);
      return { type: assertion.type, passed: r.ok, message: r.message };
    }
    case "text_present": {
      const r = matchText(haystack(trajectory), assertion.value);
      return { type: assertion.type, passed: r.ok, message: r.message };
    }
    case "schema": {
      const r = checkSchema(trajectory, assertion.value);
      return { type: assertion.type, passed: r.ok, message: r.message };
    }
    case "no_error": {
      const r = checkNoError(trajectory);
      return { type: assertion.type, passed: r.ok, message: r.message };
    }
    case "llm_judge": {
      const r = checkLlmJudge();
      return { type: assertion.type, passed: true, skipped: true, message: r.message };
    }
  }
}

export function evaluateTask(task: Task, trajectory: Trajectory): {
  passed: boolean;
  results: AssertionResult[];
} {
  const results = task.assertions.map((a) => evaluateAssertion(task, trajectory, a));
  // Skipped assertions (llm_judge) do not fail a task.
  const passed = results.every((r) => r.passed);
  return { passed, results };
}
