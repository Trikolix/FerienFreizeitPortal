import { useRef, useState } from 'react';

export function useAction(onError: (message: string) => void) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const runAction = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try { await action(); }
    catch (error) { onError(error instanceof Error ? error.message : 'Die Aktion ist fehlgeschlagen. Bitte versuche es erneut.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return { busy, runAction };
}
