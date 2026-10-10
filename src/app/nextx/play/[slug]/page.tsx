import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextXPlayer } from "@/components/nextx/NextXPlayer";
import { getGame } from "@/lib/catalog";
import { NEXTX_SLUGS, isNextX } from "@/lib/nextx";

export const dynamicParams = false;

export function generateStaticParams() {
  return NEXTX_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata(props: PageProps<"/nextx/play/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const game = getGame(slug);
  return game ? { title: `${game.title} · NextX`, description: game.tagline } : { title: "Not found" };
}

/** A NextX title, played inside the NextX app (a ZLink+ game: the membership unlocks it). */
export default async function NextXPlayPage(props: PageProps<"/nextx/play/[slug]">) {
  const { slug } = await props.params;
  const game = getGame(slug);
  if (!game || !isNextX(slug)) notFound();
  return <NextXPlayer game={game} />;
}
