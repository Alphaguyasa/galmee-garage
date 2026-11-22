"use client";

import { useState } from "react";
import { Check, Copy, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";

/** The customer's status link with copy and share buttons (share falls back to Telegram). */
export function StatusLinkShare({ url, shareText }: { url: string; shareText: string }) {
  const t = useTranslations("statusLink");
  const [copied, setCopied] = useState(false);
  const telegram = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  async function share(event: React.MouseEvent<HTMLAnchorElement>) {
    if (typeof navigator.share !== "function") return;
    event.preventDefault();
    try {
      await navigator.share({ title: shareText, text: shareText, url });
    } catch {
      // Closed the share sheet: nothing to do.
    }
  }

  return (
    <div className="grid gap-3">
      <label htmlFor="status-link-url" className="sr-only">
        {t("linkLabel")}
      </label>
      <input
        id="status-link-url"
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="num w-full min-w-0 truncate rounded-md border border-input bg-muted px-3 py-2 text-sm"
      />
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" size="lg" onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? t("copied") : t("copy")}
        </Button>
        <a href={telegram} target="_blank" rel="noopener noreferrer" onClick={share} className={buttonVariants({ size: "lg" })}>
          <Send aria-hidden />
          {t("share")}
        </a>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {copied ? t("copied") : ""}
      </p>
    </div>
  );
}
