import type { Metadata } from "next";
import { NextXApp } from "@/components/nextx/NextXApp";

export const metadata: Metadata = {
  title: "NextX",
  description: "NextX: Zero X's next generation game production. YourGov and Zero City, photoreal 3D worlds and deep simulations built for your phone first.",
};

export default function NextXPage() {
  return <NextXApp />;
}
