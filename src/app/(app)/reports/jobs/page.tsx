import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { JobReportsView } from "@/components/garage/job-reports-view";
import { addisToday } from "@/lib/report-range";
import { getSession } from "@/server/dal/session";

/** Jobs closed and job payments by Ethiopian period, with CSV. Owner and manager only. */
export default async function JobReportsPage() {
  const { profile } = await getSession();
  if (profile.role === "staff") redirect("/");
  const locale = await getLocale();
  return <JobReportsView lang={locale} today={addisToday()} />;
}
