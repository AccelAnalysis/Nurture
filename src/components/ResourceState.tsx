import type { ReactNode } from 'react';
import { ErrorState, LoadingState } from './ui';
export function ResourceState<T>({
  result,
  children,
}: {
  result: { data: T | null; loading: boolean; error: string | null; refresh: () => void };
  children: (data: T) => ReactNode;
}) {
  if (result.loading) return <LoadingState />;
  if (result.error) return <ErrorState message={result.error} retry={result.refresh} />;
  if (result.data === null)
    return <ErrorState message="This item is unavailable or you do not have access to it." />;
  return children(result.data);
}
