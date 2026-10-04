import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "accent" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-display font-semibold uppercase tracking-wider " +
  "transition-[background-color,box-shadow,color,transform] duration-200 ease-zx select-none " +
  "active:translate-y-px disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "zx-shine bg-cyan text-bg shadow-[0_8px_30px_-10px_var(--zx-cyan)] hover:shadow-glow-cyan hover:-translate-y-0.5",
  accent: "zx-shine bg-magenta text-bg shadow-[0_8px_30px_-10px_var(--zx-magenta)] hover:shadow-glow-magenta hover:-translate-y-0.5",
  secondary: "zx-glass border border-border-strong text-text hover:border-cyan hover:text-cyan hover:-translate-y-0.5",
  ghost: "text-muted hover:bg-surface-2 hover:text-text",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[11px]",
  md: "h-10 px-5 text-xs",
  lg: "h-12 px-7 text-sm",
  icon: "h-10 w-10 text-sm",
};

interface Common {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

type ButtonProps = Common & Omit<ComponentProps<"button">, keyof Common>;
type LinkButtonProps = Common & Omit<ComponentProps<typeof Link>, keyof Common>;

export function buttonClasses({ variant = "primary", size = "md", className }: Omit<Common, "children">) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({ variant, size, className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...rest} />;
}

export function LinkButton({ variant, size, className, ...rest }: LinkButtonProps) {
  return <Link className={buttonClasses({ variant, size, className })} {...rest} />;
}
