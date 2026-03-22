import { Actor } from "@dfinity/agent";
import { createAgent, CANISTER_ID } from "./agent";
import { idlFactory } from "./declarations";
import type { _SERVICE } from "./declarations";

let cachedActor: _SERVICE | null = null;

export function getBackendActor(): _SERVICE {
  if (!cachedActor) {
    const agent = createAgent();
    cachedActor = Actor.createActor<_SERVICE>(idlFactory, {
      agent,
      canisterId: CANISTER_ID,
    });
  }
  return cachedActor;
}
