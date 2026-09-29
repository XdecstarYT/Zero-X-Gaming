"use client";

import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/Button";
import { SignInModal } from "./SignInModal";

/** Any button that opens the sign-in dialog. */
export function SignInButton({
  initialMode,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick"> & { initialMode?: "sign_in" | "sign_up" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button {...props} onClick={() => setOpen(true)} />
      <SignInModal open={open} onClose={() => setOpen(false)} initialMode={initialMode} />
    </>
  );
}
