import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock LLM engine for compilePolicyWithLLM tests
vi.mock("@/services/preference/llm-engine", () => ({
  generateCompletion: vi.fn(),
}));

const { compilePolicyWithLLM, compilePolicy, compilePolicyWithKeywords } =
  await import("@/services/policy/compiler");
const { generateCompletion } = await import("@/services/preference/llm-engine");
const mockGenerate = generateCompletion as ReturnType<typeof vi.fn>;

describe("Policy Compiler — LLM Path", () => {
  beforeEach(() => {
    mockGenerate.mockReset();
  });

  it("parses valid LLM JSON response", async () => {
    mockGenerate.mockResolvedValue(
      '[{"type":"vcl_threshold","params":{"minComposite":8}}]',
    );
    const rules = await compilePolicyWithLLM("VCL above 8");
    expect(rules).toHaveLength(1);
    expect(rules[0]!.type).toBe("vcl_threshold");
    expect(rules[0]!.params.minComposite).toBe(8);
  });

  it("handles LLM response with markdown code fences", async () => {
    mockGenerate.mockResolvedValue(
      '```json\n[{"type":"chain_restrict","params":{"allowedChains":["base"]}}]\n```',
    );
    const rules = await compilePolicyWithLLM("only Base");
    expect(rules).toHaveLength(1);
    expect(rules[0]!.type).toBe("chain_restrict");
  });

  it("filters out unknown rule types from LLM response", async () => {
    mockGenerate.mockResolvedValue(
      '[{"type":"vcl_threshold","params":{"minComposite":7}},{"type":"invalid_type","params":{}}]',
    );
    const rules = await compilePolicyWithLLM("test");
    expect(rules).toHaveLength(1);
    expect(rules[0]!.type).toBe("vcl_threshold");
  });

  it("filters out malformed items from LLM response", async () => {
    mockGenerate.mockResolvedValue(
      '[{"type":"vcl_threshold","params":{"minComposite":7}}, null, "string", 42, {"noType": true}]',
    );
    const rules = await compilePolicyWithLLM("test");
    expect(rules).toHaveLength(1);
  });

  it("throws when LLM returns no JSON array", async () => {
    mockGenerate.mockResolvedValue("I cannot parse that policy.");
    await expect(compilePolicyWithLLM("bad input")).rejects.toThrow(
      "did not contain a valid JSON array",
    );
  });

  it("throws when LLM returns invalid JSON", async () => {
    mockGenerate.mockResolvedValue("[{broken json}]");
    await expect(compilePolicyWithLLM("bad")).rejects.toThrow();
  });

  it("returns empty array when LLM returns valid JSON with no valid rules", async () => {
    mockGenerate.mockResolvedValue('[{"type":"unknown","params":{}}]');
    const rules = await compilePolicyWithLLM("test");
    expect(rules).toHaveLength(0);
  });

  it("escapes double quotes in input", async () => {
    mockGenerate.mockResolvedValue('[{"type":"vcl_threshold","params":{"minComposite":7}}]');
    await compilePolicyWithLLM('test "quoted" input');
    const prompt = mockGenerate.mock.calls[0]![0] as string;
    expect(prompt).toContain('test \\"quoted\\" input');
  });
});

describe("compilePolicy — Fallback Integration", () => {
  beforeEach(() => {
    mockGenerate.mockReset();
  });

  it("uses LLM result when available", async () => {
    mockGenerate.mockResolvedValue(
      '[{"type":"price_cap","params":{"maxUsdc":50}}]',
    );
    const rules = await compilePolicy("max price $50");
    expect(rules).toHaveLength(1);
    expect(rules[0]!.type).toBe("price_cap");
  });

  it("falls back to keywords when LLM throws", async () => {
    mockGenerate.mockRejectedValue(new Error("LLM unavailable"));
    const rules = await compilePolicy("VCL above 8");
    expect(rules).toHaveLength(1);
    expect(rules[0]!.type).toBe("vcl_threshold");
  });

  it("falls back to keywords when LLM returns empty rules", async () => {
    mockGenerate.mockResolvedValue('[{"type":"unknown","params":{}}]');
    const rules = await compilePolicy("only base");
    expect(rules).toHaveLength(1);
    expect(rules[0]!.type).toBe("chain_restrict");
  });

  it("returns empty when both LLM and keywords fail", async () => {
    mockGenerate.mockRejectedValue(new Error("LLM unavailable"));
    const rules = await compilePolicy("do something magical");
    expect(rules).toHaveLength(0);
  });
});
