import type * as t from "../db/schema";

/**
 * The seam between Prepo and Linear, in the same spirit as
 * `TranscriptionProvider`: a real GraphQL client for a connected workspace and
 * a fixture client for the suites, behind one interface. Nothing above this file
 * knows which one it is talking to.
 */

export type RemoteTeam = { id: string; key: string; name: string };
export type RemoteProject = { id: string; name: string };
export type RemoteState = { id: string; name: string; type: string };
export type RemoteUser = { id: string; name: string; email: string };

export type RemoteIssue = {
  id: string;
  /** Linear's human key, e.g. `ENG-142`. */
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  /** Linear's own scale: 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
  priority: number;
  /** `yyyy-mm-dd`: Linear stores a date, not a timestamp. */
  dueDate: string | null;
  updatedAt: string;
  state: RemoteState;
  assignee: RemoteUser | null;
  teamId: string;
};

export type IssueWrite = {
  teamId: string;
  projectId: string | null;
  title: string;
  description: string;
  priority: number;
  assigneeId: string | null;
  dueDate: string | null;
  /** Absent means "the team's default state", which is what Linear does anyway. */
  stateId?: string;
};

export type IssuePatch = Partial<Omit<IssueWrite, "teamId">> & {
  stateId?: string;
};

export interface LinearClient {
  readonly name: string;
  viewer(): Promise<RemoteUser>;
  teams(): Promise<RemoteTeam[]>;
  projects(teamId: string): Promise<RemoteProject[]>;
  states(teamId: string): Promise<RemoteState[]>;
  members(teamId: string): Promise<RemoteUser[]>;
  createIssue(input: IssueWrite): Promise<RemoteIssue>;
  updateIssue(issueId: string, patch: IssuePatch): Promise<RemoteIssue>;
  issue(issueId: string): Promise<RemoteIssue | null>;
  /** Everything in the team that changed after `since` (an ISO timestamp). */
  issuesUpdatedSince(teamId: string, since: string): Promise<RemoteIssue[]>;
}

export type LinearTicketStatus = (typeof t.ticketStatus.enumValues)[number];
export type LinearPriority = (typeof t.priority.enumValues)[number];

/**
 * A change to apply to a mirrored ticket. Every field is optional because a
 * webhook carries only what changed: `undefined` means "not in the payload, do
 * not touch", while `null` means "explicitly cleared" (an unassigned issue
 * really does have no assignee).
 */
export type RemotePatch = {
  issueId: string;
  identifier?: string | null;
  stateType?: string | null;
  assigneeEmail?: string | null;
  title?: string | null;
  priority?: number | null;
  dueDate?: string | null;
  updatedAt?: string | null;
};

/** Raised for a refused call, carrying Linear's own words where it gave them. */
export class LinearError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LinearError";
  }
}
