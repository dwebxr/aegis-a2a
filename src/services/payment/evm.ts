import { createPublicClient, http, type WalletClient } from "viem";
import { base } from "@/lib/chains";
import { erc20Abi } from "@/lib/usdc-abi";
import { USDC_ADDRESSES, usdcToUnits } from "@/lib/constants";
import { isValidEvmAddress } from "@/lib/utils";
import type { PaymentRequest, PaymentResult } from "./types";

export async function payEvm(
  req: PaymentRequest,
  walletClient: WalletClient
): Promise<PaymentResult> {
  if (!isValidEvmAddress(req.recipient)) {
    return { txHash: "", chain: "base", confirmed: false, error: "Invalid EVM recipient address" };
  }

  const amount = usdcToUnits(req.amount);

  try {
    const [account] = await walletClient.getAddresses();
    const txHash = await walletClient.writeContract({
      account,
      address: USDC_ADDRESSES.base as `0x${string}`,
      abi: erc20Abi,
      functionName: "transfer",
      args: [req.recipient as `0x${string}`, amount],
      chain: base,
    });

    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    return {
      txHash,
      chain: "base",
      confirmed: receipt.status === "success",
    };
  } catch (error) {
    return {
      txHash: "",
      chain: "base",
      confirmed: false,
      error: error instanceof Error ? error.message : "EVM payment failed",
    };
  }
}
