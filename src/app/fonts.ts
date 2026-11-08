import localFont from "next/font/local";

// Barlow takes its shapes from vehicle plates and highway signs: compact, sturdy, readable at arm's length.
export const latin = localFont({
  src: [
    { path: "./fonts/barlow-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/barlow-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/barlow-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-latin",
  display: "swap",
});

// Noto Sans Ethiopic for Amharic (Ge'ez script). Latin glyphs fall through to Barlow first.
export const ethiopic = localFont({
  src: [
    { path: "./fonts/noto-sans-ethiopic-ethiopic-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/noto-sans-ethiopic-ethiopic-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-ethiopic",
  display: "swap",
  preload: false,
});
