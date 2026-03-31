import type { PolicyRule } from "./policy";

export type WorkflowStepType =
  | "publish"
  | "purchase"
  | "verify"
  | "transform"
  | "policy_check"
  | "bridge_sync";

export interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  name: string;
  config: Record<string, unknown>;
  dependsOn?: string[];
  timeout?: number;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  author: string;
  authorDid?: string;
  steps: WorkflowStep[];
  requiredPolicies?: PolicyRule[];
  tags: string[];
  version: number;
  forkedFrom?: string;
  rating: { sum: number; count: number };
  createdAt: number;
  updatedAt: number;
}

export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface StepResult {
  stepId: string;
  status: StepStatus;
  output?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: "running" | "completed" | "failed";
  stepResults: StepResult[];
  startedAt: number;
  completedAt?: number;
}

export const VALID_STEP_TYPES: readonly WorkflowStepType[] = [
  "publish",
  "purchase",
  "verify",
  "transform",
  "policy_check",
  "bridge_sync",
];
