import { useState } from 'react';
import { errorMessage } from './errors';
export function useAction() {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<unknown>, success = 'Saved.'): Promise<boolean> {
    if (working) return false;
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
      return true;
    } catch (reason) {
      setError(errorMessage(reason));
      return false;
    } finally {
      setWorking(false);
    }
  }
  return { working, message, error, run };
}
