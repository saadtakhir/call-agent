import { PhoneCall } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import AiCallWidget from "@/components/AiCallWidget";

export const metadata = { title: "AI qo'ng'iroq (test) | E-Content" };

export default function AiCallPage() {
  return (
    <div>
      <PageHeader
        icon={PhoneCall}
        title="AI qo'ng'iroq (test)"
        subtitle="Tajriba uchun: brauzer orqali AI bilan jonli suhbat. Ovoz OpenAI orqali matnga aylantiriladi, javobni AI o'ylab topadi, ElevenLabs uni ovozga aylantirib qaytaradi."
      />
      <AiCallWidget />
    </div>
  );
}
