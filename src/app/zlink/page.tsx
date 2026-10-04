import type { Metadata } from "next";
import { Transmission } from "@/components/zlink/Transmission";
import { RequestAccess } from "@/components/zlink/RequestAccess";
import { ZLinkHero } from "@/components/zlink/ZLinkHero";
import { DOSSIER } from "@/lib/zlink";

export const metadata: Metadata = {
  title: "ZLink+",
  description: "Something is linking. ZLink+ is coming.",
};

export default function ZLinkPage() {
  return (
    <div className="relative overflow-hidden pb-10">
      <div className="zx-scanlines" aria-hidden />
      <div className="pointer-events-none absolute left-1/2 top-24 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(139_92_255/0.28),transparent_65%)]" aria-hidden />
      <section aria-labelledby="zlink-title" className="relative mx-auto flex max-w-4xl flex-col items-center px-4 pt-16 text-center sm:px-6 sm:pt-24">
        <p className="rounded-full border border-magenta/50 bg-magenta/10 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.35em] text-magenta">Incoming transmission</p>
        <h1 id="zlink-title" className="sr-only">
          ZLink+ is coming
        </h1>
        <div className="mt-6">
          <ZLinkHero />
        </div>
        <Transmission className="mt-4 min-h-6" />
        <p className="mt-8 max-w-xl text-lg text-muted">
          We can&apos;t tell you what it is. We can tell you it&apos;s coming, it&apos;s for players, and it changes how you play Zero
          X.
        </p>
        <div className="mt-8 w-full max-w-md">
          <RequestAccess />
        </div>
      </section>

      <section aria-labelledby="zlink-file" className="relative mx-auto mt-20 max-w-3xl px-4 sm:px-6">
        <div className="rounded-2xl border border-border bg-surface/90 p-6 font-mono shadow-card">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 id="zlink-file" className="text-xs font-bold uppercase tracking-[0.3em] text-subtle">
              File ZX-∞ · ZLink+
            </h2>
            <span className="-rotate-6 rounded border-2 border-danger px-2 py-0.5 text-[11px] font-black uppercase tracking-widest text-danger">Top secret</span>
          </div>
          <dl className="mt-4 grid gap-3 text-sm" data-testid="zlink-file">
            {DOSSIER.map((d) => (
              <div key={d.label} className="grid grid-cols-[9rem_1fr] items-center gap-3 sm:grid-cols-[11rem_1fr]">
                <dt className="uppercase tracking-wider text-subtle">{d.label}</dt>
                <dd>
                  {d.open ? (
                    <span className="text-text">{d.value}</span>
                  ) : (
                    // Redacted: a bar with nothing behind it.
                    <span role="img" className="zx-redact inline-block h-5 align-middle" style={{ width: `${Math.max(6, d.value.length) * 0.6}em` }} aria-label="Classified">
                      &nbsp;
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 border-t border-border pt-3 text-xs text-subtle">Further details withheld. Do not ask. (Okay, you can ask. We still won&apos;t say.)</p>
        </div>
      </section>
    </div>
  );
}
