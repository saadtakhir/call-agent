import UsersPanel from "@/components/UsersPanel";
import LoginAttemptsPanel from "@/components/LoginAttemptsPanel";

export const metadata = { title: "Foydalanuvchilar | E-Content" };

export default function UsersPage() {
  return (
    <div>
      <UsersPanel />
      <LoginAttemptsPanel />
    </div>
  );
}
