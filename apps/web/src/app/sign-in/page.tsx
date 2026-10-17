import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth/auth-layout";
import { SignInForm } from "@/components/auth/sign-in-form";
import {
  getSession,
  readChallengeCookie,
} from "@/server/auth/dal";
import { findChallenge } from "@/server/auth/challenges";
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

  // A live challenge means this browser is past the password and owes the
  // second factor; a reload mid-flow resumes that step instead of restart.
  const challengeToken = await readChallengeCookie();
  const challenge = challengeToken ? await findChallenge(challengeToken) : null;
  const awaitingFactor = challenge !== null;

  return (
    <AuthLayout
      title={awaitingFactor ? "Two-factor required" : "Sign in"}
      description={
        awaitingFactor
          ? "Enter the code to finish signing in."
          : "Continue to your workspaces."
      }
      footer={
        awaitingFactor ? undefined : (
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
        )
      }
    >
      <SignInForm
        initialStage={awaitingFactor ? "totp" : "credentials"}
        next={next}
        defaultEmail={email}
      />
    </AuthLayout>
  );
}
