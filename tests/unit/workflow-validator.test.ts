import { describe, it, expect } from "vitest";
import type { WorkflowTemplate } from "@/types/workflow";
import { validateWorkflow } from "@/services/workflow/validator";

function makeTemplate(
  overrides: Partial<WorkflowTemplate> = {},
): WorkflowTemplate {
  return {
    id: "wf-1",
    name: "Test Workflow",
    description: "Test",
    author: "agent-1",
    steps: [
      { id: "s1", type: "publish", name: "Publish offer", config: {} },
    ],
    tags: ["test"],
    version: 1,
    rating: { sum: 0, count: 0 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("Workflow Validator", () => {
  it("accepts valid workflow", () => {
    const result = validateWorkflow(makeTemplate());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects workflow without name", () => {
    const result = validateWorkflow(makeTemplate({ name: "" }));
    expect(result.valid).toBe(false);
  });

  it("rejects workflow without author", () => {
    const result = validateWorkflow(makeTemplate({ author: "" }));
    expect(result.valid).toBe(false);
  });

  it("rejects workflow with empty steps", () => {
    const result = validateWorkflow(makeTemplate({ steps: [] }));
    expect(result.valid).toBe(false);
  });

  it("rejects unknown step type", () => {
    const result = validateWorkflow(
      makeTemplate({
        steps: [
          { id: "s1", type: "unknown" as any, name: "Bad step", config: {} },
        ],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("unknown step type");
  });

  it("rejects step without id", () => {
    const result = validateWorkflow(
      makeTemplate({
        steps: [{ id: "", type: "publish", name: "No ID", config: {} }],
      }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects step without name", () => {
    const result = validateWorkflow(
      makeTemplate({
        steps: [{ id: "s1", type: "publish", name: "", config: {} }],
      }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects dangling dependency", () => {
    const result = validateWorkflow(
      makeTemplate({
        steps: [
          {
            id: "s1",
            type: "publish",
            name: "Publish",
            config: {},
            dependsOn: ["nonexistent"],
          },
        ],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("unknown step");
  });

  it("rejects negative timeout", () => {
    const result = validateWorkflow(
      makeTemplate({
        steps: [
          {
            id: "s1",
            type: "publish",
            name: "Publish",
            config: {},
            timeout: -1,
          },
        ],
      }),
    );
    expect(result.valid).toBe(false);
  });

  it("detects cycles", () => {
    const result = validateWorkflow(
      makeTemplate({
        steps: [
          {
            id: "s1",
            type: "publish",
            name: "A",
            config: {},
            dependsOn: ["s2"],
          },
          {
            id: "s2",
            type: "verify",
            name: "B",
            config: {},
            dependsOn: ["s1"],
          },
        ],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Cycle"))).toBe(true);
  });

  it("accepts valid dependencies", () => {
    const result = validateWorkflow(
      makeTemplate({
        steps: [
          { id: "s1", type: "publish", name: "Publish", config: {} },
          {
            id: "s2",
            type: "verify",
            name: "Verify",
            config: {},
            dependsOn: ["s1"],
          },
        ],
      }),
    );
    expect(result.valid).toBe(true);
  });

  it("warns for large step count", () => {
    const steps = Array.from({ length: 55 }, (_, i) => ({
      id: `s${i}`,
      type: "publish" as const,
      name: `Step ${i}`,
      config: {},
    }));
    const result = validateWorkflow(makeTemplate({ steps }));
    expect(result.warnings.some((w) => w.includes("55 steps"))).toBe(true);
  });
});
