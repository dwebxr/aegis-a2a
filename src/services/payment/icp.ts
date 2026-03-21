import { USDC_ADDRESSES, usdcToUnits, ICP_HOST } from "@/lib/constants";
import type { PaymentRequest, PaymentResult } from "./types";

// Plug wallet global type
declare global {
  interface Window {
    ic?: {
      plug?: {
        isConnected: () => Promise<boolean>;
        requestConnect: (opts?: {
          whitelist?: string[];
          host?: string;
        }) => Promise<boolean>;
        createActor: <T>(opts: {
          canisterId: string;
          interfaceFactory: { idlFactory: unknown };
        }) => Promise<T>;
        principalId: string;
        accountId: string;
      };
    };
  }
}

// ICRC-1 transfer args
interface Icrc1TransferArgs {
  to: {
    owner: Uint8Array;
    subaccount: [] | [Uint8Array];
  };
  amount: bigint;
  fee: [] | [bigint];
  memo: [] | [Uint8Array];
  from_subaccount: [] | [Uint8Array];
  created_at_time: [] | [bigint];
}

type TransferResult =
  | { Ok: bigint }
  | { Err: Record<string, unknown> };

export async function payIcp(req: PaymentRequest): Promise<PaymentResult> {
  try {
    const plug = window.ic?.plug;
    if (!plug) {
      throw new Error("Plug wallet not detected. Please install the Plug browser extension.");
    }

    const connected = await plug.isConnected();
    if (!connected) {
      await plug.requestConnect({
        whitelist: [USDC_ADDRESSES.icp],
        host: ICP_HOST,
      });
    }

    const amount = usdcToUnits(req.amount);

    // Use Plug's built-in requestTransfer for ICRC-1 tokens
    // The actor approach requires the IDL factory which we construct inline
    const actor = await plug.createActor<{
      icrc1_transfer: (args: Icrc1TransferArgs) => Promise<TransferResult>;
    }>({
      canisterId: USDC_ADDRESSES.icp,
      interfaceFactory: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        idlFactory: ({ IDL }: { IDL: any }) => {
          // Minimal ICRC-1 interface using Candid IDL
          const Subaccount = IDL.Vec(IDL.Nat8);
          const Account = IDL.Record({
            owner: IDL.Principal,
            subaccount: IDL.Opt(Subaccount),
          });
          const TransferArgs = IDL.Record({
            to: Account,
            amount: IDL.Nat,
            fee: IDL.Opt(IDL.Nat),
            memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
            from_subaccount: IDL.Opt(Subaccount),
            created_at_time: IDL.Opt(IDL.Nat),
          });
          const TransferError = IDL.Variant({
            BadFee: IDL.Record({ expected_fee: IDL.Nat }),
            BadBurn: IDL.Record({ min_burn_amount: IDL.Nat }),
            InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
            TooOld: IDL.Text,
            CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat }),
            Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
            TemporarilyUnavailable: IDL.Text,
            GenericError: IDL.Record({
              error_code: IDL.Nat,
              message: IDL.Text,
            }),
          });
          const TransferResult = IDL.Variant({
            Ok: IDL.Nat,
            Err: TransferError,
          });
          return IDL.Service({
            icrc1_transfer: IDL.Func(
              [TransferArgs],
              [TransferResult],
              []
            ),
          });
        },
      },
    });

    // Encode recipient principal
    const { Principal } = await import("@dfinity/principal");
    const recipientPrincipal = Principal.fromText(req.recipient);

    const result = await actor.icrc1_transfer({
      to: {
        owner: recipientPrincipal.toUint8Array(),
        subaccount: [],
      },
      amount,
      fee: [],
      memo: [],
      from_subaccount: [],
      created_at_time: [],
    });

    if ("Ok" in result) {
      return {
        txHash: result.Ok.toString(),
        chain: "icp",
        confirmed: true,
      };
    }

    return {
      txHash: "",
      chain: "icp",
      confirmed: false,
      error: `ICP transfer error: ${JSON.stringify(result.Err)}`,
    };
  } catch (error) {
    return {
      txHash: "",
      chain: "icp",
      confirmed: false,
      error: error instanceof Error ? error.message : "ICP payment failed",
    };
  }
}
