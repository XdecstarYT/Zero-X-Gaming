import type { Metadata } from "next";
import { LinkButton } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Sign-in problem" };

const MESSAGES: Record<string, string> = {
  exchange: "That sign-in link expired or was already used. Please try again.",
  verify: "That confirmation link expired or was already used. Try signing in, or sign up again for a fresh link.",
  provider: "The sign-in provider cancelled or refused the request.",
  disabled: "Accounts aren't available on this deployment yet.",
};

export default async function AuthErrorPage(props: PageProps<"/auth/error">) {
  const { reason } = await props.searchParams;
  const key = Array.isArray(reason) ? reason[0] : reason;
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center" role="alert">
      <h1 className="font-display text-2xl font-bold uppercase">Couldn&apos;t sign you in</h1>
      <p className="mt-3 text-muted">{(key && MESSAGES[key]) ?? "Something went wrong while signing in."}</p>
      <LinkButton href="/" className="mt-8">
        Back to home
      </LinkButton>
    </div>
  );
}
