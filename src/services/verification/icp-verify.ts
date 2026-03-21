import { HttpAgent, Actor } from "@dfinity/agent";
import { USDC_ADDRESSES, ICP_HOST, usdcToUnits } from "@/lib/constants";
import type { VerificationRequest, VerificationResult } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const icrc1QueryIdl = ({ IDL }: { IDL: any }) => {
  const Account = IDL.Record({
    owner: IDL.Principal,
    subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
  });
  const Transfer = IDL.Record({
    from: Account,
    to: Account,
    amount: IDL.Nat,
    fee: IDL.Opt(IDL.Nat),
    memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
    created_at_time: IDL.Opt(IDL.Nat),
  });
  const Transaction = IDL.Record({
    kind: IDL.Text,
    transfer: IDL.Opt(Transfer),
    timestamp: IDL.Nat,
  });
  const GetTransactionsResponse = IDL.Record({
    transactions: IDL.Vec(Transaction),
    log_length: IDL.Nat,
  });
  return IDL.Service({
    get_transactions: IDL.Func(
      [IDL.Record({ start: IDL.Nat, length: IDL.Nat })],
      [GetTransactionsResponse],
      ["query"]
    ),
  });
};

interface IcpTransferRecord {
  to: { owner: { toText: () => string } };
  amount: bigint;
}

// Candid Opt returns [] for None, [value] for Some
interface IcpTransaction {
  kind: string;
  transfer: [] | [IcpTransferRecord];
}

interface GetTransactionsResult {
  transactions: IcpTransaction[];
}

export async function verifyIcpTransaction(
  req: VerificationRequest
): Promise<VerificationResult> {
  try {
    let blockIndex: bigint;
    try {
      blockIndex = BigInt(req.txHash);
      if (blockIndex < BigInt(0)) {
        return { verified: false, error: "Invalid block index: must be non-negative" };
      }
    } catch {
      return { verified: false, error: `Invalid ICP transaction reference: "${req.txHash}" is not a valid block index` };
    }

    const agent = await HttpAgent.create({ host: ICP_HOST });

    const actor = Actor.createActor(icrc1QueryIdl, {
      agent,
      canisterId: USDC_ADDRESSES.icp,
    });

    const expectedAmount = usdcToUnits(req.expectedAmount);

    const result = (await actor.get_transactions({
      start: blockIndex,
      length: BigInt(1),
    })) as GetTransactionsResult;

    if (!result.transactions?.length) {
      return { verified: false, error: "Transaction not found on ICP ledger" };
    }

    const tx = result.transactions[0];
    // Candid Opt: [] = None, [value] = Some
    if (tx.kind !== "transfer" || tx.transfer.length === 0) {
      return { verified: false, error: "Not a transfer transaction" };
    }

    const transfer = tx.transfer[0];
    const recipientPrincipal = transfer.to.owner.toText();

    if (recipientPrincipal !== req.expectedRecipient) {
      return { verified: false, error: "Recipient mismatch", actualRecipient: recipientPrincipal };
    }

    if (transfer.amount < expectedAmount) {
      return { verified: false, error: "Amount insufficient", actualAmount: transfer.amount };
    }

    return {
      verified: true,
      blockNumber: blockIndex,
      actualAmount: transfer.amount,
      actualRecipient: recipientPrincipal,
    };
  } catch (error) {
    return {
      verified: false,
      error: error instanceof Error ? error.message : "ICP verification failed",
    };
  }
}
