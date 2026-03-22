import { HttpAgent, AnonymousIdentity } from "@dfinity/agent";

export const CANISTER_ID = process.env.AEGIS_CANISTER_ID || "rluf3-eiaaa-aaaam-qgjuq-cai";
const IC_HOST = process.env.AEGIS_IC_HOST || "https://icp-api.io";

export function createAgent(): HttpAgent {
  return HttpAgent.createSync({
    host: IC_HOST,
    identity: new AnonymousIdentity(),
  });
}
