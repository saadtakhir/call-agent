import { cookies } from "next/headers";
import { History } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import CallHistoryPanel from "@/components/CallHistoryPanel";
import { getSessionUser, hasPermission, PERMISSIONS, SESSION_COOKIE_NAME } from "@/lib/auth";

export const metadata = { title: "Qo'ng'iroqlar tarixi | E-Content" };

export default async function CallHistoryPage() {
  // Deleting a history row is its own permission (delete_call_history) — the
  // button is hidden without it, and proxy.js refuses the DELETE request too.
  const cookieStore = await cookies();
  const user = getSessionUser(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const canDelete = hasPermission(user, PERMISSIONS.DELETE_CALL_HISTORY);

  return (
    <div>
      <PageHeader
        icon={History}
        title="Qo'ng'iroqlar tarixi"
        subtitle="Barcha vaqtdagi qo'ng'iroqlar — brauzer va SIP orqali kelganlarning barchasi."
      />
      <CallHistoryPanel canDelete={canDelete} />
    </div>
  );
}
