import {
  Connection,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { USDC_ADDRESSES, usdcToUnits, SOLANA_CLUSTER } from "@/lib/constants";
import { isValidSolanaAddress } from "@/lib/utils";
import type { PaymentRequest, PaymentResult } from "./types";

interface SolanaWallet {
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
}

export async function paySolana(
  req: PaymentRequest,
  wallet: SolanaWallet
): Promise<PaymentResult> {
  if (!isValidSolanaAddress(req.recipient)) {
    return { txHash: "", chain: "solana", confirmed: false, error: "Invalid Solana recipient address" };
  }

  const connection = new Connection(
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(SOLANA_CLUSTER)
  );
  const usdcMint = new PublicKey(USDC_ADDRESSES.solana);
  const recipientPubkey = new PublicKey(req.recipient);
  const amount = usdcToUnits(req.amount);

  try {
    const [senderAta, recipientAta] = await Promise.all([
      getAssociatedTokenAddress(usdcMint, wallet.publicKey),
      getAssociatedTokenAddress(usdcMint, recipientPubkey),
    ]);

    const instruction = createTransferInstruction(
      senderAta,
      recipientAta,
      wallet.publicKey,
      amount
    );

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();

    const transaction = new Transaction().add(instruction);
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = wallet.publicKey;

    const signed = await wallet.signTransaction(transaction);
    const rawTx = signed.serialize();
    const txHash = await connection.sendRawTransaction(rawTx);

    await connection.confirmTransaction(txHash, "confirmed");

    return { txHash, chain: "solana", confirmed: true };
  } catch (error) {
    return {
      txHash: "",
      chain: "solana",
      confirmed: false,
      error: error instanceof Error ? error.message : "Solana payment failed",
    };
  }
}
