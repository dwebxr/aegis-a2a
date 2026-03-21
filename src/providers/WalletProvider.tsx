"use client";

import { type ReactNode } from "react";
import dynamic from "next/dynamic";
import { EvmProvider } from "./EvmProvider";

// Dynamic imports to avoid SSR issues with wallet adapters
const SolanaProvider = dynamic(
  () => import("./SolanaProvider").then((m) => m.SolanaProvider),
  { ssr: false }
);

const IcpProvider = dynamic(
  () => import("./IcpProvider").then((m) => m.IcpProvider),
  { ssr: false }
);

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <EvmProvider>
      <SolanaProvider>
        <IcpProvider>{children}</IcpProvider>
      </SolanaProvider>
    </EvmProvider>
  );
}
