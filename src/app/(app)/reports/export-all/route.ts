import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { addisToday } from "@/lib/report-range";
import { tenantExportSheets } from "@/lib/tenant-export";
import { buildXlsx } from "@/lib/xlsx";
import { EXPORT_ROW_CAP, exportTenantData } from "@/server/dal/export";

/** Every record of this garage as one Excel workbook. Owner only (checked in the DAL). */
export async function GET() {
  const [result, t, ts, tj, locale] = await Promise.all([
    exportTenantData(),
    getTranslations("export"),
    getTranslations("status"),
    getTranslations("job"),
    getLocale() as Promise<Locale>,
  ]);
  if (!result.ok) {
    return new Response(t("error"), {
      status: result.code === "forbidden" ? 403 : 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }

  const labels = {
    status: (code: string) => (ts.has(code) ? ts(code) : code),
    method: (code: string) => (tj.has(`methods.${code}`) ? tj(`methods.${code}`) : code),
  };
  const sheets = tenantExportSheets(result.data, (key, values) => t(key, values), labels, locale, new Date().toISOString(), EXPORT_ROW_CAP);
  const file = buildXlsx(sheets);

  return new Response(file.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="galmee-garage-all-data-${addisToday()}.xlsx"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
