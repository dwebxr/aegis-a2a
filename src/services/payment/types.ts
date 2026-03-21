import type { ChainType } from "@/types/offer";
import type { WalletClient } from "viem";
import type { Transaction, VersionedTransaction } from "@solana/web3.js";

export interface PaymentRequest {
  offerId: string;
  chain: ChainType;
  amount: number;
  recipient: string;
}

export interface PaymentResult {
  txHash: string;
  chain: ChainType;
  confirmed: boolean;
  error?: string;
}

export interface WalletContext {
  evmWalletClient?: WalletClient;
  solanaWallet?: SolanaWalletAdapter;
}

export interface SolanaWalletAdapter {
  publicKey: { toBuffer: () => Uint8Array; toString: () => string };
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
}
