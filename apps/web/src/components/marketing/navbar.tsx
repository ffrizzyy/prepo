"use client";

import { useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { ArrowRight, GithubLogo, List, X } from "@phosphor-icons/react";
import { BRAND, NAV_LINKS, REPO_URL } from "@prepo/shared";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export function Navbar({ home = true }: { home?: boolean }) {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 8);
  });

  // The section anchors only exist on the landing page, so anywhere else they
  // have to point back at it.
  const anchor = (href: string) => (home ? href : `/${href}`);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-20 transition-colors duration-300",
        scrolled
          ? "border-b border-border bg-bg/80 backdrop-blur-md"
          : "border-b border-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href={home ? "#" : "/"} className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-1 bg-accent text-sm font-semibold text-accent-fg">
            P
          </span>
          <span className="text-lg font-semibold tracking-tight">{BRAND.name}</span>
        </a>

        <div className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={anchor(link.href)}
              className="rounded-2 px-3 py-2 text-sm text-text-muted transition-colors hover:text-text"
            >
              {link.label}
            </a>
          ))}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-2 px-3 py-2 text-sm text-text-muted transition-colors hover:text-text"
          >
            <GithubLogo size={16} weight="regular" />
            GitHub
          </a>
        </div>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <a
            href="/sign-in"
            className="hidden rounded-2 px-3 py-2 text-sm text-text-muted transition-colors hover:text-text sm:block"
          >
            Sign in
          </a>
          <a
            href="/demo"
            className={cn(buttonVariants({ size: "sm" }), "hidden sm:inline-flex")}
          >
            Try demo
          </a>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex size-9 items-center justify-center rounded-2 text-text-muted hover:bg-surface-2 hover:text-text lg:hidden"
          >
            {open ? <X size={18} /> : <List size={18} />}
          </button>
        </div>
      </nav>

      {open ? (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="border-t border-border bg-bg/95 backdrop-blur-md lg:hidden"
        >
          <div className="flex flex-col gap-1 px-4 py-3 sm:px-6">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={anchor(link.href)}
                onClick={() => setOpen(false)}
                className="rounded-2 px-3 py-2.5 text-sm text-text-muted hover:bg-surface-2 hover:text-text"
              >
                {link.label}
              </a>
            ))}
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-2 px-3 py-2.5 text-sm text-text-muted hover:bg-surface-2 hover:text-text"
            >
              <GithubLogo size={16} />
              GitHub
            </a>
            <a
              href="/sign-in"
              className="rounded-2 px-3 py-2.5 text-sm text-text-muted hover:bg-surface-2 hover:text-text"
            >
              Sign in
            </a>
            <a
              href="/demo"
              className={cn(buttonVariants({ size: "md" }), "mt-2 justify-center")}
            >
              Try demo
              <ArrowRight size={16} weight="bold" />
            </a>
          </div>
        </motion.div>
      ) : null}
    </header>
  );
}
