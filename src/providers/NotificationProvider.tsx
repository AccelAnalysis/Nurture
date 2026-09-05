import { createContext, useCallback, useContext, type PropsWithChildren } from 'react';
import type { AppNotification } from '../domain/feedback';
import { notificationService } from '../services/lifecycleServices';
import { useAsync } from '../lib/useAsync';
import { useAuth } from './AuthProvider';
const Context = createContext<{
  notifications: AppNotification[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
} | null>(null);
export function NotificationProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const load = useCallback(
    () => (user && !user.isAnonymous ? notificationService.list(user.uid) : Promise.resolve([])),
    [user?.uid, user?.isAnonymous],
  );
  const result = useAsync(load);
  return (
    <Context.Provider
      value={{
        notifications: user && !result.loading ? (result.data ?? []) : [],
        loading: result.loading,
        error: result.error,
        refresh: result.refresh,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useNotifications() {
  const value = useContext(Context);
  if (!value) throw new Error('NotificationProvider is required.');
  return value;
}
