import "./globals.css";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import Sidebar from "@/components/Sidebar";
import PwaRegister from "@/components/PwaRegister";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth";

// next/font self-hosts the font file (no external request at runtime),
// which is also why this needs no font-src addition to proxy.js's CSP —
// it's served from this same origin like any other static asset.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata = {
  title: "AI Qo'ng'iroq Agent",
  description: "E-rieltor.uz AI ovozli qo'ng'iroq agenti",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "AI Qo'ng'iroq" },
};

// A function (not the static object this used to be) so it can read the
// same "theme" cookie ThemeToggle writes and match the PWA/browser-chrome
// color to whichever theme is about to paint — otherwise a dark-mode user
// would see an indigo (light-theme) status bar flash against the dark page.
export async function generateViewport() {
  const cookieStore = await cookies();
  const isDark = cookieStore.get("theme")?.value === "dark";
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: isDark ? "#0c0d13" : "#5b5ff5",
  };
}

export default async function RootLayout({ children }) {
  const cookieStore = await cookies();
  const user = getSessionUser(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  // No cookie yet (first visit, no explicit choice made) → omit data-theme
  // entirely so globals.css's @media (prefers-color-scheme) block decides;
  // an explicit cookie (set by ThemeToggle) always overrides that.
  const theme = cookieStore.get("theme")?.value;
  const dataTheme = theme === "light" || theme === "dark" ? theme : undefined;

  return (
    <html lang="uz" data-theme={dataTheme}>
      <body>
        <PwaRegister />
        <div className="app-shell">
          <Sidebar user={user} />
          <main className="container">{children}</main>
        </div>
      </body>
    </html>
  );
}
