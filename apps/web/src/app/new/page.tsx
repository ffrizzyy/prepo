import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { WorkspaceForm } from "@/components/auth/workspace-form";
import { requireUser } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Create a workspace" };

export default async function NewWorkspacePage() {
  // Flow A, step 2. Membership is created with the workspace, so this is the
  // only screen a user with no workspace can reach.
  const session = await requireUser();

  return (
    <AuthLayout
      title="Create a workspace"
      description={`Signed in as ${session.user.email}. A workspace holds its own meetings, tickets and people.`}
    >
      <WorkspaceForm />
    </AuthLayout>
  );
}
