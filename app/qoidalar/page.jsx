import { BookOpenText } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import RulesPanel from "@/components/RulesPanel";

export const metadata = { title: "Qoidalar | E-Content" };

// Read-only reference — see lib/rulesCatalog.js. Gated by the view_rules
// permission (proxy.js), assigned per user on the Foydalanuvchilar page.
export default function RulesPage() {
  return (
    <div>
      <PageHeader icon={BookOpenText} title="Qoidalar" subtitle="Tizim matn va raqamlar bilan ishlashda qo'llaydigan barcha qoidalar (faqat ko'rish uchun)." />
      <RulesPanel />
    </div>
  );
}
