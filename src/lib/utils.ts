import type { ChainType } from "@/types/offer";

export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function formatUsdc(amount: number): string {
  return `$${amount.toFixed(2)} USDC`;
}

export function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

export function getExplorerUrl(txHash: string, chain: ChainType): string {
  const explorers: Record<ChainType, string> = {
    base: `https://basescan.org/tx/${txHash}`,
    solana: `https://solscan.io/tx/${txHash}`,
    icp: `https://dashboard.internetcomputer.org/transaction/${txHash}`,
  };
  return explorers[chain];
}
