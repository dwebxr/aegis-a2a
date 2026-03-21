export type { PaymentRequest, PaymentResult, WalletContext } from "./types";
import type { PaymentRequest, PaymentResult, WalletContext } from "./types";
import { payEvm } from "./evm";
import { paySolana } from "./solana";
import { payIcp } from "./icp";

function fail(chain: string, error: string): PaymentResult {
  return { txHash: "", chain: chain as PaymentResult["chain"], confirmed: false, error };
}

export async function pay(req: PaymentRequest, ctx: WalletContext): Promise<PaymentResult> {
  switch (req.chain) {
    case "base": {
      if (!ctx.evmWalletClient) return fail("base", "EVM wallet not connected");
      return payEvm(req, ctx.evmWalletClient);
    }
    case "solana": {
      if (!ctx.solanaWallet) return fail("solana", "Solana wallet not connected");
      // Solana wallet adapter PublicKey is compatible via duck typing
      return paySolana(req, ctx.solanaWallet as Parameters<typeof paySolana>[1]);
    }
    case "icp":
      return payIcp(req);
    default:
      return fail(req.chain, `Unsupported chain: ${req.chain}`);
  }
}
