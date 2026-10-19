import { cache } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "./auth/dal";
import {
  getWorkspace,
  getWorkspaceMembers,
  resolveWorkspaceId,
  type WorkspaceMember,
} from "./db/repo";
import type { WorkspaceSettings } from "./db/schema";

export type WorkspaceContext = {
  id: string;
  slug: string;
  name: string;
  settings: WorkspaceSettings;
  /** The signed-in user's own membership, including their role. */
  viewer: WorkspaceMember;
  members: WorkspaceMember[];
};

/**
 * Resolves a workspace slug to its context, or 404s. Pages and server actions
 * both go through here, so the tenant is always decided on the server, a client
 * only ever sends the slug that is already in its URL.
 *
 * An unauthenticated request is redirected to sign-in; an authenticated user who
 * is not a member of this workspace gets a 404 rather than a 403, so the app
 * never confirms that someone else's workspace exists (PREPO.md §9.3 A01).
 *
 * Wrapped in `cache` so the layout and the page share one lookup per request.
 */
export const requireWorkspace = cache(
  async (slug: string): Promise<WorkspaceContext> => {
    const session = await requireUser();

    const id = await resolveWorkspaceId(slug);
    if (!id) notFound();

    const workspace = await getWorkspace(id);
    if (!workspace) notFound();

    const members = await getWorkspaceMembers(id);
    const viewer = members.find((member) => member.userId === session.userId);
    if (!viewer) notFound();

    return {
      id,
      slug: workspace.slug,
      name: workspace.name,
      settings: workspace.settings,
      viewer,
      members,
    };
  },
);
