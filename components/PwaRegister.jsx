"use client";

import { useEffect } from "react";

/** Registers public/sw.js once on mount — a bare presence check, not
 * feature detection for anything the app actually uses, so any failure
 * here is silently ignored rather than surfaced to the user. */
export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
