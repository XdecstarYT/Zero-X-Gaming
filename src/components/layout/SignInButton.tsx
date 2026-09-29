"use client";

import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/Button";
import { SignInModal } from "./SignInModal";

/** Any button that opens the sign-in dialog. */
export function SignInButton(props: Omit<ComponentProps<typeof Button>, "onClick">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button {...props} onClick={() => setOpen(true)} />
      <SignInModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
