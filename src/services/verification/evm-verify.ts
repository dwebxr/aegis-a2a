import { createPublicClient, http, decodeEventLog } from "viem";
import { base } from "@/lib/chains";
import { erc20Abi } from "@/lib/usdc-abi";
import { USDC_ADDRESSES, usdcToUnits } from "@/lib/constants";
import type { VerificationRequest, VerificationResult } from "./types";

export async function verifyEvmTransaction(
  req: VerificationRequest
): Promise<VerificationResult> {
  try {
    const publicClient = createPublicClient({
      chain: base,
      transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
    });

    const receipt = await publicClient.getTransactionReceipt({
      hash: req.txHash as `0x${string}`,
    });

    if (receipt.status !== "success") {
      return { verified: false, error: "Transaction reverted" };
    }

    const usdcAddress = USDC_ADDRESSES.base.toLowerCase();
    const transferLog = receipt.logs.find(
      (log) => log.address.toLowerCase() === usdcAddress
    );

    if (!transferLog) {
      return { verified: false, error: "No USDC transfer found in transaction" };
    }

    const decoded = decodeEventLog({
      abi: erc20Abi,
      data: transferLog.data,
      topics: transferLog.topics,
    });

    if (decoded.eventName !== "Transfer") {
      return { verified: false, error: "Unexpected event type" };
    }

    const args = decoded.args as { from: string; to: string; value: bigint };
    const expectedAmount = usdcToUnits(req.expectedAmount);

    if (args.to.toLowerCase() !== req.expectedRecipient.toLowerCase()) {
      return {
        verified: false,
        error: "Recipient mismatch",
        actualRecipient: args.to,
      };
    }

    if (args.value < expectedAmount) {
      return {
        verified: false,
        error: "Amount insufficient",
        actualAmount: args.value,
      };
    }

    return {
      verified: true,
      blockNumber: receipt.blockNumber,
      actualAmount: args.value,
      actualRecipient: args.to,
    };
  } catch (error) {
    return {
      verified: false,
      error: error instanceof Error ? error.message : "EVM verification failed",
    };
  }
}
