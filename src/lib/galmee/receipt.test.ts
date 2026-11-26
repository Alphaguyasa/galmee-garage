import { describe, expect, it } from "vitest";
import {
  layoutText,
  receiptModel,
  receiptStrings,
  renderTelegramText,
  TELEGRAM_RECEIPT_MAX,
  wrapText,
  type ReceiptData,
} from "./receipt";

const sale: ReceiptData = {
  tenant: { name: "Abebe Pharmacy", phone: "0911 000 000", townLine: "Adama, Kebele 04" },
  no: "PH-000123",
  kind: "sale",
  lines: [
    { name: "Amoxicillin 500 mg capsules (box of 20)", qty: 2, unit: "box", price: 180, total: 360 },
    { name: "Paracetamol 500 mg", qty: 10, price: 2.5, total: 25 },
    { name: "Consultation", total: 50 },
  ],
  totals: { due: 435, paid: 500, method: "cash" },
  ethDate: "Hidar 12, 2019",
  gregDate: "21 Nov 2026",
  lang: "en",
};

describe("wrapText", () => {
  it("breaks at spaces and keeps every line within the width", () => {
    const lines = wrapText("Amoxicillin 500 mg capsules (box of 20)", 32);
    expect(lines).toEqual(["Amoxicillin 500 mg capsules (box", "of 20)"]);
    expect(lines.every((l) => l.length <= 32)).toBe(true);
    expect(lines.join(" ")).toBe("Amoxicillin 500 mg capsules (box of 20)");
  });
  it("splits a word longer than the line", () => {
    expect(wrapText("x".repeat(70), 32)).toEqual(["x".repeat(32), "x".repeat(32), "x".repeat(6)]);
  });
  it("counts Ethiopic characters one each", () => {
    expect(wrapText("ፓራሲታሞል ".repeat(6).trim(), 16).every((l) => Array.from(l).length <= 16)).toBe(true);
  });
});

describe("layoutText", () => {
  it("58 mm: 32 characters a line, amounts right-aligned", () => {
    const lines = layoutText(sale, 58);
    expect(lines.every((l) => Array.from(l).length <= 32)).toBe(true);
    expect(lines).toContain("  2 box × 180.00          360.00");
    expect(lines).toContain("Consultation               50.00");
    expect(lines).toContain("Total                 435.00 ETB");
    expect(lines).toContain("Change                     65.00");
    for (const amount of ["360.00", "25.00", "50.00", "435.00 ETB", "500.00"]) {
      const row = lines.find((l) => l.endsWith(amount));
      expect(row, amount).toBeDefined();
      expect(Array.from(row!).length).toBe(32);
    }
  });
  it("80 mm: 48 characters, quantity × price on the item line", () => {
    const lines = layoutText(sale, 80);
    expect(lines.every((l) => Array.from(l).length <= 48)).toBe(true);
    expect(lines).toContain("Paracetamol 500 mg         10 × 2.50       25.00");
    expect(lines).toContain("Amoxicillin 500 mg    2 box × 180.00      360.00");
    expect(lines).toContain("capsules (box of 20)");
  });
  it("matches the 58 mm fixture", () => {
    expect(layoutText(sale, 58).join("\n")).toMatchInlineSnapshot(`
      "         Abebe Pharmacy
              Adama, Kebele 04
              Tel 0911 000 000
               Sales receipt
      --------------------------------
      Receipt no.            PH-000123
      Hidar 12, 2019     (21 Nov 2026)
      --------------------------------
      Amoxicillin 500 mg capsules (box
      of 20)
        2 box × 180.00          360.00
      Paracetamol 500 mg
        10 × 2.50                25.00
      Consultation               50.00
      --------------------------------
      Total                 435.00 ETB
      Paid                      500.00
      Method                      Cash
      Change                     65.00
      --------------------------------
                 Thank you
             Galmee · PH-000123"
    `);
  });
});

describe("languages", () => {
  it("Amharic labels and methods; numbers stay Western digits", () => {
    const m = receiptModel({ ...sale, lang: "am", totals: { due: 435, paid: 200, method: "credit", balanceAfter: 235 } });
    expect(m.title).toBe("የሽያጭ ደረሰኝ");
    expect(m.totals.map((t) => `${t.label}: ${t.value}`)).toEqual([
      "ጠቅላላ: 435.00 ብር",
      "የተከፈለ: 200.00",
      "የክፍያ ዘዴ: ዱቤ",
      "ቀሪ ዱቤ: 235.00 ብር",
    ]);
    expect(m.footer).toEqual(["እናመሰግናለን", "ገልሜ · PH-000123"]);
  });
  it("Afaan Oromo title", () => {
    expect(receiptModel({ ...sale, lang: "om", kind: "repayment" }).title).toBe("Nagahee kaffaltii liqii");
  });
  it("unknown language falls back to English", () => {
    expect(receiptStrings("fr").title.sale).toBe("Sales receipt");
    expect(receiptModel({ ...sale, lang: "fr" as never }).totals[0].label).toBe("Total");
  });
  it("an unknown method code prints as given", () => {
    expect(receiptModel({ ...sale, totals: { due: 435, paid: 435, method: "Awash Birr" } }).totals.at(-1)?.value).toBe("Awash Birr");
  });
});

describe("renderTelegramText", () => {
  it("shows the same totals as the paper, in the same order", () => {
    const text = renderTelegramText(sale);
    const paper = receiptModel(sale).totals.map((t) => `${t.label}: ${t.value}`);
    const positions = paper.map((p) => text.indexOf(p));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(text).toContain("2 box × 180.00 = 360.00");
    expect(text.endsWith("— Abebe Pharmacy · Galmee")).toBe(true);
  });
  it("escapes HTML in names", () => {
    const text = renderTelegramText({ ...sale, tenant: { name: "A&B <Pharmacy>" } });
    expect(text).toContain("— A&amp;B &lt;Pharmacy&gt; · Galmee");
    expect(text).not.toContain("<Pharmacy>");
  });
  it("stays under the cap by dropping item lines, never totals", () => {
    const many: ReceiptData = {
      ...sale,
      lines: Array.from({ length: 300 }, (_, i) => ({ name: `Item number ${i} with a long name`, qty: 1, price: 10, total: 10 })),
      totals: { due: 3000, paid: 3000, method: "telebirr" },
    };
    const text = renderTelegramText(many);
    expect(text.length).toBeLessThanOrEqual(TELEGRAM_RECEIPT_MAX);
    expect(text).toMatch(/… \+\d+ more items/);
    expect(text).toContain("<b>Total: 3,000.00 ETB</b>");
    expect(text).toContain("Method: Telebirr");
  });
});

describe("verify QR", () => {
  const verifyUrl = "https://example.test/verify#" + "A".repeat(380);
  const data = (lang: "en" | "am" | "om", qrPurpose?: "verify"): ReceiptData => ({
    tenant: { name: "Abdi Pharmacy" },
    no: "PS-000042",
    kind: "sale",
    lines: [{ name: "Paracetamol", qty: 2, price: 10, total: 20 }],
    totals: { due: 20, paid: 20, method: "cash" },
    ethDate: "15 ኅዳር 2019",
    gregDate: "2026-11-24",
    lang,
    qr: verifyUrl,
    qrPurpose,
  });

  it("captions a verify QR in the receipt's language", () => {
    expect(receiptModel(data("en", "verify")).qrNote).toBe("Scan to check this receipt");
    expect(receiptModel(data("am", "verify")).qrNote).toBe("ደረሰኙን ለማረጋገጥ ይቃኙ");
    expect(receiptModel(data("om", "verify")).qrNote).toMatch(/^Nagahee/);
    expect(receiptModel(data("en")).qrNote).toBeUndefined();
  });

  it("leaves the long verify link out of fixed-width text but keeps a plain QR payload", () => {
    const verifyText = layoutText(data("en", "verify"), 58).join("\n");
    expect(verifyText).not.toContain("example.test");
    expect(verifyText).toContain("PS-000042");
    const plain = layoutText({ ...data("en"), qr: "https://pay.example/x" }, 58).join("\n");
    expect(plain).toContain("https://pay.example/x");
  });

  it("links the caption to the verify page in Telegram", () => {
    const text = renderTelegramText(data("en", "verify"));
    expect(text).toContain(`<a href="${verifyUrl}">Scan to check this receipt</a>`);
    expect(text.length).toBeLessThan(TELEGRAM_RECEIPT_MAX);
  });
});
