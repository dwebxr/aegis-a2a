export type { VerificationRequest, VerificationResult } from "./types";
import type { VerificationRequest, VerificationResult } from "./types";
import { verifyEvmTransaction } from "./evm-verify";
import { verifySolanaTransaction } from "./solana-verify";
import { verifyIcpTransaction } from "./icp-verify";

export async function verify(req: VerificationRequest): Promise<VerificationResult> {
  switch (req.chain) {
    case "base":
      return verifyEvmTransaction(req);
    case "solana":
      return verifySolanaTransaction(req);
    case "icp":
      return verifyIcpTransaction(req);
    default:
      return { verified: false, error: `Unsupported chain: ${req.chain}` };
  }
}
