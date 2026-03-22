"use client";

import { useState, useMemo } from "react";
import type { Offer, ChainType } from "@/types/offer";
import { ChainSelector } from "./ChainSelector";
import { usePayment } from "@/hooks/usePayment";
import { useUnlock } from "@/hooks/useUnlock";
import { formatUsdc, getExplorerUrl } from "@/lib/utils";
import { useAccount } from "wagmi";
import { useWallet as useSolanaWallet } from "@solana/wallet-adapter-react";

interface MultiChainPayButtonProps {
  offer: Offer;
  onUnlocked: (content: string) => void;
  onCancel: () => void;
}

export function MultiChainPayButton({
  offer,
  onUnlocked,
  onCancel,
}: MultiChainPayButtonProps) {
  const [selectedChain, setSelectedChain] = useState<ChainType>(
    offer.supportedChains[0]
  );
  const { pay, isPending, result, error: payError } = usePayment();
  const { unlock, isUnlocking, error: unlockError } = useUnlock();
  const { address: evmAddress } = useAccount();
  const { publicKey: solanaPublicKey } = useSolanaWallet();

  const [configError, setConfigError] = useState<string | null>(null);

  const recipientAddresses = useMemo<Record<ChainType, string>>(() => ({
    base: process.env.NEXT_PUBLIC_BASE_RECIPIENT || "",
    solana: process.env.NEXT_PUBLIC_SOLANA_RECIPIENT || "",
    icp: process.env.NEXT_PUBLIC_ICP_RECIPIENT || "",
  }), []);

  const handlePay = async () => {
    setConfigError(null);
    const recipient = recipientAddresses[selectedChain];
    if (!recipient) {
      setConfigError(`Payment recipient not configured for ${selectedChain}. Contact the operator.`);
      return;
    }

    const paymentResult = await pay(
      offer.id,
      selectedChain,
      offer.priceUsdc,
      recipient
    );

    if (paymentResult.confirmed && paymentResult.txHash) {
      const payerAddress =
        selectedChain === "base" ? evmAddress :
        selectedChain === "solana" ? solanaPublicKey?.toBase58() :
        selectedChain === "icp" ? window.ic?.plug?.principalId :
        undefined;
      const content = await unlock(
        offer.id,
        paymentResult.txHash,
        selectedChain,
        payerAddress,
      );
      if (content) {
        onUnlocked(content);
      }
    }
  };

  const isProcessing = isPending || isUnlocking;
  const error = configError || payError || unlockError;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md mx-auto">
      <h3 className="text-lg font-semibold text-white mb-1">{offer.title}</h3>
      <p className="text-blue-400 font-bold text-xl mb-4">
        {formatUsdc(offer.priceUsdc)}
      </p>

      <div className="mb-4">
        <label className="text-gray-400 text-sm mb-2 block">
          Select payment chain
        </label>
        <ChainSelector
          selected={selectedChain}
          onChange={setSelectedChain}
          supportedChains={offer.supportedChains}
          disabled={isProcessing}
        />
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {result?.confirmed && (
        <div className="bg-green-900/30 border border-green-800 text-green-400 text-sm rounded-lg p-3 mb-4">
          Payment confirmed!{" "}
          <a
            href={getExplorerUrl(result.txHash, result.chain)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View transaction
          </a>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handlePay}
          disabled={isProcessing}
          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <span className="animate-spin">⏳</span>
              {isPending ? "Paying..." : "Unlocking..."}
            </>
          ) : (
            `Pay with USDC`
          )}
        </button>
      </div>
    </div>
  );
}
