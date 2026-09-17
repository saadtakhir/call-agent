"use client";

import { useCallback, useRef, useState } from "react";

/** In-app replacement for window.confirm() — same call shape (await it,
 * true/false), but rendered with the app's own styling instead of the
 * browser's native dialog. Usage:
 *   const { confirm, dialog } = useConfirm();
 *   if (!(await confirm("..."))) return;
 *   return <div>{dialog}...</div>
 */
export function useConfirm() {
  const [message, setMessage] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((msg) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setMessage(msg);
    });
  }, []);

  function settle(result) {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setMessage(null);
  }

  const dialog = message ? (
    <div className="confirm-overlay" onClick={() => settle(false)}>
      <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="btn btn-outline" onClick={() => settle(false)}>
            Yo&apos;q
          </button>
          <button className="btn btn-green" onClick={() => settle(true)} autoFocus>
            Ha
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}
