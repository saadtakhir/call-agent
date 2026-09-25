import { BookOpenText } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import RulesPanel from "@/components/RulesPanel";

export const metadata = { title: "Qoidalar | E-Content" };

// Read-only reference — see lib/rulesCatalog.js. No permission entry in
// proxy.js's PATH_PERMISSIONS on purpose: it changes nothing and reveals no
// data, so any signed-in user may open it.
export default function RulesPage() {
  return (
    <div>
      <PageHeader icon={BookOpenText} title="Qoidalar" subtitle="Tizim matn va raqamlar bilan ishlashda qo'llaydigan barcha qoidalar (faqat ko'rish uchun)." />
      <RulesPanel />
    </div>
  );
}
