import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth/auth-layout";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { getSession } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage() {
  const session = await getSession();
  if (session) redirect("/new");

  return (
    <AuthLayout
      title="Create your account"
      description="One account, any number of workspaces. Takes a moment."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className="text-accent-ink hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthLayout>
  );
}
