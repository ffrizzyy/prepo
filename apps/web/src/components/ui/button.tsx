import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "outline" | "ghost" | "ink";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2 font-medium transition-[transform,background-color,border-color,color] duration-200 [transition-timing-function:var(--ease-out-expo)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  // No shadow and no glow. The accent is a colour, not a light source: a coral
  // button that also glows competes with the one focal point on the screen, and
  // a glow under every primary button is the single most common AI tell (R-13).
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  outline:
    "border border-border-strong bg-surface text-text hover:bg-surface-2 hover:border-border-strong/80",
  ghost: "text-text-muted hover:bg-surface-2 hover:text-text",
  ink: "bg-ink text-white hover:bg-[#1d1d21] dark:border dark:border-border",
};

/**
 * Sizes are measured for a mouse first, because this is a desktop tool: 36 and
 * 40 px keep tables and toolbars dense. On a coarse pointer the same control
 * grows to the 44 px minimum tap target (R-03), which is where that rule is
 * actually about.
 */
const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-sm pointer-coarse:min-h-11",
  md: "h-10 px-4 text-sm pointer-coarse:h-11",
  lg: "h-12 px-6 text-base",
};

export function buttonVariants({
  variant = "primary",
  size = "md",
}: { variant?: ButtonVariant; size?: ButtonSize } = {}) {
  return cn(base, variants[variant], sizes[size]);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
