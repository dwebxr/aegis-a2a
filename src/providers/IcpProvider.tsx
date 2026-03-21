"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { USDC_ADDRESSES, ICP_HOST } from "@/lib/constants";

interface IcpWalletState {
  isConnected: boolean;
  principal: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const IcpContext = createContext<IcpWalletState>({
  isConnected: false,
  principal: null,
  connect: async () => {},
  disconnect: () => {},
});

export function useIcpWallet() {
  return useContext(IcpContext);
}

export function IcpProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [principal, setPrincipal] = useState<string | null>(null);

  // Check if Plug is already connected on mount
  useEffect(() => {
    const checkConnection = async () => {
      const plug = window.ic?.plug;
      if (plug) {
        try {
          const connected = await plug.isConnected();
          if (connected) {
            setIsConnected(true);
            setPrincipal(plug.principalId || null);
          }
        } catch (err) {
          console.debug("[ICP] Plug connection check failed:", err);
        }
      }
    };
    checkConnection();
  }, []);

  const connect = useCallback(async () => {
    const plug = window.ic?.plug;
    if (!plug) {
      window.open("https://plugwallet.ooo/", "_blank");
      throw new Error("Plug wallet not installed");
    }

    const result = await plug.requestConnect({
      whitelist: [USDC_ADDRESSES.icp],
      host: ICP_HOST,
    });

    if (result) {
      setIsConnected(true);
      setPrincipal(plug.principalId || null);
    }
  }, []);

  const disconnect = useCallback(() => {
    setIsConnected(false);
    setPrincipal(null);
  }, []);

  return (
    <IcpContext.Provider value={{ isConnected, principal, connect, disconnect }}>
      {children}
    </IcpContext.Provider>
  );
}
