import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { StaffScreen } from "@/components/staff/staff-screen";
import { getSession } from "@/server/dal/session";
import { getStaffOverview } from "@/server/dal/staff";

export default async function StaffPage() {
  const session = await getSession();
  if (session.profile.role !== "owner" && session.profile.role !== "manager") redirect("/");
  const [{ members, invites }, locale] = await Promise.all([getStaffOverview(), getLocale()]);

  return (
    <StaffScreen
      lang={locale}
      business={session.tenant.name}
      myRole={session.profile.role}
      myUserId={session.userId}
      members={members}
      invites={invites}
    />
  );
}
