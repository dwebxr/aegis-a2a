import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadBridgeConfig } from "@/lib/bridge-config";

describe("loadBridgeConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all bridge-related env vars
    delete process.env.AEGIS_BRIDGE_ENABLED;
    delete process.env.AEGIS_HONTAL_URL;
    delete process.env.AEGIS_SYNC_INTERVAL_MS;
    delete process.env.AEGIS_AGENT_ID;
    delete process.env.AEGIS_DEFAULT_CHAINS;
    delete process.env.AEGIS_PRICE_TIER_MAP;
    delete process.env.AEGIS_MIN_COMPOSITE_SCORE;
    delete process.env.AEGIS_BRIDGE_QUALITY_ONLY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns disabled config by default", () => {
    const config = loadBridgeConfig();
    expect(config.enabled).toBe(false);
    expect(config.aegisUrl).toBe("");
    expect(config.agentId).toBe("aegis-hontal");
    expect(config.qualityOnly).toBe(true);
    expect(config.minCompositeScore).toBe(7.0);
  });

  it("enables bridge when AEGIS_BRIDGE_ENABLED=true", () => {
    process.env.AEGIS_BRIDGE_ENABLED = "true";
    process.env.AEGIS_HONTAL_URL = "https://aegis.dwebxr.xyz";
    const config = loadBridgeConfig();
    expect(config.enabled).toBe(true);
    expect(config.aegisUrl).toBe("https://aegis.dwebxr.xyz");
  });

  it("strips trailing slashes from URL", () => {
    process.env.AEGIS_HONTAL_URL = "https://aegis.dwebxr.xyz///";
    const config = loadBridgeConfig();
    expect(config.aegisUrl).toBe("https://aegis.dwebxr.xyz");
  });

  it("parses sync interval with minimum of 30s", () => {
    process.env.AEGIS_SYNC_INTERVAL_MS = "10000";
    const config = loadBridgeConfig();
    expect(config.syncIntervalMs).toBe(30_000);
  });

  it("uses provided sync interval when above minimum", () => {
    process.env.AEGIS_SYNC_INTERVAL_MS = "600000";
    const config = loadBridgeConfig();
    expect(config.syncIntervalMs).toBe(600_000);
  });

  it("falls back to default sync interval for invalid value", () => {
    process.env.AEGIS_SYNC_INTERVAL_MS = "not-a-number";
    const config = loadBridgeConfig();
    expect(config.syncIntervalMs).toBe(300_000);
  });

  it("parses custom chains", () => {
    process.env.AEGIS_DEFAULT_CHAINS = "base,icp";
    const config = loadBridgeConfig();
    expect(config.defaultChains).toEqual(["base", "icp"]);
  });

  it("ignores invalid chain names", () => {
    process.env.AEGIS_DEFAULT_CHAINS = "base,ethereum,icp";
    const config = loadBridgeConfig();
    expect(config.defaultChains).toEqual(["base", "icp"]);
  });

  it("falls back to all chains when all specified chains are invalid", () => {
    process.env.AEGIS_DEFAULT_CHAINS = "ethereum,polygon";
    const config = loadBridgeConfig();
    expect(config.defaultChains).toEqual(["base", "solana", "icp"]);
  });

  it("parses custom price tier map", () => {
    process.env.AEGIS_PRICE_TIER_MAP = '{"free":0,"basic":5,"premium":20}';
    const config = loadBridgeConfig();
    expect(config.priceTierMap).toEqual({ free: 0, basic: 5, premium: 20 });
  });

  it("falls back to default tier map for invalid JSON", () => {
    process.env.AEGIS_PRICE_TIER_MAP = "not-json";
    expect(() => loadBridgeConfig()).not.toThrow();
  });

  it("parses min composite score", () => {
    process.env.AEGIS_MIN_COMPOSITE_SCORE = "8.5";
    const config = loadBridgeConfig();
    expect(config.minCompositeScore).toBe(8.5);
  });

  it("respects AEGIS_BRIDGE_QUALITY_ONLY=false", () => {
    process.env.AEGIS_BRIDGE_QUALITY_ONLY = "false";
    const config = loadBridgeConfig();
    expect(config.qualityOnly).toBe(false);
  });

  it("custom agent ID", () => {
    process.env.AEGIS_AGENT_ID = "my-custom-bridge";
    const config = loadBridgeConfig();
    expect(config.agentId).toBe("my-custom-bridge");
  });

  it("principal defaults to empty string", () => {
    expect(loadBridgeConfig().principal).toBe("");
  });

  it("reads principal from AEGIS_BRIDGE_PRINCIPAL", () => {
    process.env.AEGIS_BRIDGE_PRINCIPAL = "yfl7q-3wgxk-ki2ns-wtf3t-rjpnm-ak6bc-7rvva-pbpfm-qukxt-eszmh-dqe";
    expect(loadBridgeConfig().principal).toBe("yfl7q-3wgxk-ki2ns-wtf3t-rjpnm-ak6bc-7rvva-pbpfm-qukxt-eszmh-dqe");
  });
});
