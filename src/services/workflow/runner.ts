import type {
  WorkflowTemplate,
  WorkflowStep,
  WorkflowExecution,
  StepResult,
} from "@/types/workflow";
import { generateId } from "@/lib/utils";
import { log } from "@/lib/logger";

const DEFAULT_TIMEOUT_MS = 30_000;

export type StepHandler = (
  step: WorkflowStep,
  context: Record<string, unknown>,
) => Promise<unknown>;

// Registry of step handlers. Consumers register handlers before running.
const handlers = new Map<string, StepHandler>();

export function registerStepHandler(
  stepType: string,
  handler: StepHandler,
): void {
  handlers.set(stepType, handler);
}

// Executes steps in topological order, skipping dependents of failed steps
export async function executeWorkflow(
  template: WorkflowTemplate,
  context: Record<string, unknown> = {},
): Promise<WorkflowExecution> {
  const execution: WorkflowExecution = {
    id: generateId(),
    workflowId: template.id,
    status: "running",
    stepResults: [],
    startedAt: Date.now(),
  };

  const completedSteps = new Set<string>();
  const stepResults = new Map<string, StepResult>();

  // Topological execution: run steps whose dependencies are all complete
  const pending = new Set(template.steps.map((s) => s.id));
  const stepMap = new Map(template.steps.map((s) => [s.id, s]));

  while (pending.size > 0) {
    const readySteps: WorkflowStep[] = [];

    for (const stepId of Array.from(pending)) {
      const step = stepMap.get(stepId)!;
      const deps = step.dependsOn || [];
      const allDepsComplete = deps.every((d) => completedSteps.has(d));
      const anyDepFailed = deps.some((d) => stepResults.get(d)?.status === "failed");

      if (anyDepFailed) {
        // Skip this step if any dependency failed
        const result: StepResult = {
          stepId,
          status: "skipped",
          error: "Dependency failed",
        };
        stepResults.set(stepId, result);
        completedSteps.add(stepId);
        pending.delete(stepId);
        continue;
      }

      if (allDepsComplete) {
        readySteps.push(step);
      }
    }

    if (readySteps.length === 0 && pending.size > 0) {
      // Deadlock: remaining steps have unresolvable dependencies
      for (const stepId of Array.from(pending)) {
        stepResults.set(stepId, {
          stepId,
          status: "failed",
          error: "Deadlock: unresolvable dependencies",
        });
      }
      break;
    }

    // Execute ready steps concurrently
    const results = await Promise.allSettled(
      readySteps.map((step) => executeStep(step, context)),
    );

    for (let i = 0; i < readySteps.length; i++) {
      const step = readySteps[i]!;
      const settled = results[i]!;

      let result: StepResult;
      if (settled.status === "fulfilled") {
        result = settled.value;
        // Add step output to context for downstream steps
        context[`step_${step.id}`] = result.output;
      } else {
        result = {
          stepId: step.id,
          status: "failed",
          error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
          startedAt: Date.now(),
          completedAt: Date.now(),
        };
      }

      stepResults.set(step.id, result);
      completedSteps.add(step.id);
      pending.delete(step.id);
    }
  }

  execution.stepResults = Array.from(stepResults.values());
  execution.completedAt = Date.now();
  execution.status = execution.stepResults.some((r) => r.status === "failed")
    ? "failed"
    : "completed";

  log.info("Workflow execution completed", {
    workflowId: template.id,
    executionId: execution.id,
    status: execution.status,
    steps: execution.stepResults.length,
  });

  return execution;
}

async function executeStep(
  step: WorkflowStep,
  context: Record<string, unknown>,
): Promise<StepResult> {
  const startedAt = Date.now();
  const timeout = step.timeout || DEFAULT_TIMEOUT_MS;

  const handler = handlers.get(step.type);
  if (!handler) {
    return {
      stepId: step.id,
      status: "failed",
      error: `No handler registered for step type "${step.type}"`,
      startedAt,
      completedAt: Date.now(),
    };
  }

  try {
    const output = await Promise.race([
      handler(step, context),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Step timed out after ${timeout}ms`)), timeout),
      ),
    ]);

    return {
      stepId: step.id,
      status: "completed",
      output,
      startedAt,
      completedAt: Date.now(),
    };
  } catch (err) {
    return {
      stepId: step.id,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      startedAt,
      completedAt: Date.now(),
    };
  }
}
