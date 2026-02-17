'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import type { Address } from 'viem';

// ─── Types ───────────────────────────────────────────────────

export interface SessionKeyState {
  /** Session key public address */
  sessionAddress: Address | null;
  /** Whether the session key is currently valid */
  isValid: boolean;
  /** Unix timestamp when the session expires */
  validUntil: number | null;
  /** Remaining seconds until expiry */
  remainingSeconds: number;
  /** Whether a session key is being generated */
  isGenerating: boolean;
  /** Error message */
  error: string | null;
}

export interface UseSessionKeyReturn {
  session: SessionKeyState;
  /** Generate a new session key and store it encrypted in localStorage */
  generateSessionKey: (smartAccountAddress: Address) => Promise<Address | null>;
  /** Revoke the current session key */
  revokeSessionKey: () => void;
  /** Get the encrypted session key from storage (for sending to agent) */
  getSessionAddress: () => Address | null;
  /** Check if session is expiring soon (< 24h) */
  isExpiringSoon: boolean;
}

// ─── Constants ───────────────────────────────────────────────
const SESSION_STORAGE_KEY = 'flowcap_session';
const SESSION_VALIDITY_SECONDS = 7 * 24 * 60 * 60; // 7 days

// ─── Hook ────────────────────────────────────────────────────

export function useSessionKey(): UseSessionKeyReturn {
  const { address, isConnected } = useAccount();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [session, setSession] = useState<SessionKeyState>({
    sessionAddress: null,
    isValid: false,
    validUntil: null,
    remainingSeconds: 0,
    isGenerating: false,
    error: null,
  });

  // Load session from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as {
        sessionAddress: string;
        validUntil: number;
        ownerAddress: string;
      };

      // Verify it belongs to the current wallet
      if (data.ownerAddress?.toLowerCase() !== address?.toLowerCase()) return;

      const now = Math.floor(Date.now() / 1000);
      const isValid = now < data.validUntil;
      const remaining = Math.max(0, data.validUntil - now);

      setSession({
        sessionAddress: data.sessionAddress as Address,
        isValid,
        validUntil: data.validUntil,
        remainingSeconds: remaining,
        isGenerating: false,
        error: isValid ? null : 'Session expired',
      });
    } catch {
      // Corrupted data — ignore
    }
  }, [address]);

  // Countdown timer
  useEffect(() => {
    if (!session.validUntil) return;

    timerRef.current = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, session.validUntil! - now);

      setSession((s) => ({
        ...s,
        remainingSeconds: remaining,
        isValid: remaining > 0,
        error: remaining <= 0 ? 'Session expired' : s.error,
      }));

      if (remaining <= 0 && timerRef.current) {
        clearInterval(timerRef.current);
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session.validUntil]);

  const generateSessionKey = useCallback(
    async (smartAccountAddress: Address): Promise<Address | null> => {
      if (!isConnected || !address) {
        setSession((s) => ({ ...s, error: 'Wallet not connected' }));
        return null;
      }

      setSession((s) => ({ ...s, isGenerating: true, error: null }));

      try {
        // Dynamic import to avoid SSR
        const { generateSessionKey: generate } = await import('@/lib/biconomyClient');
        const riskProfile = (localStorage.getItem('flowcap-risk-profile') || 'low') as 'low' | 'medium' | 'high';
        const result = generate(smartAccountAddress, riskProfile);

        if (!result?.sessionAddress) throw new Error('Failed to generate session key');

        const validUntil = Math.floor(Date.now() / 1000) + SESSION_VALIDITY_SECONDS;

        // Store session info (NOT the private key — that stays encrypted via encryption.ts)
        const sessionData = {
          sessionAddress: result.sessionAddress,
          validUntil,
          ownerAddress: address,
          smartAccountAddress,
          createdAt: Date.now(),
        };

        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));

        setSession({
          sessionAddress: result.sessionAddress as Address,
          isValid: true,
          validUntil,
          remainingSeconds: SESSION_VALIDITY_SECONDS,
          isGenerating: false,
          error: null,
        });

        return result.sessionAddress as Address;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Session key generation failed';
        setSession((s) => ({
          ...s,
          isGenerating: false,
          error: msg,
        }));
        return null;
      }
    },
    [isConnected, address]
  );

  const revokeSessionKey = useCallback(() => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    // Also clear encrypted session key
    try {
      import('@/lib/encryption').then(({ secureClearAll }) => secureClearAll());
    } catch {
      // Ignore
    }

    setSession({
      sessionAddress: null,
      isValid: false,
      validUntil: null,
      remainingSeconds: 0,
      isGenerating: false,
      error: null,
    });
  }, []);

  const getSessionAddress = useCallback((): Address | null => {
    return session.sessionAddress;
  }, [session.sessionAddress]);

  const isExpiringSoon = session.remainingSeconds > 0 && session.remainingSeconds < 86400; // < 24h

  return {
    session,
    generateSessionKey,
    revokeSessionKey,
    getSessionAddress,
    isExpiringSoon,
  };
}

export default useSessionKey;
