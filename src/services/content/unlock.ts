import type { ChainType } from "@/types/offer";
import { verify } from "@/services/verification";
import { getRecipientAddress } from "@/lib/constants";
import { getOffer, isTransactionUsed, recordPurchase, recordEngagement } from "./store";

export interface UnlockResult {
  success: boolean;
  content?: string;
  error?: string;
}

export async function unlockContent(
  offerId: string,
  txHash: string,
  chain: ChainType,
  payer?: string,
): Promise<UnlockResult> {
  const offer = await getOffer(offerId);
  if (!offer) {
    return { success: false, error: "Offer not found" };
  }

  if (!offer.supportedChains.includes(chain)) {
    return { success: false, error: `Offer does not support chain: ${chain}` };
  }

  if (await isTransactionUsed(txHash)) {
    return { success: false, error: "Transaction already used" };
  }

  const recipient = getRecipientAddress(chain);
  if (!recipient) {
    return { success: false, error: `Recipient address not configured for ${chain}. Set the corresponding environment variable.` };
  }

  const verification = await verify({
    txHash,
    chain,
    expectedAmount: offer.priceUsdc,
    expectedRecipient: recipient,
  });

  if (!verification.verified) {
    return { success: false, error: `Payment verification failed: ${verification.error}` };
  }

  await recordPurchase(
    offerId,
    txHash,
    chain,
    payer || "anonymous",
    offer.priceUsdc,
    offer.contentHash,
  );

  // Record engagement for bridged content — enables ecosystem revenue tracking
  if (offer.sourceRef?.system === "aegis-hontal") {
    recordEngagement(offer.contentHash, offer.priceUsdc).catch(() => {});
  }

  return {
    success: true,
    content: offer.encryptedContent || "Content unavailable",
  };
}
