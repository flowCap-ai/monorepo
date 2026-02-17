'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import type { Address, Hex } from 'viem';

// ─── Types ───────────────────────────────────────────────────

export interface SmartAccountState {
  address: Address | null;
  isDeployed: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface BiconomyHookReturn {
  /** Smart account info */
  smartAccount: SmartAccountState;
  /** Create or retrieve the smart account for the connected wallet */
  createSmartAccount: () => Promise<Address | null>;
  /** Submit a UserOperation via the bundler */
  submitUserOp: (target: Address, callData: Hex, value?: bigint) => Promise<string | null>;
  /** Reset state */
  reset: () => void;
}

// ─── Hook ────────────────────────────────────────────────────

export function useBiconomy(): BiconomyHookReturn {
  const { address: eoaAddress, isConnected } = useAccount();

  const [smartAccount, setSmartAccount] = useState<SmartAccountState>({
    address: null,
    isDeployed: false,
    isLoading: false,
    error: null,
  });

  const createSmartAccount = useCallback(async (): Promise<Address | null> => {
    if (!isConnected || !eoaAddress) {
      setSmartAccount((s) => ({ ...s, error: 'Wallet not connected' }));
      return null;
    }

    setSmartAccount((s) => ({ ...s, isLoading: true, error: null }));

    try {
      // Dynamic import to avoid SSR issues
      const { createSmartAccount: create } = await import('@/lib/biconomyClient');
      const result = await create(eoaAddress);

      const addr = result?.address ?? null;
      setSmartAccount({
        address: addr,
        isDeployed: true,
        isLoading: false,
        error: null,
      });

      return addr;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create smart account';
      setSmartAccount({
        address: null,
        isDeployed: false,
        isLoading: false,
        error: msg,
      });
      return null;
    }
  }, [isConnected, eoaAddress]);

  const submitUserOp = useCallback(
    async (target: Address, callData: Hex, value?: bigint): Promise<string | null> => {
      if (!smartAccount.address) {
        setSmartAccount((s) => ({ ...s, error: 'Smart account not created' }));
        return null;
      }

      try {
        // UserOp execution is handled by the agent via compressedSessionData.
        // Direct submitUserOperation is not available in browser context.
        throw new Error('UserOp execution must be performed by the CustoFi agent, not the browser.');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'UserOp submission failed';
        setSmartAccount((s) => ({ ...s, error: msg }));
        return null;
      }
    },
    [smartAccount.address]
  );

  const reset = useCallback(() => {
    setSmartAccount({
      address: null,
      isDeployed: false,
      isLoading: false,
      error: null,
    });
  }, []);

  return {
    smartAccount,
    createSmartAccount,
    submitUserOp,
    reset,
  };
}

export default useBiconomy;
