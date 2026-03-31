import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChainType } from "@/types/offer";

let canisterOffers: any[] = [];

const mockActor = {
  put_offer: vi.fn().mockImplementation(async (offer: any) => {
    const idx = canisterOffers.findIndex((o) => o.id === offer.id);
    if (idx >= 0) canisterOffers[idx] = offer;
    else canisterOffers.push(offer);
  }),
  get_offer: vi.fn().mockImplementation(async (id: string) => {
    const o = canisterOffers.find((o: any) => o.id === id);
    return o ? [o] : [];
  }),
  get_offers: vi.fn().mockImplementation(async () => [...canisterOffers]),
  delete_offer: vi.fn().mockImplementation(async (id: string) => {
    const idx = canisterOffers.findIndex((o: any) => o.id === id);
    if (idx >= 0) { canisterOffers.splice(idx, 1); return true; }
    return false;
  }),
  submit_receipt: vi.fn(),
  get_receipt: vi.fn().mockResolvedValue([]),
  verify_payment_manual: vi.fn().mockResolvedValue(true),
  get_a2a_stats: vi.fn().mockResolvedValue({ offerCount: BigInt(0), receiptCount: BigInt(0) }),
};

vi.mock("@/lib/ic/actor", () => ({
  getBackendActor: () => mockActor,
}));

const { publishWorkflow, listWorkflows, getWorkflow, forkWorkflow } =
  await import("@/services/workflow/registry");

beforeEach(() => {
  canisterOffers = [];
});

describe("Workflow Registry — Integration", () => {
  it("publishes a workflow and retrieves it", async () => {
    const template = await publishWorkflow({
      name: "Test Flow",
      description: "A test workflow",
      author: "agent-1",
      steps: [{ id: "s1", type: "publish", name: "Publish", config: {} }],
      tags: ["test"],
      version: 1,
      rating: { sum: 0, count: 0 },
    });

    expect(template.id).toBeDefined();
    expect(template.name).toBe("Test Flow");
    expect(template.createdAt).toBeGreaterThan(0);

    // Verify it was stored in the canister
    expect(canisterOffers).toHaveLength(1);
    expect(canisterOffers[0].title).toContain("[workflow]");
  });

  it("lists only workflow offers, not regular offers", async () => {
    // Add a regular offer
    canisterOffers.push({
      id: "regular-1",
      publisher: "agent-1",
      title: "Regular Offer",
      description: JSON.stringify({ description: "not a workflow" }),
      priceUSDC: BigInt(0),
      chain: "base",
      vclScore: 0,
      contentHash: "h1",
      createdAt: BigInt(Date.now()),
    });

    // Publish a workflow
    await publishWorkflow({
      name: "Workflow A",
      description: "desc",
      author: "agent-1",
      steps: [{ id: "s1", type: "publish", name: "P", config: {} }],
      tags: [],
      version: 1,
      rating: { sum: 0, count: 0 },
    });

    const workflows = await listWorkflows();
    expect(workflows).toHaveLength(1);
    expect(workflows[0]!.name).toBe("Workflow A");
  });

  it("returns empty list when no workflows exist", async () => {
    const workflows = await listWorkflows();
    expect(workflows).toHaveLength(0);
  });

  it("getWorkflow returns null for non-existent workflow", async () => {
    const wf = await getWorkflow("nonexistent");
    expect(wf).toBeNull();
  });

  it("getWorkflow retrieves by workflow ID", async () => {
    const published = await publishWorkflow({
      name: "Find Me",
      description: "",
      author: "agent-1",
      steps: [{ id: "s1", type: "verify", name: "V", config: {} }],
      tags: ["findable"],
      version: 1,
      rating: { sum: 0, count: 0 },
    });

    const found = await getWorkflow(published.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Find Me");
    expect(found!.steps).toHaveLength(1);
  });

  it("handles multiple workflows", async () => {
    for (let i = 0; i < 5; i++) {
      await publishWorkflow({
        name: `Workflow ${i}`,
        description: "",
        author: "agent-1",
        steps: [{ id: "s1", type: "publish", name: "P", config: {} }],
        tags: [`tag-${i}`],
        version: 1,
        rating: { sum: 0, count: 0 },
      });
    }

    const workflows = await listWorkflows();
    expect(workflows).toHaveLength(5);
  });

  it("fork creates an independent publishable copy", () => {
    const original = {
      id: "orig-1",
      name: "Original",
      description: "Original desc",
      author: "author-1",
      steps: [
        { id: "s1", type: "publish" as const, name: "Pub", config: { key: "val" } },
      ],
      tags: ["a", "b"],
      version: 3,
      rating: { sum: 100, count: 20 },
      createdAt: 1000,
      updatedAt: 2000,
    };

    const forked = forkWorkflow(original, "new-author", "did:key:z6MkNew");

    expect(forked.forkedFrom).toBe("orig-1");
    expect(forked.author).toBe("new-author");
    expect(forked.authorDid).toBe("did:key:z6MkNew");
    expect(forked.rating).toEqual({ sum: 0, count: 0 });
    expect(forked.version).toBe(1);

    // Verify deep independence
    forked.steps[0]!.config.key = "modified";
    expect(original.steps[0]!.config.key).toBe("val");

    forked.tags.push("c");
    expect(original.tags).toEqual(["a", "b"]);
  });

  it("workflow with requiredPolicies is preserved", async () => {
    const published = await publishWorkflow({
      name: "Policy Workflow",
      description: "",
      author: "agent-1",
      steps: [{ id: "s1", type: "policy_check", name: "Check", config: {} }],
      tags: [],
      version: 1,
      rating: { sum: 0, count: 0 },
      requiredPolicies: [
        { type: "vcl_threshold", params: { minComposite: 8 } },
      ],
    });

    const found = await getWorkflow(published.id);
    expect(found!.requiredPolicies).toHaveLength(1);
    expect(found!.requiredPolicies![0]!.type).toBe("vcl_threshold");
  });

  it("handles workflow with corrupt encryptedContent gracefully", async () => {
    canisterOffers.push({
      id: "corrupt-1",
      publisher: "agent-1",
      title: "[workflow] Corrupt",
      description: "{}",
      priceUSDC: BigInt(0),
      chain: "base",
      vclScore: 0,
      contentHash: "wf-corrupt",
      createdAt: BigInt(Date.now()),
    });

    // No encryptedContent field → extractWorkflowFromOffer returns null
    const workflows = await listWorkflows();
    expect(workflows).toHaveLength(0);
  });
});
