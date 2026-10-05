import type { Metadata } from "next";
import { CashCupApp } from "@/components/cash-cup/CashCupApp";

export const metadata: Metadata = {
  title: "Cash Cup",
  description: "Neon Siege tournaments for ZX Cash: 55 fighters on a map four times the size, 250 ZX Cash for the win. 10 to enter; the battle pass gives two free entries a season.",
};

export default function CashCupPage() {
  return <CashCupApp />;
}
