/* eslint-disable @typescript-eslint/no-explicit-any */
export const idlFactory = ({ IDL }: { IDL: any }) => {
  const Offer = IDL.Record({
    id: IDL.Text,
    contentHash: IDL.Text,
    publisher: IDL.Text,
    priceUSDC: IDL.Nat,
    chain: IDL.Text,
    vclScore: IDL.Float64,
    title: IDL.Text,
    description: IDL.Text,
    createdAt: IDL.Int,
  });
  const Receipt = IDL.Record({
    txHash: IDL.Text,
    chain: IDL.Text,
    contentHash: IDL.Text,
    payer: IDL.Text,
    amount: IDL.Nat,
    verified: IDL.Bool,
  });
  return IDL.Service({
    put_offer: IDL.Func([Offer], [], []),
    get_offer: IDL.Func([IDL.Text], [IDL.Opt(Offer)], ["query"]),
    get_offers: IDL.Func([IDL.Nat, IDL.Nat], [IDL.Vec(Offer)], ["query"]),
    delete_offer: IDL.Func([IDL.Text], [IDL.Bool], []),
    submit_receipt: IDL.Func([Receipt], [], []),
    get_receipt: IDL.Func([IDL.Text], [IDL.Opt(Receipt)], ["query"]),
    verify_payment_manual: IDL.Func([IDL.Text], [IDL.Bool], []),
    get_a2a_stats: IDL.Func(
      [],
      [IDL.Record({ offerCount: IDL.Nat, receiptCount: IDL.Nat })],
      ["query"],
    ),
    // D2A engagement tracking — records A2A content consumption back to Aegis
    recordD2AMatch: IDL.Func(
      [IDL.Text, IDL.Principal, IDL.Text, IDL.Nat],
      [IDL.Variant({ ok: IDL.Text, err: IDL.Text })],
      [],
    ),
  });
};
