import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/auth-layout";
import { FormNote } from "@/components/auth/fields";
import { SignInForm } from "@/components/auth/sign-in-form";
import { DEMO } from "@/server/auth/demo";

export const metadata: Metadata = { title: "Try the demo" };

export default function DemoPage() {
  return (
    <AuthLayout
      title="Try the demo"
      description="The seeded Northwind Studio workspace: a processed meeting, imported tickets, and the review queue waiting for a decision."
      footer={
        <>
          Want your own workspace?{" "}
          <Link href="/sign-up" className="text-accent-ink hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <FormNote>
          The credentials are filled in for you, and the form below is the
          ordinary sign-in — the same password check as any account. The demo
          user is{" "}
          <span className="font-mono text-text">{DEMO.email}</span>.
        </FormNote>

        <SignInForm
          next={`/${DEMO.workspace}`}
          defaultEmail={DEMO.email}
          defaultPassword={DEMO.password}
          submitLabel="Enter the demo workspace"
        />
      </div>
    </AuthLayout>
  );
}
