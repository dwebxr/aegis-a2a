import { Connection, clusterApiUrl } from "@solana/web3.js";
import { SOLANA_CLUSTER, usdcToUnits } from "@/lib/constants";
import type { VerificationRequest, VerificationResult } from "./types";

export async function verifySolanaTransaction(
  req: VerificationRequest
): Promise<VerificationResult> {
  try {
    const connection = new Connection(
      process.env.SOLANA_RPC_URL || clusterApiUrl(SOLANA_CLUSTER)
    );

    const tx = await connection.getTransaction(req.txHash, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { verified: false, error: "Transaction not found" };
    }

    if (tx.meta?.err) {
      return { verified: false, error: `Transaction failed: ${JSON.stringify(tx.meta.err)}` };
    }

    const postBalances = tx.meta?.postTokenBalances || [];
    const preBalances = tx.meta?.preTokenBalances || [];
    const expectedAmount = usdcToUnits(req.expectedAmount);

    const recipientPost = postBalances.find((b) => b.owner === req.expectedRecipient);
    if (!recipientPost) {
      return { verified: false, error: "Recipient not found in transaction" };
    }

    const recipientPre = preBalances.find((b) => b.owner === req.expectedRecipient);
    const preAmount = BigInt(recipientPre?.uiTokenAmount?.amount ?? "0");
    const postAmount = BigInt(recipientPost.uiTokenAmount.amount);
    const received = postAmount - preAmount;

    if (received < expectedAmount) {
      return { verified: false, error: "Amount insufficient", actualAmount: received };
    }

    return {
      verified: true,
      blockNumber: BigInt(tx.slot),
      actualAmount: received,
      actualRecipient: req.expectedRecipient,
    };
  } catch (error) {
    return {
      verified: false,
      error: error instanceof Error ? error.message : "Solana verification failed",
    };
  }
}
