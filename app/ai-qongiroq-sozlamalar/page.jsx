import SttProviderPanel from "@/components/SttProviderPanel";
import SystemPromptPanel from "@/components/SystemPromptPanel";
import CannedResponsesPanel from "@/components/CannedResponsesPanel";
import MaxConcurrentCallsPanel from "@/components/MaxConcurrentCallsPanel";

export const metadata = { title: "AI qo'ng'iroq sozlamalari | E-Content" };

export default function AiCallSettingsPage() {
  return (
    <div>
      <SttProviderPanel />
      <div style={{ height: 32 }} />
      <MaxConcurrentCallsPanel />
      <div style={{ height: 32 }} />
      <SystemPromptPanel />
      <div style={{ height: 32 }} />
      <CannedResponsesPanel />
    </div>
  );
}
