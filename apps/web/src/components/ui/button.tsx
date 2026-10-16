import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "outline" | "ghost" | "ink";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-medium transition-[transform,background-color,border-color,color] duration-200 [transition-timing-function:var(--ease-out-expo)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-fg hover:brightness-[1.05] shadow-[0_8px_24px_rgb(255_107_107_/_0.18)]",
  outline:
    "border border-border-strong bg-surface text-text hover:bg-surface-2",
  ghost: "text-text-muted hover:bg-surface-2 hover:text-text",
  ink: "bg-ink text-white hover:brightness-125 dark:border dark:border-border",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
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
