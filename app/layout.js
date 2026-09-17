import "./globals.css";
import Nav from "@/components/Nav";

export const metadata = {
  title: "AI Qo'ng'iroq Agent",
  description: "E-rieltor.uz AI ovozli qo'ng'iroq agenti",
};

export default function RootLayout({ children }) {
  return (
    <html lang="uz">
      <body>
        <Nav />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
