/**
 * Galmee kit: CSV export for reports, made to open in Excel with Amharic intact.
 *
 * UTF-8 with BOM, CRLF line ends, commas; numbers unformatted (no thousands separators);
 * a date column becomes two: 'yyyy-mm-dd' and the Ethiopian date. Text a spreadsheet would
 * run as a formula is made inert. At most ROW_CAP rows.
 * Copy with `report.ts` and `eth-calendar.ts` unchanged.
 */

import { formatEthDay, type EthLang } from "./eth-calendar";
import { dayOf, pickLang, ROW_CAP, toNumber, type ReportColumn, type ReportRow } from "./report";

const ETH_SUFFIX: Record<EthLang, string> = { en: "(E.C.)", am: "(ዓ.ም.)", om: "(ALI)" };

/** One CSV field: quoted when needed; leading = + - @ tab or CR gets a ' so it stays text. */
export function csvField(value: string | number): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export type ReportCsv = { text: string; rows: number; truncated: boolean };

/** The CSV text for report rows. */
export function reportCsv(rows: ReportRow[], columns: ReportColumn[], lang: string): ReportCsv {
  const l: EthLang = lang === "am" || lang === "om" ? lang : "en";
  const header: string[] = [];
  for (const c of columns) {
    const label = pickLang(c.label, l);
    header.push(label);
    if (c.eth_date) header.push(`${label} ${ETH_SUFFIX[l]}`);
  }
  const kept = rows.slice(0, ROW_CAP);
  const lines = [header.map(csvField).join(",")];
  for (const r of kept) {
    const out: (string | number)[] = [];
    for (const c of columns) {
      const v = r[c.key];
      if (c.eth_date) {
        const day = dayOf(v);
        out.push(day, day ? formatEthDay(day, l, false) : "");
      } else if (v === null || v === undefined) {
        out.push("");
      } else if (c.money || typeof v === "number") {
        out.push(toNumber(v));
      } else {
        out.push(String(v));
      }
    }
    lines.push(out.map(csvField).join(","));
  }
  return { text: "﻿" + lines.join("\r\n") + "\r\n", rows: kept.length, truncated: rows.length > ROW_CAP };
}

/** "galmee-sales-2026-11-10_2026-11-25.csv": safe characters only. */
export function csvFilename(base: string, period: { fromDay: string; toDay: string }): string {
  const safe = base.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "report";
  return period.fromDay === period.toDay ? `${safe}-${period.fromDay}.csv` : `${safe}-${period.fromDay}_${period.toDay}.csv`;
}

/** Saves the CSV as a file download. */
export function downloadCsv(csv: ReportCsv, filename: string): void {
  const blob = new Blob([csv.text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
