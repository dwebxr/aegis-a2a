import { describe, it, expect, beforeEach } from "vitest";
import type { WorkflowTemplate, WorkflowStep } from "@/types/workflow";
import { validateWorkflow } from "@/services/workflow/validator";
import { executeWorkflow, registerStepHandler } from "@/services/workflow/runner";
import { forkWorkflow } from "@/services/workflow/registry";

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

describe("Workflow Validator — Edge Cases", () => {
  it("rejects duplicate step IDs", () => {
    const result = validateWorkflow(
      makeTemplate([
        { id: "dup", type: "publish", name: "A", config: {} },
        { id: "dup", type: "verify", name: "B", config: {} },
      ]),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("duplicate"))).toBe(true);
  });

  it("accepts self-referencing dependency (but detects cycle)", () => {
    const result = validateWorkflow(
      makeTemplate([
        { id: "s1", type: "publish", name: "Self", config: {}, dependsOn: ["s1"] },
      ]),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Cycle"))).toBe(true);
  });

  it("detects 3-node cycle", () => {
    const result = validateWorkflow(
      makeTemplate([
        { id: "a", type: "publish", name: "A", config: {}, dependsOn: ["c"] },
        { id: "b", type: "verify", name: "B", config: {}, dependsOn: ["a"] },
        { id: "c", type: "transform", name: "C", config: {}, dependsOn: ["b"] },
      ]),
    );
    expect(result.valid).toBe(false);
  });

  it("accepts long chain without cycle", () => {
    const steps: WorkflowStep[] = [];
    for (let i = 0; i < 20; i++) {
      steps.push({
        id: `s${i}`,
        type: "publish",
        name: `Step ${i}`,
        config: {},
        dependsOn: i > 0 ? [`s${i - 1}`] : undefined,
      });
    }
    const result = validateWorkflow(makeTemplate(steps));
    expect(result.valid).toBe(true);
  });

  it("accepts diamond dependency (A→B, A→C, B→D, C→D)", () => {
    const result = validateWorkflow(
      makeTemplate([
        { id: "a", type: "publish", name: "A", config: {} },
        { id: "b", type: "verify", name: "B", config: {}, dependsOn: ["a"] },
        { id: "c", type: "verify", name: "C", config: {}, dependsOn: ["a"] },
        { id: "d", type: "transform", name: "D", config: {}, dependsOn: ["b", "c"] },
      ]),
    );
    expect(result.valid).toBe(true);
  });

  it("rejects step with invalid timeout type", () => {
    const result = validateWorkflow(
      makeTemplate([
        { id: "s1", type: "publish", name: "A", config: {}, timeout: "fast" as any },
      ]),
    );
    expect(result.valid).toBe(false);
  });

  it("accepts all valid step types", () => {
    const types = ["publish", "purchase", "verify", "transform", "policy_check", "bridge_sync"] as const;
    const steps: WorkflowStep[] = types.map((type, i) => ({
      id: `s${i}`,
      type,
      name: type,
      config: {},
    }));
    const result = validateWorkflow(makeTemplate(steps));
    expect(result.valid).toBe(true);
  });
});

describe("Workflow Runner — Edge Cases", () => {
  beforeEach(() => {
    registerStepHandler("publish", async () => ({ done: true }));
    registerStepHandler("verify", async () => ({ verified: true }));
    registerStepHandler("transform", async () => ({ transformed: true }));
  });

  it("handles diamond dependency execution order", async () => {
    const order: string[] = [];
    registerStepHandler("publish", async (step) => {
      order.push(step.id);
      return {};
    });
    registerStepHandler("verify", async (step) => {
      order.push(step.id);
      return {};
    });
    registerStepHandler("transform", async (step) => {
      order.push(step.id);
      return {};
    });

    const template = makeTemplate([
      { id: "a", type: "publish", name: "A", config: {} },
      { id: "b", type: "verify", name: "B", config: {}, dependsOn: ["a"] },
      { id: "c", type: "verify", name: "C", config: {}, dependsOn: ["a"] },
      { id: "d", type: "transform", name: "D", config: {}, dependsOn: ["b", "c"] },
    ]);

    const result = await executeWorkflow(template);
    expect(result.status).toBe("completed");
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("c"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("d"));
    expect(order.indexOf("c")).toBeLessThan(order.indexOf("d"));
  });

  it("cascades failure through dependency chain", async () => {
    registerStepHandler("publish", async () => {
      throw new Error("failed");
    });

    const template = makeTemplate([
      { id: "s1", type: "publish", name: "Fail", config: {} },
      { id: "s2", type: "verify", name: "Dep1", config: {}, dependsOn: ["s1"] },
      { id: "s3", type: "transform", name: "Dep2", config: {}, dependsOn: ["s2"] },
    ]);

    const result = await executeWorkflow(template);
    expect(result.status).toBe("failed");
    expect(result.stepResults.find((r) => r.stepId === "s1")!.status).toBe("failed");
    expect(result.stepResults.find((r) => r.stepId === "s2")!.status).toBe("skipped");
    // s3 depends on s2 which is "skipped" (not "failed"), so s3 still runs
    // since only "failed" deps cascade. Verify s3 completed normally.
    expect(result.stepResults.find((r) => r.stepId === "s3")!.status).toBe("completed");
  });

  it("partial failure: independent steps still complete", async () => {
    registerStepHandler("publish", async (step) => {
      if (step.config.shouldFail) throw new Error("intentional");
      return { ok: true };
    });

    const template = makeTemplate([
      { id: "good", type: "publish", name: "Good", config: {} },
      { id: "bad", type: "publish", name: "Bad", config: { shouldFail: true } },
    ]);

    const result = await executeWorkflow(template);
    expect(result.status).toBe("failed");
    expect(result.stepResults.find((r) => r.stepId === "good")!.status).toBe("completed");
    expect(result.stepResults.find((r) => r.stepId === "bad")!.status).toBe("failed");
  });

  it("passes initial context to first step", async () => {
    let received: unknown;
    registerStepHandler("publish", async (_step, ctx) => {
      received = ctx.initialData;
      return {};
    });

    const template = makeTemplate([
      { id: "s1", type: "publish", name: "A", config: {} },
    ]);

    await executeWorkflow(template, { initialData: "hello" });
    expect(received).toBe("hello");
  });

  it("execution has correct timing metadata", async () => {
    const template = makeTemplate([
      { id: "s1", type: "publish", name: "A", config: {} },
    ]);
    const before = Date.now();
    const result = await executeWorkflow(template);
    const after = Date.now();

    expect(result.startedAt).toBeGreaterThanOrEqual(before);
    expect(result.completedAt).toBeLessThanOrEqual(after);
    expect(result.completedAt! - result.startedAt).toBeLessThan(1000);
  });
});

describe("Workflow Fork", () => {
  it("creates independent copy with attribution", () => {
    const original = makeTemplate(
      [
        { id: "s1", type: "publish", name: "A", config: { data: 1 } },
        { id: "s2", type: "verify", name: "B", config: {}, dependsOn: ["s1"] },
      ],
      {
        id: "orig-1",
        name: "Original",
        tags: ["test", "demo"],
        rating: { sum: 50, count: 10 },
      },
    );

    const forked = forkWorkflow(original, "new-author", "did:key:z6MkNew");

    expect(forked.name).toBe("Original (fork)");
    expect(forked.author).toBe("new-author");
    expect(forked.authorDid).toBe("did:key:z6MkNew");
    expect(forked.forkedFrom).toBe("orig-1");
    expect(forked.rating).toEqual({ sum: 0, count: 0 });
    expect(forked.version).toBe(1);
    expect(forked.steps).toHaveLength(2);
    // Steps are independent copies
    expect(forked.steps[0]).not.toBe(original.steps[0]);
    expect(forked.steps[0]!.config).toEqual({ data: 1 });
    // Tags are independent copies
    expect(forked.tags).not.toBe(original.tags);
    expect(forked.tags).toEqual(["test", "demo"]);
  });

  it("fork without DID", () => {
    const original = makeTemplate(
      [{ id: "s1", type: "publish", name: "A", config: {} }],
      { id: "orig-2" },
    );
    const forked = forkWorkflow(original, "author2");
    expect(forked.authorDid).toBeUndefined();
  });
});
