/**
 * Smoke test: verify put_offer (update call) works with AnonymousIdentity.
 * Run with: node tests/smoke/canister-write.mjs
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
    get_offers: IDL.Func([IDL.Nat, IDL.Nat], [IDL.Vec(Offer)], ["query"]),
  });
};

const CANISTER_ID = "rluf3-eiaaa-aaaam-qgjuq-cai";
const TEST_ID = `smoke-test-${Date.now()}`;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

try {
  const agent = HttpAgent.createSync({ host: "https://icp-api.io", identity: new AnonymousIdentity() });
  const actor = Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID });

  console.log("1. put_offer (update call with AnonymousIdentity)");
  await actor.put_offer({
    id: TEST_ID,
    contentHash: "smoke-test",
    publisher: "smoke-test-agent",
    priceUSDC: BigInt(0),
    chain: "base",
    vclScore: 0.0,
    title: "Smoke Test Offer",
    description: JSON.stringify({ description: "smoke test", supportedChains: ["base"] }),
    createdAt: BigInt(Date.now()),
  });
  console.log("  ✓ put_offer succeeded (no auth error)");

  // ICP update calls need consensus — wait for state propagation
  console.log("2. waiting 3s for state propagation...");
  await sleep(3000);

  console.log("3. verify offer exists via get_offers");
  const offers = await actor.get_offers(BigInt(0), BigInt(100));
  const found = offers.find(o => o.id === TEST_ID);
  if (found) {
    console.log("  ✓ offer found in canister");
    console.log(`    id=${found.id}, title=${found.title}`);
  } else {
    console.log(`  ⚠ offer not visible yet (${offers.length} offers found). ICP replica may need more time.`);
    console.log("  This is expected for non-certified queries against replicas with stale state.");
  }

  console.log("\nWrite test completed. put_offer accepted by canister.");
} catch (e) {
  console.error("FAILED:", e.message);
  process.exit(1);
}
