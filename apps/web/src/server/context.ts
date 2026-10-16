import { cache } from "react";
import { notFound } from "next/navigation";
import {
  getWorkspace,
  getWorkspaceMembers,
  resolveWorkspaceId,
  type WorkspaceMember,
} from "./db/repo";
import type { MembershipRole, WorkspaceSettings } from "./db/schema";

export type WorkspaceContext = {
  id: string;
  slug: string;
  name: string;
  settings: WorkspaceSettings;
  /** The acting user. Until auth lands this is the highest-privilege member. */
  viewer: WorkspaceMember;
  members: WorkspaceMember[];
};

const ROLE_RANK: Record<MembershipRole, number> = {
  owner: 0,
  admin: 1,
  member: 2,
  viewer: 3,
};

/**
 * Resolves a workspace slug to its context, or 404s. Pages and server actions
 * both go through here, so the tenant is always decided on the server — a client
 * only ever sends the slug that is already in its URL.
 *
 * Wrapped in `cache` so the layout and the page share one lookup per request.
 *
 * Auth is the next milestone; the viewer is currently a stand-in.
 */
export const requireWorkspace = cache(
  async (slug: string): Promise<WorkspaceContext> => {
    const id = await resolveWorkspaceId(slug);
    if (!id) notFound();

    const workspace = await getWorkspace(id);
    if (!workspace) notFound();

    const members = await getWorkspaceMembers(id);
    const viewer = [...members].sort(
      (a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role],
    )[0];
    // A workspace with no members has nobody who could be signed in to it.
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
