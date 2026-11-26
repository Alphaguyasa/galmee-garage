/**
 * Galmee kit: a report's tiles as an 80 mm paper summary (the receipt kit's "summary" kind),
 * for owners who staple the day's totals into the old notebook.
 * Copy with `report.ts` and `receipt.ts` unchanged.
 */

import type { PickedPeriod } from "./period-picker";
import type { ReceiptData, ReceiptLang } from "./receipt";
import { formatTile, pickLang, tileValue, type ReportDef, type ReportRow } from "./report";

export function reportSummaryReceipt(
  def: ReportDef,
  period: PickedPeriod,
  rows: ReportRow[],
  tenant: ReceiptData["tenant"],
  lang: string,
): ReceiptData {
  const l: ReceiptLang = lang === "am" || lang === "om" ? lang : "en";
  return {
    tenant,
    no: "",
    kind: "summary",
    lines: def.tiles.map((t) => {
      const value = tileValue(t, rows);
      return t.money
        ? { name: pickLang(t.label, l), total: value }
        : { name: pickLang(t.label, l), total: value, display: formatTile(t, value, l) };
    }),
    totals: { paid: 0, method: "" },
    ethDate: `${pickLang(def.title, l)} · ${period.label}`,
    gregDate: period.fromDay === period.toDay ? period.fromDay : `${period.fromDay} – ${period.toDay}`,
    lang: l,
  };
}
