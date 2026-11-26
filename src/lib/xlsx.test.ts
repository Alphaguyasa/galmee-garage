import { describe, expect, it } from "vitest";
import { buildXlsx, columnName, crc32, sheetNames, xmlText } from "./xlsx";

const decoder = new TextDecoder();

/** Reads a stored zip back: checks every local header against the central directory and the CRC. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const offset = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    expect(view.getUint32(offset, true)).toBe(0x04034b50);
    expect(view.getUint16(offset + 8, true)).toBe(0); // stored
    const localNameLen = view.getUint16(offset + 26, true);
    const data = bytes.subarray(offset + 30 + localNameLen, offset + 30 + localNameLen + size);
    expect(crc32(data)).toBe(crc);
    files.set(name, decoder.decode(data));
    at += 46 + nameLen;
  }
  return files;
}

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("columnName", () => {
  it("counts like Excel", () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  });
});

describe("sheetNames", () => {
  it("removes forbidden characters, trims to 31 and keeps names unique", () => {
    const long = "ሽያጭ".repeat(20);
    const names = sheetNames(["Sales/Returns", "sales returns", long, long, "  ", "[x]"]);
    expect(names[0]).toBe("Sales Returns");
    expect(names[1]).toBe("sales returns (2)");
    expect(names[2]).toHaveLength(31);
    expect(names[3]).toHaveLength(31);
    expect(names[3].endsWith(" (2)")).toBe(true);
    expect(names[4]).toBe("Sheet5");
    expect(names[5]).toBe("x");
  });
});

describe("xmlText", () => {
  it("escapes markup and drops characters XML cannot hold", () => {
    expect(xmlText(`<a href="x">&</a>\u0001\u0007ok`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;ok");
    expect(xmlText("ፓራሲታሞል 500 mg")).toBe("ፓራሲታሞል 500 mg");
  });
});

describe("buildXlsx", () => {
  const file = buildXlsx([
    { name: "Medicines", rows: [["Name", "Price", "Note"], ["Paracetamol", 12.5, "=HYPERLINK(\"x\")"], ["ORS", 8, null]] },
    { name: "Empty", rows: [] },
  ]);
  const parts = unzip(file);

  it("has the parts a spreadsheet program needs", () => {
    expect([...parts.keys()]).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]);
    expect(parts.get("xl/workbook.xml")).toContain('<sheet name="Medicines" sheetId="1" r:id="rId1"/>');
    expect(parts.get("xl/_rels/workbook.xml.rels")).toContain('Id="rId3"');
    expect(parts.get("[Content_Types].xml")).toContain("/xl/worksheets/sheet2.xml");
  });

  it("writes numbers as numbers, text as inline text and never a formula", () => {
    const sheet = parts.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain('<c r="B2"><v>12.5</v></c>');
    expect(sheet).toContain('<c r="C2" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;x&quot;)</t></is></c>');
    expect(sheet).not.toContain("<f>");
    expect(sheet).not.toContain('r="C3"'); // empty cell left out
  });

  it("makes the header bold and frozen", () => {
    const sheet = parts.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr">');
    expect(sheet).toContain('state="frozen"');
    expect(parts.get("xl/worksheets/sheet2.xml")).not.toContain("frozen");
  });

  it("gives the same bytes for the same data", () => {
    const again = buildXlsx([
      { name: "Medicines", rows: [["Name", "Price", "Note"], ["Paracetamol", 12.5, "=HYPERLINK(\"x\")"], ["ORS", 8, null]] },
      { name: "Empty", rows: [] },
    ]);
    expect(again).toEqual(file);
  });

  it("refuses a workbook without sheets", () => {
    expect(() => buildXlsx([])).toThrow("no_sheets");
  });
});
