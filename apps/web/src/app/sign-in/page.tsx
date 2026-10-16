import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth/auth-layout";
import { SignInForm } from "@/components/auth/sign-in-form";
import { getSession } from "@/server/auth/dal";
import { listWorkspacesForUser } from "@/server/db/repo";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const { next, email } = await searchParams;

  // Already signed in? Go where the session would have landed anyway.
  const session = await getSession();
  if (session) {
    const workspaces = await listWorkspacesForUser(session.userId);
    const first = workspaces[0];
    redirect(first ? `/${first.slug}` : "/new");
  }

  return (
    <AuthLayout
      title="Sign in"
      description="Continue to your workspaces."
      footer={
        <>
          No account?{" "}
          <Link href="/sign-up" className="text-accent-ink hover:underline">
            Create one
          </Link>
          {" · "}
          <Link href="/demo" className="text-accent-ink hover:underline">
            Try the demo
          </Link>
        </>
      }
    >
      <SignInForm next={next} defaultEmail={email} />
    </AuthLayout>
  );
}
