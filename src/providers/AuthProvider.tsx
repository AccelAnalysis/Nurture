import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import type { AuthIdentity } from '../domain/identity';
import { authService } from '../services/authService';
import { errorMessage } from '../lib/errors';
type AuthState = {
  user: AuthIdentity | null;
  status: 'loading' | 'authenticated' | 'anonymous' | 'unauthenticated' | 'error';
  error: string | null;
  refresh: () => Promise<void>;
};
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthIdentity | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  function receive(next: AuthIdentity | null) {
    setUser(next);
    setError(null);
    setStatus(next ? (next.isAnonymous ? 'anonymous' : 'authenticated') : 'unauthenticated');
  }
  useEffect(
    () =>
      authService.observe(receive, (reason) => {
        setUser(null);
        setError(errorMessage(reason));
        setStatus('error');
      }),
    [],
  );
  async function refresh() {
    receive(await authService.refreshIdentity());
  }
  return <AuthContext.Provider value={{ user, status, error, refresh }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is required.');
  return value;
}
