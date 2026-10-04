import Link from "next/link";

/** "Or get it with ZLink+": a line on the cards for things ZLink+ includes. */
export function ZLinkHint({ what }: { what: string }) {
  return (
    <p data-testid="zlink-hint" className="mt-3 text-sm text-muted">
      <span className="font-display font-black text-violet">Z+</span> {what} is included with{" "}
      <Link href="/zlink" className="font-semibold text-cyan underline">
        ZLink+
      </Link>
      , with every other Sports+ game, UBusiness Ultimate and double daily coins.
    </p>
  );
}
