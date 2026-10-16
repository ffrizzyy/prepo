"use client";

import { useEffect, useRef, useState } from "react";
import { GearSix, SignOut } from "@phosphor-icons/react";
import { signOut } from "@/server/auth/actions";
import { getInitials } from "@/lib/workspace-data";

export function AccountMenu({
  name,
  email,
  workspace,
}: {
  name: string;
  email: string;
  workspace: string;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${name}`}
        title={name}
        className="grid size-8 place-items-center rounded-full bg-ink text-[11px] font-medium text-white"
      >
        {getInitials(name)}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-11 z-40 w-60 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        >
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="mt-0.5 truncate text-xs text-text-subtle">{email}</p>
          </div>

          <a
            href={`/${workspace}/settings`}
            role="menuitem"
            className="flex items-center gap-2 px-3 py-2 text-sm text-text-muted hover:bg-surface-2 hover:text-text"
          >
            <GearSix size={16} aria-hidden />
            Settings
          </a>

          <form action={signOut}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-text-muted hover:bg-surface-2 hover:text-text"
            >
              <SignOut size={16} aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
