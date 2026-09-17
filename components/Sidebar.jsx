"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, PhoneCall, Settings, Users, LogOut } from "lucide-react";

const LINKS = [
  { href: "/ai-qongiroq", label: "Suhbat", icon: PhoneCall, permission: "view_call" },
  { href: "/ai-qongiroq-sozlamalar", label: "Sozlamalar", icon: Settings, permission: "manage_settings" },
  { href: "/foydalanuvchilar", label: "Foydalanuvchilar", icon: Users, permission: "manage_users" },
];

/** Nav — a permanent left column on desktop, an off-canvas drawer opened
 * from a slim top bar on mobile (see the min-width:768px block in
 * globals.css). Only shows links this signed-in user's permissions
 * actually unlock (see lib/auth.js's PERMISSIONS), since proxy.js would
 * bounce them right back out of anything else anyway. `user` comes from
 * RootLayout (a server component reading the session cookie via
 * next/headers), not fetched client-side, so there's no flash of the wrong
 * link set before permissions are known. */
export default function Sidebar({ user }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (pathname === "/login" || !user) return null;

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const links = LINKS.filter((link) => user.permissions.includes(link.permission));

  return (
    <>
      <div className="mobile-topbar">
        <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Menyu">
          <Menu size={20} />
        </button>
        <div className="mobile-topbar-brand">AI Qo&apos;ng&apos;iroq Agent</div>
      </div>

      {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}

      <aside className={`sidebar${open ? " open" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">AI Qo&apos;ng&apos;iroq Agent</div>
          <button className="icon-btn sidebar-close" onClick={() => setOpen(false)} aria-label="Yopish">
            <X size={18} />
          </button>
        </div>
        <nav className="sidebar-nav">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={pathname === href ? "active" : ""} onClick={() => setOpen(false)}>
              <Icon size={15} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="muted" style={{ fontSize: "0.8rem", padding: "0 10px 10px" }}>
            {user.username}
          </div>
          <button className="btn btn-outline" style={{ width: "100%" }} onClick={handleLogout}>
            <LogOut size={14} />
            Chiqish
          </button>
        </div>
      </aside>
    </>
  );
}
