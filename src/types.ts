// Core types for the browser-agent eval harness.

export type AssertionType =
  | "url_contains"
  | "text_present"
  | "schema"
  | "no_error"
  | "llm_judge";

export interface Assertion {
  type: AssertionType;
  /** Meaning depends on type:
   *  - url_contains: substring that must appear in a visited URL
   *  - text_present: substring or /regex/ that must appear in page text/extracted data
   *  - schema: a JSON Schema object validated against extractedData
   *  - no_error: value unused
   *  - llm_judge: { prompt: string } — graded by an LLM (skipped without a key)
   */
  value?: unknown;
}

export interface Task {
  name: string;
  startUrl: string;
  goal: string;
  assertions: Assertion[];
}

export interface TaskFile {
  version: number;
  tasks: Task[];
}

export type StepAction = "goto" | "act" | "observe" | "extract" | "scroll" | "wait";

export interface TrajectoryStep {
  seq: number;
  action: StepAction;
  /** Human-readable description of what the agent did. */
  detail: string;
  /** CSS selector, target description, or element reference. */
  target?: string;
  /** Page URL after the step. */
  url: string;
  /** Milliseconds since run start. */
  timestampMs: number;
  /** Tokens used by this step (LLM-backed steps). */
  tokens?: number;
  /** Wall-clock time this step took. */
  latencyMs?: number;
  /** Set when the step failed. */
  error?: string;
}

export interface Trajectory {
  taskName: string;
  label: string;
  model: string;
  agent: string;
  startedAt: string;
  steps: TrajectoryStep[];
  /** Structured data the agent extracted (validated by `schema` assertions). */
  extractedData: unknown;
  /** Trajectory-level error (e.g. agent crashed). */
  error?: string;
}

export interface AssertionResult {
  type: AssertionType;
  passed: boolean;
  skipped?: boolean;
  message: string;
}

export interface TaskResult {
  name: string;
  passed: boolean;
  assertions: AssertionResult[];
  steps: number;
  tokens: number;
  latencyMs: number;
}

export interface RunSummary {
  label: string;
  agent: string;
  model: string;
  startedAt: string;
  tasks: TaskResult[];
  totals: {
    tasks: number;
    passed: number;
    failed: number;
    tokens: number;
    latencyMs: number;
  };
}

export interface SequenceChange {
  task: string;
  base: string[];
  candidate: string[];
}

export interface CostDelta {
  task: string;
  tokensBase: number;
  tokensCandidate: number;
  tokensDelta: number;
  latencyBaseMs: number;
  latencyCandidateMs: number;
  latencyDeltaMs: number;
}

export interface DiffResult {
  base: string;
  candidate: string;
  newFailures: string[];
  fixed: string[];
  changedSequences: SequenceChange[];
  costDeltas: CostDelta[];
  totalsDelta: {
    tokens: number;
    latencyMs: number;
  };
}
