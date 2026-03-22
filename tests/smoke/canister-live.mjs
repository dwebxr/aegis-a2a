/**
 * Smoke test: verify the IDL factory and canister connection work against
 * the real Aegis canister on ICP mainnet. Run with: node tests/smoke/canister-live.mjs
 */
import { Actor, HttpAgent, AnonymousIdentity } from "@dfinity/agent";

// Inline the IDL factory (can't use path aliases outside Next.js)
const idlFactory = ({ IDL }) => {
  const Offer = IDL.Record({
    id: IDL.Text, contentHash: IDL.Text, publisher: IDL.Text,
    priceUSDC: IDL.Nat, chain: IDL.Text, vclScore: IDL.Float64,
    title: IDL.Text, description: IDL.Text, createdAt: IDL.Int,
  });
  const Receipt = IDL.Record({
    txHash: IDL.Text, chain: IDL.Text, contentHash: IDL.Text,
    payer: IDL.Text, amount: IDL.Nat, verified: IDL.Bool,
  });
  return IDL.Service({
    put_offer: IDL.Func([Offer], [], []),
    get_offers: IDL.Func([IDL.Nat, IDL.Nat], [IDL.Vec(Offer)], ["query"]),
    submit_receipt: IDL.Func([Receipt], [], []),
    get_receipt: IDL.Func([IDL.Text], [IDL.Opt(Receipt)], ["query"]),
    get_a2a_stats: IDL.Func([], [IDL.Record({ offerCount: IDL.Nat, receiptCount: IDL.Nat })], ["query"]),
  });
};

const CANISTER_ID = "rluf3-eiaaa-aaaam-qgjuq-cai";
let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) { console.log(`  ✓ ${label}`); passed++; }
  else { console.error(`  ✗ ${label}`); failed++; }
}

try {
  const agent = HttpAgent.createSync({ host: "https://icp-api.io", identity: new AnonymousIdentity() });
  const actor = Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID });

  console.log("1. get_a2a_stats (query)");
  const stats = await actor.get_a2a_stats();
  assert("returns offerCount as bigint", typeof stats.offerCount === "bigint");
  assert("returns receiptCount as bigint", typeof stats.receiptCount === "bigint");
  console.log(`   offerCount=${stats.offerCount}, receiptCount=${stats.receiptCount}`);

  console.log("2. get_offers (query, page 0)");
  const offers = await actor.get_offers(BigInt(0), BigInt(5));
  assert("returns an array", Array.isArray(offers));
  assert("offers have expected shape", offers.length === 0 || (typeof offers[0].id === "string" && typeof offers[0].priceUSDC === "bigint"));
  console.log(`   returned ${offers.length} offers`);

  if (offers.length > 0) {
    const o = offers[0];
    console.log(`   sample: id=${o.id}, title=${o.title.slice(0, 40)}, priceUSDC=${o.priceUSDC}`);
  }

  console.log("3. get_receipt (query, non-existent)");
  const receipt = await actor.get_receipt("non-existent-tx-hash");
  assert("returns empty array for unknown txHash", receipt.length === 0);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
} catch (e) {
  console.error("FATAL:", e.message);
  process.exit(1);
}
