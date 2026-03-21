import type { ChainType } from "@/types/offer";

export const VALID_CHAINS: ChainType[] = ["base", "solana", "icp"];

export const USDC_ADDRESSES: Record<ChainType, string> = {
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  solana: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  icp: "xevnm-gaaaa-aaaar-qafnq-cai",
};

export const USDC_DECIMALS = 6;
export const SOLANA_CLUSTER = "mainnet-beta" as const;
export const ICP_HOST = "https://ic0.app";

export const CHAIN_NAMES: Record<ChainType, string> = {
  base: "Base",
  solana: "Solana",
  icp: "ICP (ckUSDC)",
};

export const CHAIN_ICONS: Record<ChainType, string> = {
  base: "🔵",
  solana: "🟣",
  icp: "♾️",
};

export function getRecipientAddress(chain: ChainType): string | null {
  const addr = ({
    base: process.env.BASE_RECIPIENT_ADDRESS,
    solana: process.env.SOLANA_RECIPIENT_ADDRESS,
    icp: process.env.ICP_RECIPIENT_PRINCIPAL,
  })[chain];
  return addr || null;
}

export function usdcToUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
}

export function isValidChain(chain: string): chain is ChainType {
  return VALID_CHAINS.includes(chain as ChainType);
}
