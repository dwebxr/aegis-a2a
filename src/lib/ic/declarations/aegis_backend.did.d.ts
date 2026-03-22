import type { ActorMethod } from "@dfinity/agent";
import type { Principal } from "@dfinity/principal";

export interface Offer {
  id: string;
  contentHash: string;
  publisher: string;
  priceUSDC: bigint;
  chain: string;
  vclScore: number;
  title: string;
  description: string;
  createdAt: bigint;
}

export interface Receipt {
  txHash: string;
  chain: string;
  contentHash: string;
  payer: string;
  amount: bigint;
  verified: boolean;
}

export interface _SERVICE {
  put_offer: ActorMethod<[Offer], void>;
  get_offer: ActorMethod<[string], [] | [Offer]>;
  get_offers: ActorMethod<[bigint, bigint], Offer[]>;
  delete_offer: ActorMethod<[string], boolean>;
  submit_receipt: ActorMethod<[Receipt], void>;
  get_receipt: ActorMethod<[string], [] | [Receipt]>;
  verify_payment_manual: ActorMethod<[string], boolean>;
  get_a2a_stats: ActorMethod<[], { offerCount: bigint; receiptCount: bigint }>;
  recordD2AMatch: ActorMethod<[string, Principal, string, bigint], { ok: string } | { err: string }>;
}
