/** Local dismiss state for a message owned elsewhere (e.g. the editor's
 * "Draft v2" banner or save error). A dismissed message stays hidden until a
 * different one arrives, or until the owner clears it and sets it again. */

import { useCallback, useEffect, useState } from 'react';

export function useDismissable(message: string | null): [string | null, () => void] {
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    if (message === null) setDismissed(null);
  }, [message]);

  const dismiss = useCallback((): void => setDismissed(message), [message]);
  const visible = message !== null && message !== dismissed ? message : null;
  return [visible, dismiss];
}
