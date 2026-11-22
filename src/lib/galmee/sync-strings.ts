/**
 * Words for the offline queue (sync chip and queue sheet), am/om/en, plus the
 * one rule about who may throw a failed entry away. Self-contained on purpose:
 * other Galmee apps copy src/lib/galmee unchanged.
 */
export type SyncLang = "en" | "am" | "om";

export type SyncStrings = {
  /** Chip, everything sent. */
  synced: string;
  /** Chip, accessible label: "{n} waiting to send". */
  pending: (n: number) => string;
  /** Chip, accessible label: "{n} not accepted". */
  dead: (n: number) => string;
  syncing: string;
  sheetTitle: string;
  close: string;
  waitingHeading: string;
  failedHeading: string;
  nothingWaiting: string;
  sendNow: string;
  retry: string;
  discard: string;
  discardConfirm: string;
  discardOwnerOnly: string;
  /** Age of an entry: "5 min ago". */
  minutesAgo: (m: number) => string;
  hoursAgo: (h: number) => string;
  justNow: string;
  offlineNote: string;
};

const STRINGS: Record<SyncLang, SyncStrings> = {
  en: {
    synced: "All sent",
    pending: (n) => `${n} waiting to send`,
    dead: (n) => `${n} not accepted`,
    syncing: "Sending…",
    sheetTitle: "Waiting to send",
    close: "Close",
    waitingHeading: "Waiting for the network",
    failedHeading: "Not accepted by the server",
    nothingWaiting: "Nothing is waiting. Everything has been sent.",
    sendNow: "Send now",
    retry: "Try again",
    discard: "Discard",
    discardConfirm: "Discard this entry? It was never recorded.",
    discardOwnerOnly: "Only the owner or a manager can discard.",
    minutesAgo: (m) => `${m} min ago`,
    hoursAgo: (h) => `${h} h ago`,
    justNow: "just now",
    offlineNote: "No network. Keep selling: these will send when the network is back.",
  },
  am: {
    synced: "ሁሉም ተልኳል",
    pending: (n) => `${n} ለመላክ በመጠባበቅ ላይ`,
    dead: (n) => `${n} ተቀባይነት አላገኙም`,
    syncing: "በመላክ ላይ…",
    sheetTitle: "ያልተላኩ",
    close: "ዝጋ",
    waitingHeading: "ኔትወርክ በመጠበቅ ላይ",
    failedHeading: "ሰርቨሩ ያልተቀበላቸው",
    nothingWaiting: "የሚጠብቅ የለም። ሁሉም ተልኳል።",
    sendNow: "አሁን ላክ",
    retry: "እንደገና ሞክር",
    discard: "ሰርዝ",
    discardConfirm: "ይህ ይሰረዝ? ፈጽሞ አልተመዘገበም።",
    discardOwnerOnly: "መሰረዝ የሚችሉት ባለቤቱ ወይም ሥራ አስኪያጅ ብቻ ናቸው።",
    minutesAgo: (m) => `ከ${m} ደቂቃ በፊት`,
    hoursAgo: (h) => `ከ${h} ሰዓት በፊት`,
    justNow: "አሁን",
    offlineNote: "ኔትወርክ የለም። መሸጥ ይቀጥሉ፤ ኔትወርክ ሲመለስ ይላካሉ።",
  },
  om: {
    synced: "Hundi ergameera",
    pending: (n) => `${n} erguuf eegaa jira`,
    dead: (n) => `${n} hin fudhatamne`,
    syncing: "Ergaa jira…",
    sheetTitle: "Kan hin ergamne",
    close: "Cufi",
    waitingHeading: "Neetworkii eegaa jira",
    failedHeading: "Sarvarii irratti hin fudhatamne",
    nothingWaiting: "Wanti eegaa jiru hin jiru. Hundi ergameera.",
    sendNow: "Amma ergi",
    retry: "Irra deebi'ii yaali",
    discard: "Haqi",
    discardConfirm: "Kun haqamuu? Gonkumaa hin galmoofne.",
    discardOwnerOnly: "Abbaa qabeenyaa ykn hoggantaa qofatu haquu danda'a.",
    minutesAgo: (m) => `daqiiqaa ${m} dura`,
    hoursAgo: (h) => `sa'aatii ${h} dura`,
    justNow: "amma",
    offlineNote: "Neetworkiin hin jiru. Gurguruu itti fufaa: yeroo neetworkiin deebi'u ni ergamu.",
  },
};

/** The string table for a language; anything unknown falls back to English. */
export function syncStrings(lang: string): SyncStrings {
  return STRINGS[lang as SyncLang] ?? STRINGS.en;
}

/** Only the owner or a manager may discard a dead entry (the money never happened, but the attempt is audited). */
export function canDiscard(role: string | null | undefined): boolean {
  return role === "owner" || role === "manager";
}

/** "just now" / "5 min ago" / "3 h ago" for an entry's age. */
export function entryAge(createdAt: number, now: number, s: SyncStrings): string {
  const min = Math.floor((now - createdAt) / 60000);
  if (min < 1) return s.justNow;
  if (min < 60) return s.minutesAgo(min);
  return s.hoursAgo(Math.floor(min / 60));
}
