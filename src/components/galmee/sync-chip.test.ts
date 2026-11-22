import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { QueueEntry } from "@/lib/galmee/offline-queue";
import { canDiscard, entryAge, syncStrings } from "@/lib/galmee/sync-strings";
import { QueueSheet } from "./queue-sheet";
import { SyncChip } from "./sync-chip";

const chip = (state: Parameters<typeof SyncChip>[0]["state"], lang = "en") =>
  renderToStaticMarkup(createElement(SyncChip, { state, lang, onOpen: () => {} }));

describe("SyncChip", () => {
  it("shows a green check when everything is sent", () => {
    const html = chip({ pending: 0, dead: 0, syncing: false });
    expect(html).toContain('data-sync="synced"');
    expect(html).toContain('aria-label="All sent"');
    expect(html).toContain("text-money-in");
  });
  it("shows the waiting count in amber, spinning while sending", () => {
    const html = chip({ pending: 3, dead: 0, syncing: false });
    expect(html).toContain('data-sync="pending"');
    expect(html).toContain('aria-label="3 waiting to send"');
    expect(html).toContain(">3</span>");
    expect(html).toContain("text-warn");
    expect(chip({ pending: 3, dead: 0, syncing: true })).toContain("animate-spin");
  });
  it("turns red when the server refused something, even with others waiting", () => {
    const html = chip({ pending: 2, dead: 1, syncing: false }, "am");
    expect(html).toContain('data-sync="dead"');
    expect(html).toContain('aria-label="1 ተቀባይነት አላገኙም"');
    expect(html).toContain("text-urgent");
  });
});

const entry = (seq: number, state: QueueEntry["state"], error?: string): QueueEntry => ({
  seq,
  client_ref: `r${seq}`,
  rpc: "record_sale",
  args: {},
  state,
  attempts: state === "dead" ? 1 : 0,
  created_at: 0,
  error,
});

const sheet = (role: string, entries: QueueEntry[], online = true) =>
  renderToStaticMarkup(
    createElement(QueueSheet, {
      open: true,
      onClose: () => {},
      lang: "en",
      entries,
      role,
      online,
      now: 5 * 60000,
      summarize: (e) => `Sale #${e.seq}`,
      describeError: (m) => (m === "bad_line" ? "An item on this sale no longer exists" : m),
      onSendNow: () => {},
      onRetry: () => {},
      onDiscard: () => {},
    }),
  );

describe("QueueSheet", () => {
  const entries = [entry(1, "dead", "bad_line"), entry(2, "pending")];

  it("lists refused entries with the app's wording and waiting ones with their age", () => {
    const html = sheet("owner", entries);
    expect(html).toContain("An item on this sale no longer exists");
    expect(html).toContain("Sale #2");
    expect(html).toContain("5 min ago");
    expect(html.match(/data-entry="dead"/g)).toHaveLength(1);
    expect(html.match(/data-entry="pending"/g)).toHaveLength(1);
  });

  it("offers Discard only to the owner or a manager", () => {
    expect(sheet("owner", entries)).toContain(">Discard</button>");
    expect(sheet("manager", entries)).toContain(">Discard</button>");
    const cashier = sheet("cashier", entries);
    expect(cashier).not.toContain(">Discard</button>");
    expect(cashier).toContain(">Try again</button>");
    expect(cashier).toContain("Only the owner or a manager can discard.");
    expect(canDiscard(undefined)).toBe(false);
  });

  it("says when nothing is waiting, and explains offline", () => {
    expect(sheet("owner", [])).toContain("Nothing is waiting.");
    expect(sheet("owner", [entry(2, "pending")], false)).toContain("No network. Keep selling");
  });
});

describe("entryAge", () => {
  it("rounds to minutes then hours, in each language", () => {
    const en = syncStrings("en");
    expect(entryAge(0, 30_000, en)).toBe("just now");
    expect(entryAge(0, 59 * 60000, en)).toBe("59 min ago");
    expect(entryAge(0, 130 * 60000, en)).toBe("2 h ago");
    expect(entryAge(0, 10 * 60000, syncStrings("om"))).toBe("daqiiqaa 10 dura");
    expect(syncStrings("xx")).toBe(en);
  });
});
