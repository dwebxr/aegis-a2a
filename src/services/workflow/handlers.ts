import { registerStepHandler } from "./runner";
import type { PolicyRule } from "@/types/policy";

let registered = false;

// Registers built-in step handlers. Call once before first workflow execution.
export function ensureHandlersRegistered(): void {
  if (registered) return;
  registered = true;

  registerStepHandler("publish", async (step) => {
    const { addOffer } = await import("@/services/content/store");
    const config = step.config as Record<string, unknown>;
    const offer = await addOffer({
      agentId: (config.agentId as string) || "workflow",
      title: (config.title as string) || step.name,
      description: (config.description as string) || "",
      priceUsdc: (config.priceUsdc as number) || 0,
      contentHash: (config.contentHash as string) || "",
      supportedChains: (config.supportedChains as Array<"base" | "solana" | "icp">) || ["base", "solana", "icp"],
      encryptedContent: config.content as string | undefined,
      topics: config.topics as string[] | undefined,
    });
    return { offerId: offer.id, title: offer.title };
  });

  registerStepHandler("purchase", async (step) => {
    const { unlockContent } = await import("@/services/content/unlock");
    const config = step.config as Record<string, unknown>;
    const result = await unlockContent(
      config.offerId as string,
      config.txHash as string,
      config.chain as "base" | "solana" | "icp",
      config.payer as string | undefined,
    );
    if (!result.success) throw new Error(result.error || "Purchase failed");
    return { content: result.content };
  });

  registerStepHandler("verify", async (step, ctx) => {
    const config = step.config as Record<string, unknown>;
    const chain = config.chain as "base" | "solana" | "icp";
    const ctxRecord = ctx as Record<string, Record<string, unknown> | undefined>;
    const txHash = (config.txHash as string) || (ctxRecord.step_s1?.txHash as string | undefined);
    const recipient = config.recipient as string;
    const amount = config.amount as number;

    if (!txHash || !chain) throw new Error("verify requires txHash and chain in config or previous step output");

    const req = { txHash, chain, expectedRecipient: recipient, expectedAmount: amount };

    if (chain === "base") {
      const { verifyEvmTransaction } = await import("@/services/verification/evm-verify");
      return verifyEvmTransaction(req);
    }
    if (chain === "solana") {
      const { verifySolanaTransaction } = await import("@/services/verification/solana-verify");
      return verifySolanaTransaction(req);
    }
    if (chain === "icp") {
      const { verifyIcpTransaction } = await import("@/services/verification/icp-verify");
      return verifyIcpTransaction(req);
    }
    throw new Error(`Unsupported chain for verify: ${chain}`);
  });

  registerStepHandler("transform", async (step, ctx) => {
    const config = step.config as Record<string, unknown>;
    const inputKey = config.inputFrom as string;
    const input = inputKey ? (ctx as Record<string, unknown>)[`step_${inputKey}`] : undefined;
    return { input, transformed: true, label: config.label || step.name };
  });

  registerStepHandler("policy_check", async (step) => {
    const { enforcePolicy } = await import("@/services/policy/enforcer");
    const config = step.config as Record<string, unknown>;
    const rules = config.rules as PolicyRule[];
    const offer = config.offer as Record<string, unknown>;
    if (!rules || !offer) throw new Error("policy_check requires rules and offer in config");
    const result = enforcePolicy(offer, rules);
    if (!result.allowed) throw new Error(`Policy violation: ${result.violations.join("; ")}`);
    return result;
  });

  registerStepHandler("bridge_sync", async () => {
    const { loadBridgeConfig } = await import("@/lib/bridge-config");
    const { runSyncCycle } = await import("@/services/bridge/sync");
    const config = loadBridgeConfig();
    const result = await runSyncCycle(config);
    if (!result) throw new Error("Bridge sync failed or disabled");
    return result;
  });
}
