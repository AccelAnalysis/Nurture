import { createContext, useCallback, useContext, useEffect, type PropsWithChildren } from 'react';
import { useAuth } from './AuthProvider';
import { userService } from '../services/userService';
import { useAsync } from '../lib/useAsync';
import type { UserProfile } from '../domain/identity';
const Context = createContext<{
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} | null>(null);
export function CurrentUserProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const load = useCallback(
    () => (user && !user.isAnonymous ? userService.get(user.uid) : Promise.resolve(null)),
    [user?.uid, user?.isAnonymous],
  );
  const result = useAsync(load);
  const profile = user && !user.isAnonymous ? result.data : null;
  useEffect(() => {
    document.documentElement.dataset.theme = profile?.preferences.theme ?? 'system';
  }, [profile?.preferences.theme]);
  return (
    <Context.Provider
      value={{ profile, loading: result.loading, error: result.error, refresh: result.refresh }}
    >
      {children}
    </Context.Provider>
  );
}
export function useCurrentUser() {
  const value = useContext(Context);
  if (!value) throw new Error('CurrentUserProvider is required.');
  return value;
}
