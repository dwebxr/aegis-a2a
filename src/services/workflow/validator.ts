import type { WorkflowTemplate, WorkflowStep } from "@/types/workflow";
import { VALID_STEP_TYPES } from "@/types/workflow";

export interface WorkflowValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateStep(step: WorkflowStep, index: number): string[] {
  const errors: string[] = [];
  const prefix = `Step[${index}]`;

  if (!step.id || typeof step.id !== "string") {
    errors.push(`${prefix}: id is required`);
  }

  if (!VALID_STEP_TYPES.includes(step.type)) {
    errors.push(`${prefix}: unknown step type "${step.type}"`);
  }

  if (!step.name || typeof step.name !== "string") {
    errors.push(`${prefix}: name is required`);
  }

  if (step.timeout !== undefined && (typeof step.timeout !== "number" || step.timeout <= 0)) {
    errors.push(`${prefix}: timeout must be a positive number`);
  }

  return errors;
}

function detectCycles(steps: WorkflowStep[]): string[] {
  const errors: string[] = [];
  const graph = new Map<string, string[]>();
  for (const step of steps) {
    graph.set(step.id, step.dependsOn || []);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    if (inStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    inStack.add(nodeId);

    for (const dep of graph.get(nodeId) || []) {
      if (dfs(dep)) {
        errors.push(`Cycle detected involving step "${nodeId}" -> "${dep}"`);
        return true;
      }
    }

    inStack.delete(nodeId);
    return false;
  }

  for (const step of steps) {
    dfs(step.id);
  }

  return errors;
}

export function validateWorkflow(template: WorkflowTemplate): WorkflowValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!template.id) errors.push("Workflow id is required");
  if (!template.name) errors.push("Workflow name is required");
  if (!template.author) errors.push("Workflow author is required");

  if (!Array.isArray(template.steps) || template.steps.length === 0) {
    errors.push("Workflow must have at least one step");
    return { valid: false, errors, warnings };
  }

  if (template.steps.length > 50) {
    warnings.push(`Workflow has ${template.steps.length} steps — consider simplifying`);
  }

  const allIds = new Set<string>();
  for (const step of template.steps) {
    allIds.add(step.id);
  }

  // Check for duplicates
  const seenIds = new Set<string>();
  for (let i = 0; i < template.steps.length; i++) {
    const step = template.steps[i]!;
    if (step.id && seenIds.has(step.id)) {
      errors.push(`Step[${i}]: duplicate id "${step.id}"`);
    }
    seenIds.add(step.id);
    errors.push(...validateStep(step, i));
  }

  // Check for dangling dependencies
  for (const step of template.steps) {
    if (step.dependsOn) {
      for (const depId of step.dependsOn) {
        if (!allIds.has(depId)) {
          errors.push(`Step "${step.id}" depends on unknown step "${depId}"`);
        }
      }
    }
  }

  if (errors.length === 0) {
    errors.push(...detectCycles(template.steps));
  }

  return { valid: errors.length === 0, errors, warnings };
}
