import { describe, it, expect, beforeEach } from "vitest";
import type { WorkflowTemplate, WorkflowStep } from "@/types/workflow";
import {
  executeWorkflow,
  registerStepHandler,
} from "@/services/workflow/runner";

function makeTemplate(
  steps: WorkflowStep[],
  overrides: Partial<WorkflowTemplate> = {},
): WorkflowTemplate {
  return {
    id: "wf-1",
    name: "Test",
    description: "",
    author: "test",
    steps,
    tags: [],
    version: 1,
    rating: { sum: 0, count: 0 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("Workflow Runner", () => {
  beforeEach(() => {
    // Register test handlers
    registerStepHandler("publish", async (step) => {
      return { published: true, data: step.config.data };
    });
    registerStepHandler("verify", async (step, ctx) => {
      return { verified: true, input: ctx };
    });
    registerStepHandler("transform", async (step) => {
      return { transformed: step.config.input };
    });
  });

  it("executes a single-step workflow", async () => {
    const template = makeTemplate([
      { id: "s1", type: "publish", name: "Publish", config: { data: "test" } },
    ]);

    const result = await executeWorkflow(template);
    expect(result.status).toBe("completed");
    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0]!.status).toBe("completed");
    expect((result.stepResults[0]!.output as any).published).toBe(true);
  });

  it("executes steps with dependencies in order", async () => {
    const order: string[] = [];
    registerStepHandler("publish", async (step) => {
      order.push(step.id);
      return { done: true };
    });
    registerStepHandler("verify", async (step) => {
      order.push(step.id);
      return { done: true };
    });

    const template = makeTemplate([
      { id: "s1", type: "publish", name: "First", config: {} },
      {
        id: "s2",
        type: "verify",
        name: "Second",
        config: {},
        dependsOn: ["s1"],
      },
    ]);

    const result = await executeWorkflow(template);
    expect(result.status).toBe("completed");
    expect(order).toEqual(["s1", "s2"]);
  });

  it("executes independent steps concurrently", async () => {
    const template = makeTemplate([
      { id: "s1", type: "publish", name: "A", config: {} },
      { id: "s2", type: "publish", name: "B", config: {} },
    ]);

    const result = await executeWorkflow(template);
    expect(result.status).toBe("completed");
    expect(result.stepResults).toHaveLength(2);
    expect(result.stepResults.every((r) => r.status === "completed")).toBe(
      true,
    );
  });

  it("skips dependent steps when dependency fails", async () => {
    registerStepHandler("publish", async () => {
      throw new Error("publish failed");
    });

    const template = makeTemplate([
      { id: "s1", type: "publish", name: "Failing", config: {} },
      {
        id: "s2",
        type: "verify",
        name: "Dependent",
        config: {},
        dependsOn: ["s1"],
      },
    ]);

    const result = await executeWorkflow(template);
    expect(result.status).toBe("failed");
    expect(result.stepResults[0]!.status).toBe("failed");
    // s2 should be skipped
    const s2 = result.stepResults.find((r) => r.stepId === "s2");
    expect(s2!.status).toBe("skipped");
  });

  it("fails step with no registered handler", async () => {
    const template = makeTemplate([
      { id: "s1", type: "bridge_sync", name: "No handler", config: {} },
    ]);

    const result = await executeWorkflow(template);
    expect(result.status).toBe("failed");
    expect(result.stepResults[0]!.error).toContain("No handler");
  });

  it("times out slow steps", async () => {
    registerStepHandler("publish", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return { done: true };
    });

    const template = makeTemplate([
      {
        id: "s1",
        type: "publish",
        name: "Slow",
        config: {},
        timeout: 50, // 50ms timeout
      },
    ]);

    const result = await executeWorkflow(template);
    expect(result.status).toBe("failed");
    expect(result.stepResults[0]!.error).toContain("timed out");
  });

  it("passes context between steps", async () => {
    registerStepHandler("publish", async () => {
      return { value: 42 };
    });
    registerStepHandler("verify", async (_step, ctx) => {
      return { received: (ctx.step_s1 as any)?.value };
    });

    const template = makeTemplate([
      { id: "s1", type: "publish", name: "Produce", config: {} },
      {
        id: "s2",
        type: "verify",
        name: "Consume",
        config: {},
        dependsOn: ["s1"],
      },
    ]);

    const result = await executeWorkflow(template);
    expect(result.status).toBe("completed");
    const s2Output = result.stepResults.find((r) => r.stepId === "s2")!.output as any;
    expect(s2Output.received).toBe(42);
  });

  it("records timing information", async () => {
    registerStepHandler("publish", async () => ({ done: true }));

    const template = makeTemplate([
      { id: "s1", type: "publish", name: "Timed", config: {} },
    ]);

    const result = await executeWorkflow(template);
    const step = result.stepResults[0]!;
    expect(step.startedAt).toBeGreaterThan(0);
    expect(step.completedAt).toBeGreaterThanOrEqual(step.startedAt!);
    expect(result.startedAt).toBeGreaterThan(0);
    expect(result.completedAt).toBeGreaterThanOrEqual(result.startedAt);
  });
});
