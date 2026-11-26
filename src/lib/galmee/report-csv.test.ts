import { describe, expect, it } from "vitest";
import { ROW_CAP, type ReportColumn, type ReportRow } from "./report";
import { csvField, csvFilename, reportCsv } from "./report-csv";

const columns: ReportColumn[] = [
  { key: "created_at", label: { en: "Date", am: "ቀን", om: "Guyyaa" }, eth_date: true },
  { key: "customer", label: { en: "Customer", am: "ደንበኛ", om: "Maamila" } },
  { key: "owed", label: { en: "Credit owed", am: "ዱቤ", om: "Liqii" }, money: true },
];
const rows: ReportRow[] = [
  { created_at: "2026-11-24T21:30:00Z", customer: "Abebe, Kebede", owed: "1250.50" },
  { created_at: "2026-11-10", customer: '=HYPERLINK("x")', owed: 0 },
  { created_at: null, customer: null, owed: null },
];

/** A small RFC 4180 reader, enough to check the file reads back. */
function parse(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r" && text[i + 1] === "\n") {
      row.push(field);
      out.push(row);
      row = [];
      field = "";
      i++;
    } else field += ch;
  }
  return out;
}

describe("reportCsv", () => {
  it("starts with a UTF-8 BOM and ends every line with CRLF", () => {
    const { text } = reportCsv(rows, columns, "am");
    const bytes = new TextEncoder().encode(text);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(text.endsWith("\r\n")).toBe(true);
    expect(text.slice(1).split("\r\n")).toHaveLength(rows.length + 2);
    expect(/[^\r]\n/.test(text)).toBe(false);
  });

  it("keeps the Amharic header (ዱቤ) and the values through a round trip", () => {
    const back = parse(reportCsv(rows, columns, "am").text.slice(1));
    expect(back[0]).toEqual(["ቀን", "ቀን (ዓ.ም.)", "ደንበኛ", "ዱቤ"]);
    expect(back[1]).toEqual(["2026-11-25", "ኅዳር 16, 2019", "Abebe, Kebede", "1250.5"]);
    expect(back[2]).toEqual(["2026-11-10", "ኅዳር 1, 2019", `'=HYPERLINK("x")`, "0"]);
    expect(back[3]).toEqual(["", "", "", ""]);
  });

  it("writes numbers without thousands separators", () => {
    const { text } = reportCsv([{ created_at: "2026-11-10", customer: "x", owed: 1234567.5 }], columns, "en");
    expect(text).toContain(",1234567.5\r\n");
    expect(text).toContain("Date,Date (E.C.),Customer,Credit owed");
  });

  it("10,001 rows: keeps 10,000 and says it was cut", () => {
    const many = Array.from({ length: ROW_CAP + 1 }, (_, i) => ({ created_at: "2026-11-10", customer: `c${i}`, owed: i }));
    const csv = reportCsv(many, columns, "om");
    expect(csv).toMatchObject({ rows: ROW_CAP, truncated: true });
    expect(csv.text.slice(1).split("\r\n")).toHaveLength(ROW_CAP + 2);
    expect(reportCsv(many.slice(0, ROW_CAP), columns, "om").truncated).toBe(false);
  });
});

describe("helpers", () => {
  it("quotes and neutralises fields", () => {
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("-5")).toBe("'-5");
    expect(csvField(-5)).toBe("-5");
    expect(csvField(NaN)).toBe("");
  });
  it("names files from the period", () => {
    expect(csvFilename("Galmee Pharmacy-sales", { fromDay: "2026-11-10", toDay: "2026-11-25" })).toBe("galmee-pharmacy-sales-2026-11-10_2026-11-25.csv");
    expect(csvFilename("ሽያጭ", { fromDay: "2026-11-25", toDay: "2026-11-25" })).toBe("report-2026-11-25.csv");
  });
});
