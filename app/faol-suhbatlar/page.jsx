import { Activity } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ActiveCallsPanel from "@/components/ActiveCallsPanel";

export const metadata = { title: "Faol suhbatlar | E-Content" };

export default function ActiveCallsPage() {
  return (
    <div>
      <PageHeader
        icon={Activity}
        title="Faol suhbatlar"
        subtitle="Hozir ketayotgan AI qo'ng'iroqlar — ro'yxat mazmuni (nima gaplashilayotgani) ko'rsatilmaydi, faqat qaysi suhbatlar band ekani."
      />
      <ActiveCallsPanel />
    </div>
  );
}
