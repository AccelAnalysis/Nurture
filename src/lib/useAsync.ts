import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from './errors';
/** Associate results with the request identity so a tenant/account switch never renders stale data. */
export function useAsync<T>(load: () => Promise<T>) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    request: typeof load;
    revision: number;
    data: T | null;
    error: string | null;
  } | null>(null);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    load()
      .then((data) => {
        if (active) setState({ request: load, revision, data, error: null });
      })
      .catch((reason: unknown) => {
        if (active) setState({ request: load, revision, data: null, error: errorMessage(reason) });
      });
    return () => {
      active = false;
    };
  }, [load, revision]);
  const current = state?.request === load && state.revision === revision ? state : null;
  return { data: current?.data ?? null, loading: current === null, error: current?.error ?? null, refresh };
}
