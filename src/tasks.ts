// Loads and validates task definition YAML files.
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { assertSafeSlug } from "./validate.js";
import type { Assertion, Task } from "./types.js";

const VALID_TYPES = new Set([
  "url_contains",
  "text_present",
  "schema",
  "no_error",
  "llm_judge",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateAssertionValue(
  taskName: string,
  index: number,
  type: string,
  value: unknown,
): void {
  const where = `Task "${taskName}" assertion #${index} (${type})`;
  switch (type) {
    case "url_contains":
    case "text_present":
      if (typeof value !== "string" || !value) {
        throw new Error(`${where}: "value" must be a non-empty string`);
      }
      break;
    case "schema":
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`${where}: "value" must be a JSON Schema object`);
      }
      break;
    case "llm_judge":
      if (value !== undefined) {
        if (
          !isRecord(value) ||
          typeof value.prompt !== "string" ||
          !value.prompt
        ) {
          throw new Error(`${where}: "value" must look like { prompt: "..." }`);
        }
      }
      break;
    case "no_error":
      break; // value unused
  }
}

export function loadTasks(path: string): Task[] {
  const raw = readFileSync(path, "utf8");
  const doc = parse(raw) as unknown;

  if (!isRecord(doc) || !Array.isArray(doc.tasks)) {
    throw new Error(`Invalid task file ${path}: expected { version, tasks: [...] }`);
  }
  if (doc.version !== 1) {
    throw new Error(`Unsupported task file version in ${path}: ${String(doc.version)}`);
  }

  const seen = new Set<string>();
  return doc.tasks.map((t: unknown, i: number): Task => {
    if (!isRecord(t)) {
      throw new Error(`Task #${i} in ${path} is not an object`);
    }
    const { name, startUrl, goal, assertions } = t;
    if (typeof name !== "string" || !name) {
      throw new Error(`Task #${i} in ${path}: "name" must be a non-empty string`);
    }
    // Task names become file names (trajectory-<name>.json); reject anything
    // that could escape the runs directory.
    assertSafeSlug(name, "Task name");
    if (seen.has(name)) {
      throw new Error(`Task "${name}" in ${path}: duplicate task name`);
    }
    seen.add(name);
    if (typeof startUrl !== "string" || !startUrl) {
      throw new Error(`Task "${name}": "startUrl" must be a non-empty string`);
    }
    if (typeof goal !== "string" || !goal) {
      throw new Error(`Task "${name}": "goal" must be a non-empty string`);
    }
    if (!Array.isArray(assertions) || assertions.length === 0) {
      throw new Error(`Task "${name}": "assertions" must be a non-empty list`);
    }
    const parsed: Assertion[] = assertions.map((a: unknown, j: number): Assertion => {
      if (!isRecord(a) || typeof a.type !== "string") {
        throw new Error(`Task "${name}" assertion #${j}: needs a "type"`);
      }
      if (!VALID_TYPES.has(a.type)) {
        throw new Error(
          `Task "${name}" assertion #${j}: unknown type "${a.type}" ` +
            `(valid: ${[...VALID_TYPES].join(", ")})`,
        );
      }
      // Fail fast on misconfigured assertion values instead of at eval time.
      validateAssertionValue(name, j, a.type, a.value);
      return { type: a.type as Assertion["type"], value: a.value };
    });
    return { name, startUrl, goal, assertions: parsed };
  });
}
