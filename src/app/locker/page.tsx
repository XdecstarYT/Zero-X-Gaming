import type { Metadata } from "next";
import { Locker } from "@/components/season/Locker";

export const metadata: Metadata = {
  title: "Locker",
  description: "Equip your Neon Siege outfit, weapon wrap and banner.",
};

export default function LockerPage() {
  return <Locker />;
}
