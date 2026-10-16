import { cn } from "@/lib/utils";

export const inputClass =
  "w-full rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-sm outline-none transition-colors placeholder:text-text-subtle focus:border-accent focus:bg-surface disabled:opacity-60";

export const primaryButtonClass =
  "inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-60";

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-text-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-text-subtle">{hint}</p> : null}
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-[10px] border border-accent-note bg-accent-soft px-3 py-2 text-xs text-accent-ink"
    >
      {message}
    </p>
  );
}

export function FormNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-xs text-text-muted", className)}>
      {children}
    </p>
  );
}
