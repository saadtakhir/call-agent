import "./globals.css";
import { cookies } from "next/headers";
import Sidebar from "@/components/Sidebar";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth";

export const metadata = {
  title: "AI Qo'ng'iroq Agent",
  description: "E-rieltor.uz AI ovozli qo'ng'iroq agenti",
};

export default async function RootLayout({ children }) {
  const cookieStore = await cookies();
  const user = getSessionUser(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  return (
    <html lang="uz">
      <body>
        <div className="app-shell">
          <Sidebar user={user} />
          <main className="container">{children}</main>
        </div>
      </body>
    </html>
  );
}
