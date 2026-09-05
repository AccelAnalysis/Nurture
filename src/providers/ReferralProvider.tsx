import { createContext, useCallback, useContext, useState, type PropsWithChildren } from 'react';
import type { Attribution } from '../domain/identity';
import { createAttribution } from '../domain/validation';
import { readSession, writeSession } from '../lib/storage';
const key = 'nurture:pending-referral:v1';
function valid(value: unknown): value is Attribution {
  return (
    !!value &&
    typeof value === 'object' &&
    'referralCode' in value &&
    typeof value.referralCode === 'string' &&
    /^[A-Za-z0-9_-]{3,64}$/.test(value.referralCode) &&
    'expiresAt' in value &&
    typeof value.expiresAt === 'string' &&
    Date.parse(value.expiresAt) > Date.now() &&
    'verification' in value &&
    value.verification === 'pending'
  );
}
const Context = createContext<{
  attribution: Attribution | null;
  capture: (code: string, source?: string, campaign?: string) => void;
  clear: () => void;
} | null>(null);
export function ReferralProvider({ children }: PropsWithChildren) {
  const [attribution, setAttribution] = useState(() => readSession(key, valid));
  const capture = useCallback((code: string, source?: string, campaign?: string) => {
    setAttribution((previous) => {
      if (previous && Date.parse(previous.expiresAt) > Date.now()) return previous;
      const next = createAttribution(code, source, campaign);
      if (next) writeSession(key, next);
      return next;
    });
  }, []);
  function clear() {
    setAttribution(null);
    writeSession(key, null);
  }
  return <Context.Provider value={{ attribution, capture, clear }}>{children}</Context.Provider>;
}
export function useReferral() {
  const value = useContext(Context);
  if (!value) throw new Error('ReferralProvider is required.');
  return value;
}
