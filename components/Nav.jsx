"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PhoneCall, Settings, LogOut } from "lucide-react";

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/login") return null;

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="topbar">
      <div className="topbar-brand">AI Qo&apos;ng&apos;iroq Agent</div>
      <nav className="topbar-nav">
        <Link href="/ai-qongiroq" className={pathname === "/ai-qongiroq" ? "active" : ""}>
          <PhoneCall size={15} />
          Suhbat
        </Link>
        <Link href="/ai-qongiroq-sozlamalar" className={pathname === "/ai-qongiroq-sozlamalar" ? "active" : ""}>
          <Settings size={15} />
          Sozlamalar
        </Link>
      </nav>
      <button className="btn btn-outline" onClick={handleLogout}>
        <LogOut size={14} />
        Chiqish
      </button>
    </header>
  );
}
