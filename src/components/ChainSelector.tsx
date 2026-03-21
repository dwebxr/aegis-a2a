"use client";

import type { ChainType } from "@/types/offer";
import { CHAIN_NAMES, CHAIN_ICONS } from "@/lib/constants";

interface ChainSelectorProps {
  selected: ChainType;
  onChange: (chain: ChainType) => void;
  supportedChains?: ChainType[];
  disabled?: boolean;
}

export function ChainSelector({
  selected,
  onChange,
  supportedChains = ["base", "solana", "icp"],
  disabled = false,
}: ChainSelectorProps) {
  const allChains: ChainType[] = ["base", "solana", "icp"];

  return (
    <div className="flex gap-2">
      {allChains.map((chain) => {
        const isSupported = supportedChains.includes(chain);
        const isSelected = selected === chain;

        return (
          <button
            key={chain}
            onClick={() => isSupported && onChange(chain)}
            disabled={disabled || !isSupported}
            className={`
              flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium
              transition-all duration-150
              ${
                isSelected
                  ? "bg-blue-600 text-white shadow-md"
                  : isSupported
                  ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                  : "bg-gray-900 text-gray-600 cursor-not-allowed"
              }
            `}
          >
            <span>{CHAIN_ICONS[chain]}</span>
            <span>{CHAIN_NAMES[chain]}</span>
          </button>
        );
      })}
    </div>
  );
}
