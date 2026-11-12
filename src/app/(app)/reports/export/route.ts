import { addisToday, parseReportRange, reportRangeDates } from "@/lib/report-range";
import { dailyReport } from "@/server/dal/garage";
import { getSession } from "@/server/dal/session";

export async function GET(request: Request) {
  const { profile } = await getSession();
  if (profile.role === "staff") return new Response("Forbidden", { status: 403 });

  const range = parseReportRange(new URL(request.url).searchParams.get("range"));
  const { from, to } = reportRangeDates(range, addisToday());
  const rows = await dailyReport(from, to);

  // Every value is a date or a number from the report, so nothing needs quoting.
  const lines = [
    "date,jobs_delivered,labour,parts,collected",
    ...rows.map((d) => [d.day, d.jobsDelivered, d.labour.toFixed(2), d.parts.toFixed(2), d.collected.toFixed(2)].join(",")),
  ];
  return new Response(`${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="garage-report-${from}-to-${to}.csv"`,
    },
  });
}
