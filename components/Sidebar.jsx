"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PhoneCall, Settings, Users, LogOut } from "lucide-react";

const LINKS = [
  { href: "/ai-qongiroq", label: "Suhbat", icon: PhoneCall, permission: "view_call" },
  { href: "/ai-qongiroq-sozlamalar", label: "Sozlamalar", icon: Settings, permission: "manage_settings" },
  { href: "/foydalanuvchilar", label: "Foydalanuvchilar", icon: Users, permission: "manage_users" },
];

/** Left-hand nav — only shows links this signed-in user's permissions
 * actually unlock (see lib/auth.js's PERMISSIONS), since proxy.js would
 * bounce them right back out of anything else anyway. `user` comes from
 * RootLayout (a server component reading the session cookie via
 * next/headers), not fetched client-side, so there's no flash of the wrong
 * link set before permissions are known. */
export default function Sidebar({ user }) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/login" || !user) return null;

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const links = LINKS.filter((link) => user.permissions.includes(link.permission));

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">AI Qo&apos;ng&apos;iroq Agent</div>
      <nav className="sidebar-nav">
        {links.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={pathname === href ? "active" : ""}>
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
  );
}
