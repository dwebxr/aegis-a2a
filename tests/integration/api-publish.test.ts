import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/agent/publish/route";
import { NextRequest } from "next/server";
import { getOffer, removeOffer, _resetForTesting } from "@/services/content/store";

vi.mock("fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue("[]"),
  writeFileSync: vi.fn(),
}));

const createdIds: string[] = [];

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/agent/publish", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  _resetForTesting();
  createdIds.length = 0;
});

describe("POST /api/agent/publish", () => {
  const validBody = {
    agentId: "agent-1",
    title: "Market Analysis",
    description: "Deep dive into DeFi trends",
    priceUsdc: 5,
    content: "This is the premium content",
  };

  it("creates an offer and returns 201 with offerId", async () => {
    const res = await POST(makeRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.offerId).toBeDefined();
    expect(typeof data.offerId).toBe("string");
    createdIds.push(data.offerId);

    // Verify the offer was actually stored
    const offer = getOffer(data.offerId);
    expect(offer).toBeDefined();
    expect(offer!.title).toBe("Market Analysis");
    expect(offer!.priceUsdc).toBe(5);
    expect(offer!.encryptedContent).toBe("This is the premium content");
  });

  it("assigns all chains by default if supportedChains not provided", async () => {
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    createdIds.push(data.offerId);

    const offer = getOffer(data.offerId);
    expect(offer!.supportedChains).toEqual(["base", "solana", "icp"]);
  });

  it("accepts custom supportedChains", async () => {
    const res = await POST(makeRequest({ ...validBody, supportedChains: ["base", "icp"] }));
    const data = await res.json();
    createdIds.push(data.offerId);

    const offer = getOffer(data.offerId);
    expect(offer!.supportedChains).toEqual(["base", "icp"]);
  });

  it("filters out invalid chains from supportedChains", async () => {
    const res = await POST(
      makeRequest({ ...validBody, supportedChains: ["base", "polygon", "icp"] })
    );
    const data = await res.json();
    createdIds.push(data.offerId);

    const offer = getOffer(data.offerId);
    expect(offer!.supportedChains).toEqual(["base", "icp"]);
  });

  it("returns 400 when all supportedChains are invalid", async () => {
    const res = await POST(
      makeRequest({ ...validBody, supportedChains: ["polygon", "ethereum"] })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("valid chain");
  });

  it("allows priceUsdc = 0 for free offers", async () => {
    const res = await POST(makeRequest({ ...validBody, priceUsdc: 0 }));
    const data = await res.json();
    expect(res.status).toBe(201);
    createdIds.push(data.offerId);

    const offer = getOffer(data.offerId);
    expect(offer!.priceUsdc).toBe(0);
  });

  describe("validation errors (400)", () => {
    it("rejects missing agentId", async () => {
      const { agentId, ...body } = validBody;
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
    });

    it("rejects missing title", async () => {
      const { title, ...body } = validBody;
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
    });

    it("rejects missing description", async () => {
      const { description, ...body } = validBody;
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
    });

    it("rejects missing content", async () => {
      const { content, ...body } = validBody;
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
    });

    it("rejects negative priceUsdc", async () => {
      const res = await POST(makeRequest({ ...validBody, priceUsdc: -5 }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("non-negative");
    });

    it("rejects non-number priceUsdc", async () => {
      const res = await POST(makeRequest({ ...validBody, priceUsdc: "five" }));
      expect(res.status).toBe(400);
    });

    it("rejects empty body", async () => {
      const res = await POST(makeRequest({}));
      expect(res.status).toBe(400);
    });
  });

  it("includes contentHash when provided", async () => {
    const res = await POST(
      makeRequest({ ...validBody, contentHash: "sha256-abc123" })
    );
    const data = await res.json();
    createdIds.push(data.offerId);

    const offer = getOffer(data.offerId);
    expect(offer!.contentHash).toBe("sha256-abc123");
  });
});
