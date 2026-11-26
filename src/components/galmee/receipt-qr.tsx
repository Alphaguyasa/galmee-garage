import QRCode from "qrcode";

/**
 * The receipt's QR slot: any payload in (a pay link, a verify URL, later a signed
 * receipt), a crisp black-on-white SVG out. Built synchronously from the QR
 * matrix, so it renders on the server and in the browser and prints sharp on
 * thermal paper. Returns nothing for an empty or too-long payload.
 */
export function ReceiptQr({ value, size = 96, label }: { value: string; size?: number; label?: string }) {
  let modules: { size: number; get: (row: number, col: number) => number } | null = null;
  try {
    modules = value ? QRCode.create(value, { errorCorrectionLevel: "M" }).modules : null;
  } catch {
    modules = null;
  }
  if (!modules) return null;
  const n = modules.size;
  const quiet = 2;
  const cells: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (modules.get(r, c)) cells.push(`M${c + quiet} ${r + quiet}h1v1h-1z`);
  }
  const dim = n + quiet * 2;
  return (
    <svg
      viewBox={`0 0 ${dim} ${dim}`}
      width={size}
      height={size}
      role="img"
      aria-label={label ?? value}
      shapeRendering="crispEdges"
      className="mx-auto block"
    >
      <rect width={dim} height={dim} fill="#fff" />
      <path d={cells.join("")} fill="#000" />
    </svg>
  );
}
