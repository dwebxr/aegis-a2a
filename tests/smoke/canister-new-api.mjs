/**
 * Smoke test: verify new get_offer and delete_offer APIs.
 * Run with: node tests/smoke/canister-new-api.mjs
 */
import { Actor, HttpAgent, AnonymousIdentity } from "@dfinity/agent";

const idlFactory = ({ IDL }) => {
  const Offer = IDL.Record({
    id: IDL.Text, contentHash: IDL.Text, publisher: IDL.Text,
    priceUSDC: IDL.Nat, chain: IDL.Text, vclScore: IDL.Float64,
    title: IDL.Text, description: IDL.Text, createdAt: IDL.Int,
  });
  return IDL.Service({
    put_offer: IDL.Func([Offer], [], []),
    get_offer: IDL.Func([IDL.Text], [IDL.Opt(Offer)], ["query"]),
    get_offers: IDL.Func([IDL.Nat, IDL.Nat], [IDL.Vec(Offer)], ["query"]),
    delete_offer: IDL.Func([IDL.Text], [IDL.Bool], []),
    get_a2a_stats: IDL.Func([], [IDL.Record({ offerCount: IDL.Nat, receiptCount: IDL.Nat })], ["query"]),
  });
};

const CANISTER_ID = "rluf3-eiaaa-aaaam-qgjuq-cai";
const TEST_ID = `api-test-${Date.now()}`;
let passed = 0, failed = 0;

function assert(label, condition) {
  if (condition) { console.log(`  ✓ ${label}`); passed++; }
  else { console.error(`  ✗ ${label}`); failed++; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

try {
  const agent = HttpAgent.createSync({ host: "https://icp-api.io", identity: new AnonymousIdentity() });
  const actor = Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID });

  console.log("1. get_offer (non-existent)");
  const empty = await actor.get_offer("does-not-exist");
  assert("returns empty for unknown ID", empty.length === 0);

  console.log("2. put_offer (create test offer)");
  await actor.put_offer({
    id: TEST_ID, contentHash: "test", publisher: "smoke",
    priceUSDC: BigInt(0), chain: "base", vclScore: 0.0,
    title: "API Test", description: "{}", createdAt: BigInt(Date.now()),
  });
  assert("put_offer succeeded", true);

  console.log("3. get_offer (by ID) — waiting 3s for propagation");
  await sleep(3000);
  const found = await actor.get_offer(TEST_ID);
  assert("get_offer returns the offer", found.length === 1);
  if (found.length === 1) {
    assert("offer ID matches", found[0].id === TEST_ID);
    assert("offer title matches", found[0].title === "API Test");
  }

  console.log("4. delete_offer");
  const deleted = await actor.delete_offer(TEST_ID);
  assert("delete_offer returns true", deleted === true);

  console.log("5. get_offer after delete — waiting 3s");
  await sleep(3000);
  const afterDelete = await actor.get_offer(TEST_ID);
  assert("offer is gone after delete", afterDelete.length === 0);

  console.log("6. delete_offer (non-existent)");
  const deleteMissing = await actor.delete_offer("never-existed");
  assert("returns false for unknown ID", deleteMissing === false);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
} catch (e) {
  console.error("FATAL:", e.message);
  process.exit(1);
}
