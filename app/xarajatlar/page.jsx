import { Wallet } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ProviderUsagePanel from "@/components/ProviderUsagePanel";
import CallUsagePanel from "@/components/CallUsagePanel";

export const metadata = { title: "Xarajatlar | E-Content" };

export default function ExpensesPage() {
  return (
    <div>
      <PageHeader icon={Wallet} title="Xarajatlar" subtitle="Provayder balanslari va bizning qo'ng'iroqlarimiz bo'yicha xarajat hisobi." />
      <ProviderUsagePanel />
      <CallUsagePanel />
    </div>
  );
}
