"use client";

import { useState, useCallback } from "react";
import { useWalletClient } from "wagmi";
import { useWallet as useSolanaWallet } from "@solana/wallet-adapter-react";
import type { ChainType } from "@/types/offer";
import type { PaymentResult } from "@/services/payment/types";

export function usePayment() {
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: evmWalletClient } = useWalletClient();
  const solanaWallet = useSolanaWallet();

  const pay = useCallback(
    async (
      offerId: string,
      chain: ChainType,
      amount: number,
      recipient: string
    ): Promise<PaymentResult> => {
      setIsPending(true);
      setError(null);
      setResult(null);

      try {
        const { pay: payFn } = await import("@/services/payment");

        const paymentResult = await payFn(
          { offerId, chain, amount, recipient },
          {
            evmWalletClient: evmWalletClient ?? undefined,
            solanaWallet: solanaWallet.publicKey && solanaWallet.signTransaction
              ? {
                  publicKey: solanaWallet.publicKey,
                  signTransaction: solanaWallet.signTransaction,
                }
              : undefined,
          }
        );

        if (paymentResult.error) setError(paymentResult.error);
        setResult(paymentResult);
        return paymentResult;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Payment failed";
        setError(msg);
        const failResult: PaymentResult = { txHash: "", chain, confirmed: false, error: msg };
        setResult(failResult);
        return failResult;
      } finally {
        setIsPending(false);
      }
    },
    [evmWalletClient, solanaWallet.publicKey, solanaWallet.signTransaction]
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setIsPending(false);
  }, []);

  return { pay, isPending, result, error, reset };
}
