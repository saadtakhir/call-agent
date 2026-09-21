import { Users } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import UsersPanel from "@/components/UsersPanel";
import LoginAttemptsPanel from "@/components/LoginAttemptsPanel";

export const metadata = { title: "Foydalanuvchilar | E-Content" };

export default function UsersPage() {
  return (
    <div>
      <PageHeader
        icon={Users}
        title="Foydalanuvchilar"
        subtitle="Har bir foydalanuvchi faqat o'ziga ruxsat berilgan bo'limlarni ko'radi."
      />
      <UsersPanel />
      <LoginAttemptsPanel />
    </div>
  );
}
