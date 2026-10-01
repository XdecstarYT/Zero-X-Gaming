import type { Metadata } from "next";
import { OAuthConsent } from "@/components/oauth/OAuthConsent";

export const metadata: Metadata = {
  title: "Authorize an app",
  robots: { index: false, follow: false },
};

/** The Supabase OAuth 2.1 server's authorization path (set it to /oauth/consent in the dashboard). */
export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const raw = (await searchParams).authorization_id;
  const id = typeof raw === "string" ? raw : null;
  return (
    <div className="mx-auto flex max-w-lg flex-col px-4 py-10 sm:px-6 sm:py-16">
      <OAuthConsent authorizationId={id} />
    </div>
  );
}
