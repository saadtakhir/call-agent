import { Mic, Gauge, Phone, Bot, MessageSquareText, Settings, Send, Wrench, BookOpenText } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import SettingsTabs from "@/components/SettingsTabs";
import SttProviderPanel from "@/components/SttProviderPanel";
import SystemPromptPanel from "@/components/SystemPromptPanel";
import CannedResponsesPanel from "@/components/CannedResponsesPanel";
import MaxConcurrentCallsPanel from "@/components/MaxConcurrentCallsPanel";
import MaxCallDurationPanel from "@/components/MaxCallDurationPanel";
import SipConfigPanel from "@/components/SipConfigPanel";
import TelegramConfigPanel from "@/components/TelegramConfigPanel";
import ToolsPanel from "@/components/ToolsPanel";
import RulesPanel from "@/components/RulesPanel";

export const metadata = { title: "AI qo'ng'iroq sozlamalari | E-Content" };

const TABS = [
  {
    id: "stt",
    title: "Ovoz tanish",
    subtitle: "STT provayder",
    icon: <Mic size={18} />,
    content: <SttProviderPanel />,
  },
  {
    id: "capacity",
    title: "Chegara",
    subtitle: "Bir vaqtdagi suhbatlar",
    icon: <Gauge size={18} />,
    content: (
      <>
        <MaxConcurrentCallsPanel />
        <MaxCallDurationPanel />
      </>
    ),
  },
  {
    id: "sip",
    title: "SIP",
    subtitle: "PBX ulanishi",
    icon: <Phone size={18} />,
    content: <SipConfigPanel />,
  },
  {
    id: "telegram",
    title: "Telegram",
    subtitle: "Support bot",
    icon: <Send size={18} />,
    content: <TelegramConfigPanel />,
  },
  {
    id: "prompt",
    title: "AI xulqi",
    subtitle: "System Message",
    icon: <Bot size={18} />,
    content: <SystemPromptPanel />,
  },
  {
    id: "tools",
    title: "Toollar",
    subtitle: "AI funksiyalari",
    icon: <Wrench size={18} />,
    content: <ToolsPanel />,
  },
  {
    id: "rules",
    title: "Qoidalar",
    subtitle: "Faqat ko'rish uchun",
    icon: <BookOpenText size={18} />,
    content: <RulesPanel />,
  },
  {
    id: "canned",
    title: "Tayyor javoblar",
    subtitle: "Ovozli shablonlar",
    icon: <MessageSquareText size={18} />,
    content: <CannedResponsesPanel />,
  },
];

export default function AiCallSettingsPage() {
  return (
    <div>
      <PageHeader icon={Settings} title="Sozlamalar" subtitle="AI qo'ng'iroq agenti uchun barcha sozlamalar." />
      <SettingsTabs tabs={TABS} />
    </div>
  );
}
