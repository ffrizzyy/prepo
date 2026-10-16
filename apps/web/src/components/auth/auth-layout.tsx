import Link from "next/link";
import { BRAND } from "@prepo/shared";

/** The frame shared by sign-in, sign-up and create-workspace. */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-[380px]">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight"
        >
          <span className="grid size-7 place-items-center rounded-[8px] bg-accent text-sm font-semibold text-accent-fg">
            P
          </span>
          {BRAND.name}
        </Link>

        <h1 className="mt-6 text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-text-muted">{description}</p>

        <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
          {children}
        </div>

        {footer ? (
          <div className="mt-5 text-center text-sm text-text-muted">{footer}</div>
        ) : null}
      </div>
    </main>
  );
}
