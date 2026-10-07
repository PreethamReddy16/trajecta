// Shared input validation: trajectory shapes and filename-safe slugs.
//
// Task names and run labels end up as file names (trajectory-<name>.json,
// runs/<label>/). A name like "../../etc" would escape those directories,
// so every name/label is checked against a strict slug pattern before use.

import type { Trajectory } from "./types.js";

/** Minimal shape check for a recorded trajectory. */
export function isTrajectory(v: unknown): v is Trajectory {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.taskName === "string" &&
    Array.isArray(t.steps) &&
    "extractedData" in t
  );
}

const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Throws unless `value` is a filename-safe slug. Task names, run labels,
 * and diff labels all go through this so a crafted YAML can never cause
 * path traversal (e.g. name: "../../x" writing outside runs/).
 */
export function assertSafeSlug(value: string, what: string): void {
  if (!SLUG.test(value)) {
    throw new Error(
      `${what} "${value}" is not allowed: use letters, digits, dot, dash, ` +
        `underscore (must start with a letter or digit)`,
    );
  }
}
