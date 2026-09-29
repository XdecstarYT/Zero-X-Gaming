"use client";

import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ui/Button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center" role="alert">
      <p className="font-display text-5xl font-black text-danger">Glitch</p>
      <h1 className="mt-4 font-display text-2xl font-bold uppercase">Something broke</h1>
      <p className="mt-2 text-muted">An unexpected error happened. Try again, or head back to the library.</p>
      <div className="mt-8 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <LinkButton href="/games" variant="secondary">
          Browse games
        </LinkButton>
      </div>
    </div>
  );
}
