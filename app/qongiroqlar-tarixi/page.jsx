import { History } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import CallHistoryPanel from "@/components/CallHistoryPanel";

export const metadata = { title: "Qo'ng'iroqlar tarixi | E-Content" };

export default function CallHistoryPage() {
  return (
    <div>
      <PageHeader
        icon={History}
        title="Qo'ng'iroqlar tarixi"
        subtitle="Barcha vaqtdagi qo'ng'iroqlar — brauzer va SIP orqali kelganlarning barchasi."
      />
      <CallHistoryPanel />
    </div>
  );
}
