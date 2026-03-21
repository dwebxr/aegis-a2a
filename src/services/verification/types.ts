import type { ChainType } from "@/types/offer";

export interface VerificationRequest {
  txHash: string;
  chain: ChainType;
  expectedAmount: number; // USDC
  expectedRecipient: string;
}

export interface VerificationResult {
  verified: boolean;
  blockNumber?: bigint;
  actualAmount?: bigint;
  actualRecipient?: string;
  error?: string;
}
