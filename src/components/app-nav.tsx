"use client";

import { useTranslations } from "next-intl";
import { Search, Settings, ShoppingCart, Wallet, Wrench } from "lucide-react";
import { BottomNav } from "@/components/galmee/bottom-nav";

const ITEMS = [
  { href: "/", key: "home", icon: Search, manager: false },
  { href: "/work", key: "work", icon: Wrench, manager: false },
  { href: "/parts", key: "parts", icon: ShoppingCart, manager: false },
  { href: "/unpaid", key: "unpaid", icon: Wallet, manager: false },
  { href: "/settings", key: "settings", icon: Settings, manager: true },
] as const;

/** Garage's destinations in the shared Galmee nav; setup is for managers. */
export function AppNav({ variant, canManage }: { variant: "bottom" | "side"; canManage: boolean }) {
  const t = useTranslations("nav");
  return (
    <BottomNav
      variant={variant}
      menuLabel={t("menu")}
      items={ITEMS.filter((item) => canManage || !item.manager).map(({ href, key, icon }) => ({
        href,
        label: t(key),
        icon,
      }))}
    />
  );
}
