"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  CalendarBlank,
  ChartLineUp,
  GearSix,
  Kanban,
  MagnifyingGlass,
  PaperPlaneTilt,
  Plus,
  SquaresFour,
  Ticket as TicketIcon,
  type Icon,
} from "@phosphor-icons/react";
import { BRAND } from "@prepo/shared";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/workspace-data";

type NavItem = {
  href: string;
  label: string;
  icon: Icon;
  badge?: number;
};

export function useWorkspaceNav(workspace: string) {
  return useMemo<NavItem[]>(
    () => [
      { href: `/${workspace}`, label: "Dashboard", icon: SquaresFour },
      { href: `/${workspace}/meetings`, label: "Meetings", icon: CalendarBlank },
      { href: `/${workspace}/board`, label: "Board", icon: Kanban },
      { href: `/${workspace}/tickets`, label: "Tickets", icon: TicketIcon, badge: 3 },
      { href: `/${workspace}/followups`, label: "Follow-ups", icon: PaperPlaneTilt },
      { href: `/${workspace}/insights`, label: "Insights", icon: ChartLineUp },
      { href: `/${workspace}/settings`, label: "Settings", icon: GearSix },
    ],
    [workspace],
  );
}

export function AppShell({
  workspace,
  workspaceName,
  viewerName,
  reviewCount,
  children,
}: {
  workspace: string;
  workspaceName: string;
  viewerName: string;
  reviewCount: number;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const navItems = useWorkspaceNav(workspace);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="min-h-dvh bg-bg">
      <Sidebar
        workspace={workspace}
        navItems={navItems}
        collapsed={collapsed}
        reviewCount={reviewCount}
        onToggle={() => setCollapsed((value) => !value)}
      />

      <div
        className={cn(
          "flex min-h-dvh flex-col transition-[padding] duration-200",
          collapsed ? "lg:pl-[76px]" : "lg:pl-[248px]",
        )}
      >
        <Topbar
          workspace={workspace}
          workspaceName={workspaceName}
          viewerName={viewerName}
          reviewCount={reviewCount}
          onOpenPalette={() => setPaletteOpen(true)}
          onToggleSidebar={() => setCollapsed((value) => !value)}
        />
        <main className="flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-12">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>

      <BottomNav
        workspace={workspace}
        navItems={navItems}
        moreOpen={moreOpen}
        onToggleMore={() => setMoreOpen((value) => !value)}
      />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        navItems={navItems}
      />
    </div>
  );
}

function Sidebar({
  workspace,
  navItems,
  collapsed,
  reviewCount,
  onToggle,
}: {
  workspace: string;
  navItems: NavItem[];
  collapsed: boolean;
  reviewCount: number;
  onToggle: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-surface transition-[width] duration-200 lg:flex",
        collapsed ? "w-[76px]" : "w-[248px]",
      )}
    >
      <div className="flex h-16 items-center gap-2 px-4">
        <span className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-accent text-sm font-semibold text-accent-fg">
          P
        </span>
        {!collapsed ? (
          <span className="text-base font-semibold tracking-tight">{BRAND.name}</span>
        ) : null}
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2 py-2">
        {navItems.map((item) => {
          const active =
            item.href === `/${workspace}`
              ? pathname === item.href
              : pathname.startsWith(item.href);
          const count = item.label === "Tickets" ? reviewCount : item.badge;
          return (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={active}
              collapsed={collapsed}
              badge={count}
            />
          );
        })}
      </nav>

      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-center gap-2 rounded-[10px] px-3 py-2 text-xs text-text-muted hover:bg-surface-2 hover:text-text"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "»" : "« Collapse"}
        </button>
      </div>
    </aside>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  badge,
}: {
  href: string;
  label: string;
  icon: Icon;
  active: boolean;
  collapsed: boolean;
  badge?: number;
}) {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm transition-colors",
        collapsed && "justify-center px-0",
        active
          ? "bg-accent-soft font-medium text-accent-ink"
          : "text-text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      <Icon size={18} weight={active ? "fill" : "regular"} aria-hidden />
      {!collapsed ? <span className="flex-1 truncate">{label}</span> : null}
      {!collapsed && badge ? (
        <span className="rounded-full bg-accent px-1.5 font-mono text-[10px] text-accent-fg">
          {badge}
        </span>
      ) : null}
    </a>
  );
}

function Topbar({
  workspace,
  workspaceName,
  viewerName,
  reviewCount,
  onOpenPalette,
  onToggleSidebar,
}: {
  workspace: string;
  workspaceName: string;
  viewerName: string;
  reviewCount: number;
  onOpenPalette: () => void;
  onToggleSidebar: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onToggleSidebar}
        className="hidden size-9 items-center justify-center rounded-[10px] text-text-muted hover:bg-surface-2 hover:text-text lg:inline-flex"
        aria-label="Toggle sidebar"
      >
        ☰
      </button>

      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium">{workspaceName}</span>
        <span className="hidden font-mono text-[11px] text-text-subtle sm:inline">
          /{workspace}
        </span>
      </div>

      <button
        type="button"
        onClick={onOpenPalette}
        className="ml-auto hidden h-9 w-64 items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-3 text-sm text-text-subtle hover:bg-surface md:flex"
      >
        <MagnifyingGlass size={15} aria-hidden />
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd className="rounded border border-border bg-surface px-1.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </button>

      <button
        type="button"
        onClick={onOpenPalette}
        className="ml-auto inline-flex size-9 items-center justify-center rounded-[10px] text-text-muted hover:bg-surface-2 hover:text-text md:hidden"
        aria-label="Search"
      >
        <MagnifyingGlass size={18} />
      </button>

      <a
        href={`/${workspace}/tickets`}
        className="relative inline-flex size-9 items-center justify-center rounded-[10px] text-text-muted hover:bg-surface-2 hover:text-text"
        aria-label={`Notifications, ${reviewCount} needing review`}
      >
        <Bell size={18} />
        {reviewCount > 0 ? (
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-accent" />
        ) : null}
      </a>

      <ThemeToggle />

      <span
        className="grid size-8 place-items-center rounded-full bg-ink text-[11px] font-medium text-white"
        title={viewerName}
      >
        {getInitials(viewerName)}
      </span>
    </header>
  );
}

function BottomNav({
  workspace,
  navItems,
  moreOpen,
  onToggleMore,
}: {
  workspace: string;
  navItems: NavItem[];
  moreOpen: boolean;
  onToggleMore: () => void;
}) {
  const pathname = usePathname();
  const primary = navItems.filter((item) =>
    ["Dashboard", "Meetings", "Board", "Tickets"].includes(item.label),
  );
  const secondary = navItems.filter(
    (item) => !["Dashboard", "Meetings", "Board", "Tickets"].includes(item.label),
  );

  return (
    <>
      {moreOpen ? (
        <div className="fixed inset-x-0 bottom-16 z-40 mx-3 rounded-2xl border border-border bg-surface p-2 shadow-lg lg:hidden">
          {secondary.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={onToggleMore}
              className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm text-text-muted hover:bg-surface-2 hover:text-text"
            >
              <item.icon size={18} aria-hidden />
              {item.label}
            </a>
          ))}
        </div>
      ) : null}

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Primary"
      >
        {primary.map((item) => {
          const active =
            item.href === `/${workspace}`
              ? pathname === item.href
              : pathname.startsWith(item.href);
          return (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-[10px]",
                active ? "text-accent-ink" : "text-text-subtle",
              )}
            >
              <item.icon size={20} weight={active ? "fill" : "regular"} aria-hidden />
              {item.label}
            </a>
          );
        })}
        <button
          type="button"
          onClick={onToggleMore}
          aria-expanded={moreOpen}
          className="flex flex-1 flex-col items-center justify-center gap-1 text-[10px] text-text-subtle"
        >
          <Plus size={20} className={moreOpen ? "rotate-45" : undefined} aria-hidden />
          More
        </button>
      </nav>
    </>
  );
}

function CommandPalette({
  open,
  onOpenChange,
  navItems,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  navItems: NavItem[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return navItems;
    return navItems.filter((item) => item.label.toLowerCase().includes(value));
  }, [navItems, query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onOpenChange(false);
            if (event.key === "Enter" && results[0]) {
              router.push(results[0].href);
              onOpenChange(false);
            }
          }}
          placeholder="Jump to…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none"
        />
        <ul className="max-h-72 overflow-y-auto p-2">
          {results.map((item) => (
            <li key={item.href}>
              <button
                type="button"
                onClick={() => {
                  router.push(item.href);
                  onOpenChange(false);
                }}
                className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-sm text-text-muted hover:bg-surface-2 hover:text-text"
              >
                <item.icon size={16} aria-hidden />
                {item.label}
              </button>
            </li>
          ))}
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-text-subtle">
              Nothing matches “{query}”.
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
