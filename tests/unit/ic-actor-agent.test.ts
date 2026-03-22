import { describe, it, expect, vi, beforeEach } from "vitest";

describe("agent.ts", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("CANISTER_ID defaults to the Aegis mainnet canister", async () => {
    const saved = process.env.AEGIS_CANISTER_ID;
    delete process.env.AEGIS_CANISTER_ID;

    const { CANISTER_ID } = await import("@/lib/ic/agent");
    expect(CANISTER_ID).toBe("rluf3-eiaaa-aaaam-qgjuq-cai");

    if (saved) process.env.AEGIS_CANISTER_ID = saved;
  });

  it("CANISTER_ID uses AEGIS_CANISTER_ID env var", async () => {
    process.env.AEGIS_CANISTER_ID = "custom-canister-id";

    const { CANISTER_ID } = await import("@/lib/ic/agent");
    expect(CANISTER_ID).toBe("custom-canister-id");

    delete process.env.AEGIS_CANISTER_ID;
  });

  it("createAgent returns an HttpAgent", async () => {
    const { createAgent } = await import("@/lib/ic/agent");
    const agent = createAgent();
    expect(agent).toBeDefined();
    expect(typeof agent.getPrincipal).toBe("function");
  });
});

describe("actor.ts", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("getBackendActor returns a typed actor with canister methods", async () => {
    const { getBackendActor } = await import("@/lib/ic/actor");
    const actor = getBackendActor();
    expect(typeof actor.put_offer).toBe("function");
    expect(typeof actor.get_offers).toBe("function");
    expect(typeof actor.submit_receipt).toBe("function");
    expect(typeof actor.get_receipt).toBe("function");
  });

  it("getBackendActor returns the same cached instance", async () => {
    const { getBackendActor } = await import("@/lib/ic/actor");
    expect(getBackendActor()).toBe(getBackendActor());
  });
});
