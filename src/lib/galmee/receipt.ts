/**
 * Galmee receipts: one data shape, several renderers.
 *
 * A `ReceiptData` object is built once from what the money RPC returned (the
 * receipt number is always issued by the server) and then rendered as:
 *  - the printed receipt (`<Receipt>` in components/galmee/receipt.tsx, 58 or 80 mm),
 *  - Telegram text (`renderTelegramText`, sent through the notifications queue),
 *  - fixed-width text (`layoutText`, 32 or 48 characters a line) for raw thermal printers.
 * All three read the same `receiptModel`, so the paper and the message can never disagree.
 *
 * Self-contained on purpose: other Galmee apps copy src/lib/galmee unchanged.
 * Dates arrive already formatted (Ethiopian first, Gregorian second) so the
 * kit does not depend on an app's calendar helper.
 */

export type ReceiptLang = "en" | "am" | "om";
/** "summary": a report summary (totals for a period); prints no payment rows. */
export type ReceiptKind = "sale" | "repayment" | "fee" | "invoice" | "folio" | "ticket" | "label" | "summary";
export type ReceiptWidth = 58 | 80;

export type ReceiptData = {
  tenant: { name: string; phone?: string; tin?: string; townLine?: string };
  /** e.g. "GS-000123", issued by the server inside the money RPC. */
  no: string;
  kind: ReceiptKind;
  lines: { name: string; qty?: number; unit?: string; price?: number; total: number; /** Printed instead of the amount (a count on a summary). */ display?: string }[];
  /** `method` is a payment method code (cash, telebirr, cbe_birr, credit, bank, other) or free text. */
  totals: { sub?: number; due?: number; paid: number; method: string; balanceAfter?: number };
  customer?: { name: string; phone?: string };
  ethDate: string;
  gregDate: string;
  lang: ReceiptLang;
  /** Printed as a QR: a pay link, or a signed-receipt verify link (`qrPurpose: "verify"`). */
  qr?: string;
  /** "verify": the QR is a signed-receipt check; it gets a caption, prints larger and is left out of fixed-width text. */
  qrPurpose?: "verify";
  footer?: string;
};

type Strings = {
  title: Record<ReceiptKind, string>;
  no: string; customer: string; phone: string; tin: string;
  sub: string; due: string; paid: string; method: string; balanceAfter: string; change: string;
  thanks: string; brand: string; currency: string; more: string; verify: string;
  methods: Record<string, string>;
};

const STRINGS: Record<ReceiptLang, Strings> = {
  en: {
    title: { sale: "Sales receipt", repayment: "Credit repayment receipt", fee: "Fee receipt", invoice: "Invoice", folio: "Guest folio", ticket: "Ticket", label: "Label", summary: "Report summary" },
    no: "Receipt no.", customer: "Customer", phone: "Tel", tin: "TIN",
    sub: "Subtotal", due: "Total", paid: "Paid", method: "Method", balanceAfter: "Balance owed", change: "Change",
    thanks: "Thank you", brand: "Galmee", currency: "ETB", more: "more items", verify: "Scan to check this receipt",
    methods: { cash: "Cash", telebirr: "Telebirr", cbe_birr: "CBE Birr", credit: "Credit", bank: "Bank transfer", other: "Other" },
  },
  am: {
    title: { sale: "የሽያጭ ደረሰኝ", repayment: "የዱቤ ክፍያ ደረሰኝ", fee: "የክፍያ ደረሰኝ", invoice: "የሂሳብ መጠየቂያ", folio: "የእንግዳ ሂሳብ", ticket: "ትኬት", label: "መለያ", summary: "የሪፖርት ማጠቃለያ" },
    no: "ደረሰኝ ቁ.", customer: "ደንበኛ", phone: "ስልክ", tin: "ቲን",
    sub: "ንዑስ ድምር", due: "ጠቅላላ", paid: "የተከፈለ", method: "የክፍያ ዘዴ", balanceAfter: "ቀሪ ዱቤ", change: "መልስ",
    thanks: "እናመሰግናለን", brand: "ገልሜ", currency: "ብር", more: "ተጨማሪ ዕቃዎች", verify: "ደረሰኙን ለማረጋገጥ ይቃኙ",
    methods: { cash: "ጥሬ ገንዘብ", telebirr: "ቴሌብር", cbe_birr: "ሲቢኢ ብር", credit: "ዱቤ", bank: "የባንክ ዝውውር", other: "ሌላ" },
  },
  om: {
    title: { sale: "Nagahee gurgurtaa", repayment: "Nagahee kaffaltii liqii", fee: "Nagahee kaffaltii", invoice: "Herrega kaffaltii", folio: "Herrega keessummaa", ticket: "Tikeetii", label: "Mallattoo", summary: "Cuunfaa gabaasaa" },
    no: "Lakk. nagahee", customer: "Maamila", phone: "Bilb.", tin: "TIN",
    sub: "Ida'ama xiqqaa", due: "Waliigala", paid: "Kan kaffalame", method: "Mala kaffaltii", balanceAfter: "Liqii hafe", change: "Deebii",
    thanks: "Galatoomaa", brand: "Galmee", currency: "ETB", more: "meeshaalee dabalataa", verify: "Nagahee kana mirkaneessuuf iskaanii godhaa",
    methods: { cash: "Maallaqa callaa", telebirr: "Telebirr", cbe_birr: "CBE Birr", credit: "Liqii", bank: "Baankii", other: "Kan biraa" },
  },
};

/** The string table for a language; anything unknown falls back to English. */
export function receiptStrings(lang: string): Strings {
  return STRINGS[lang as ReceiptLang] ?? STRINGS.en;
}

const amountFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

/** Western digits, two decimals: receipts never localise numbers. */
export function receiptAmount(n: number): string {
  return amountFormat.format(Number(n) || 0);
}

export type ReceiptModelLine = { name: string; detail: string | null; total: string };
export type ReceiptModel = {
  header: string[];
  title: string;
  meta: { label: string; value: string }[];
  lines: ReceiptModelLine[];
  totals: { label: string; value: string; strong?: boolean }[];
  footer: string[];
  qr?: string;
  /** Caption under a verify QR, in the receipt's language. */
  qrNote?: string;
};

/** Everything a renderer prints, in print order, already formatted. */
export function receiptModel(data: ReceiptData): ReceiptModel {
  const s = receiptStrings(data.lang);
  const header = [data.tenant.name];
  if (data.tenant.townLine) header.push(data.tenant.townLine);
  if (data.tenant.phone) header.push(`${s.phone} ${data.tenant.phone}`);
  if (data.tenant.tin) header.push(`${s.tin} ${data.tenant.tin}`);

  // A receipt without a number (a sale from before numbering started) leaves the number out instead of printing a blank.
  const meta = data.no ? [{ label: s.no, value: data.no }] : [];
  meta.push({ label: data.ethDate, value: `(${data.gregDate})` });
  if (data.customer) {
    meta.push({ label: s.customer, value: data.customer.name });
    if (data.customer.phone) meta.push({ label: s.phone, value: data.customer.phone });
  }

  const lines = data.lines.map((l) => {
    const qty = l.qty != null ? `${qtyFormat.format(l.qty)}${l.unit ? ` ${l.unit}` : ""}` : null;
    const detail = qty && l.price != null ? `${qty} × ${receiptAmount(l.price)}` : qty;
    return { name: l.name, detail, total: l.display ?? receiptAmount(l.total) };
  });

  const t = data.totals;
  if (data.kind === "summary") {
    const totals = t.due != null ? [{ label: s.due, value: `${receiptAmount(t.due)} ${s.currency}`, strong: true }] : [];
    return { header, title: s.title.summary, meta, lines, totals, footer: [data.footer ?? s.brand], ...qrOf(data, s) };
  }
  const due = t.due ?? data.lines.reduce((a, l) => a + (Number(l.total) || 0), 0);
  const totals: ReceiptModel["totals"] = [];
  if (t.sub != null && t.sub !== due) totals.push({ label: s.sub, value: receiptAmount(t.sub) });
  totals.push({ label: s.due, value: `${receiptAmount(due)} ${s.currency}`, strong: true });
  totals.push({ label: s.paid, value: receiptAmount(t.paid) });
  totals.push({ label: s.method, value: s.methods[t.method] ?? t.method });
  if (t.paid > due && data.kind !== "repayment") totals.push({ label: s.change, value: receiptAmount(t.paid - due) });
  if (t.balanceAfter != null) totals.push({ label: s.balanceAfter, value: `${receiptAmount(t.balanceAfter)} ${s.currency}` });

  const footer = [data.footer ?? s.thanks, data.no ? `${s.brand} · ${data.no}` : s.brand];
  return { header, title: s.title[data.kind] ?? s.title.sale, meta, lines, totals, footer, ...qrOf(data, s) };
}

function qrOf(data: ReceiptData, s: Strings): Pick<ReceiptModel, "qr" | "qrNote"> {
  if (!data.qr) return {};
  return data.qrPurpose === "verify" ? { qr: data.qr, qrNote: s.verify } : { qr: data.qr };
}

const chars = (s: string) => Array.from(s);

/** Splits text into lines of at most `width` characters, breaking at spaces, and inside words only when a word is too long. */
export function wrapText(text: string, width: number): string[] {
  const indent = /^ */.exec(text)?.[0] ?? "";
  if (indent && indent.length < width) return wrapText(text.slice(indent.length), width - indent.length).map((l) => indent + l);
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let w = word;
    while (chars(w).length > width) {
      if (line) { out.push(line); line = ""; }
      out.push(chars(w).slice(0, width).join(""));
      w = chars(w).slice(width).join("");
    }
    if (!w) continue;
    const next = line ? `${line} ${w}` : w;
    if (chars(next).length <= width) line = next;
    else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

/** Left text and right-aligned value on one line; the left side wraps above when both do not fit. */
function leftRight(left: string, right: string, width: number): string[] {
  const r = chars(right).length;
  if (r >= width) return [...wrapText(left, width), ...wrapText(right, width)];
  const wrapped = wrapText(left, width);
  const last = wrapped[wrapped.length - 1];
  const gap = width - chars(last).length - r;
  if (gap >= 1) return [...wrapped.slice(0, -1), last + " ".repeat(gap) + right];
  return [...wrapped, " ".repeat(width - r) + right];
}

function center(text: string, width: number): string[] {
  return wrapText(text, width).map((l) => " ".repeat(Math.floor((width - chars(l).length) / 2)) + l);
}

/** Fixed-width text: 32 characters a line for 58 mm paper, 48 for 80 mm. */
export function layoutText(data: ReceiptData, width: ReceiptWidth = 58): string[] {
  const cols = width === 80 ? 48 : 32;
  const m = receiptModel(data);
  const rule = "-".repeat(cols);
  const out: string[] = [];
  m.header.forEach((h) => out.push(...center(h, cols)));
  out.push(...center(m.title, cols));
  out.push(rule);
  m.meta.forEach((x) => out.push(...leftRight(x.label, x.value, cols)));
  out.push(rule);
  for (const l of m.lines) {
    if (width === 80 && l.detail && chars(l.detail).length <= 14 && chars(l.total).length <= 11) {
      // three columns: name (21) | qty × price (14) | total (11)
      const names = wrapText(l.name, cols - 27);
      const pad = (t: string, n: number) => " ".repeat(Math.max(0, n - chars(t).length)) + t;
      out.push(names[0] + " ".repeat(cols - 27 - chars(names[0]).length) + " " + pad(l.detail, 14) + " " + pad(l.total, 11));
      out.push(...names.slice(1));
    } else if (l.detail) { out.push(...wrapText(l.name, cols)); out.push(...leftRight(`  ${l.detail}`, l.total, cols)); }
    else out.push(...leftRight(l.name, l.total, cols));
  }
  out.push(rule);
  m.totals.forEach((x) => out.push(...leftRight(x.label, x.value, cols)));
  out.push(rule);
  // A verify link is several hundred characters: only useful as a QR, so raw text printers leave it out.
  if (m.qr && !m.qrNote) out.push(...wrapText(m.qr, cols));
  m.footer.forEach((f) => out.push(...center(f, cols)));
  return out;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Telegram allows 4096 characters; receipts stay under this so the closing lines always fit. */
export const TELEGRAM_RECEIPT_MAX = 3500;

/**
 * Telegram message text (HTML parse mode, as the Galmee sender uses): the same
 * numbers in the same order as the paper. When a long receipt would pass the
 * cap, item lines are dropped from the end and counted; totals are never cut.
 */
export function renderTelegramText(data: ReceiptData): string {
  const s = receiptStrings(data.lang);
  const m = receiptModel(data);
  const head = [`<b>${escapeHtml(m.title)}</b>`, ...m.meta.map((x) => escapeHtml(`${x.label} ${x.value}`)), ""];
  const tail = [
    "",
    ...m.totals.map((x) => (x.strong ? `<b>${escapeHtml(`${x.label}: ${x.value}`)}</b>` : escapeHtml(`${x.label}: ${x.value}`))),
    ...(m.qr && m.qrNote ? [`<a href="${escapeHtml(m.qr).replace(/"/g, "&quot;")}">${escapeHtml(m.qrNote)}</a>`] : m.qr ? [escapeHtml(m.qr)] : []),
    "",
    escapeHtml(`— ${data.tenant.name} · ${s.brand}`),
  ];
  const items = m.lines.map((l) => escapeHtml(l.detail ? `${l.name}\n  ${l.detail} = ${l.total}` : `${l.name} — ${l.total}`));
  const join = (its: string[], dropped: number) =>
    [...head, ...its, ...(dropped ? [escapeHtml(`… +${dropped} ${s.more}`)] : []), ...tail].join("\n");
  let kept = items.length;
  let text = join(items, 0);
  while (text.length > TELEGRAM_RECEIPT_MAX && kept > 0) {
    kept -= 1;
    text = join(items.slice(0, kept), items.length - kept);
  }
  return text.length > TELEGRAM_RECEIPT_MAX ? text.slice(0, TELEGRAM_RECEIPT_MAX) : text;
}
