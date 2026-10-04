import type { Metadata } from "next";
import { ItemShop } from "@/components/shop/ItemShop";

export const metadata: Metadata = {
  title: "Item Shop",
  description: "DROP 1 is live: new Neon Siege outfits, weapon wraps and banners, bought with ZX Cash won in Cash Cups.",
};

export default function ShopPage() {
  return <ItemShop />;
}
