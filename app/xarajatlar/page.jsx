import ProviderUsagePanel from "@/components/ProviderUsagePanel";
import CallUsagePanel from "@/components/CallUsagePanel";

export const metadata = { title: "Xarajatlar | E-Content" };

export default function ExpensesPage() {
  return (
    <div>
      <ProviderUsagePanel />
      <CallUsagePanel />
    </div>
  );
}
