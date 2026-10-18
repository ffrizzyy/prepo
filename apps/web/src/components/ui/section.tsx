import { cn } from "@/lib/utils";

export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>
      {children}
    </div>
  );
}

export function Section({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("py-16 md:py-24", className)}>
      <Container>{children}</Container>
    </section>
  );
}

/**
 * A kicker, not a label. It stays quiet and sentence-case on purpose: shouting a
 * restatement of the headline in uppercase mono (HOW IT WORKS above "How it
 * works") is the tell R-06 and R-09 name, and it adds nothing a reader needs. Use
 * it only where it carries a fact the headline does not, such as the class of
 * document a legal page is.
 */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-xs font-medium text-text-subtle">{children}</p>;
}
