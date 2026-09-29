import { LinkButton } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="font-display text-7xl font-black text-magenta drop-shadow-[0_0_24px_rgb(255_43_214/0.5)]">404</p>
      <h1 className="mt-4 font-display text-2xl font-bold uppercase">Game over</h1>
      <p className="mt-2 text-muted">That page doesn&apos;t exist, or it respawned somewhere else.</p>
      <LinkButton href="/games" className="mt-8">
        Browse games
      </LinkButton>
    </div>
  );
}
