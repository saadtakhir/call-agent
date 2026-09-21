"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const COOKIE_NAME = "theme";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Light/dark switch — RootLayout already set the initial data-theme (or
 * left it unset to follow the OS) server-side via the same cookie this
 * writes, so there's no flash of the wrong theme on first paint; this
 * component only needs to handle the click, not the initial render. Reads
 * the CURRENT effective theme from the <html> element itself on mount
 * (rather than assuming "light") so it shows the right icon even when the
 * page loaded following the OS preference with no cookie set at all. */
export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    (async () => {
      const explicit = document.documentElement.getAttribute("data-theme");
      if (explicit === "dark") {
        setIsDark(true);
      } else if (explicit === "light") {
        setIsDark(false);
      } else {
        setIsDark(window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
      }
    })();
  }, []);

  function toggle() {
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    document.cookie = `${COOKIE_NAME}=${next}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
    setIsDark(!isDark);
  }

  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      onClick={toggle}
      aria-label={isDark ? "Yorug' mavzuga o'tish" : "Qorong'i mavzuga o'tish"}
      title={isDark ? "Yorug' mavzu" : "Qorong'i mavzu"}
    >
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
