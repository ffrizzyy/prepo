import {
  LinearError,
  type IssuePatch,
  type IssueWrite,
  type LinearClient,
  type RemoteIssue,
  type RemoteProject,
  type RemoteState,
  type RemoteTeam,
  type RemoteUser,
} from "./types";

/**
 * The real client: Linear's single GraphQL endpoint, called from the server with
 * a token read from the environment or decrypted out of the integration row.
 *
 * Personal API keys are sent raw in `Authorization`; OAuth tokens need the
 * `Bearer ` prefix. That difference is a parameter rather than a guess, because
 * sending one as the other produces a 400 that reads like a permissions problem.
 */

const ENDPOINT = "https://api.linear.app/graphql";
const TIMEOUT_MS = 20_000;
/** A page of issues per request; the pull walks at most this many pages. */
const PAGE_SIZE = 50;
const MAX_PAGES = 10;

const ISSUE_FIELDS = `
  id
  identifier
  title
  description
  url
  priority
  dueDate
  updatedAt
  state { id name type }
  assignee { id name email }
  team { id }
`;

type GraphQlResponse = {
  data?: Record<string, unknown>;
  errors?: { message?: string }[];
};

function asIssue(node: unknown): RemoteIssue {
  const issue = node as {
    id: string;
    identifier: string;
    title: string;
    description: string | null;
    url: string;
    priority: number;
    dueDate: string | null;
    updatedAt: string;
    state: RemoteState;
    assignee: RemoteUser | null;
    team?: { id: string };
  };

  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? null,
    url: issue.url,
    priority: issue.priority ?? 0,
    dueDate: issue.dueDate ?? null,
    updatedAt: issue.updatedAt,
    state: issue.state,
    assignee: issue.assignee ?? null,
    teamId: issue.team?.id ?? "",
  };
}

export function linearClient(
  token: string,
  authStyle: "personal" | "oauth" = "personal",
): LinearClient {
  const authorization =
    authStyle === "oauth" ? `Bearer ${token}` : token;

  async function query<T>(
    document: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: document, variables }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      throw new LinearError(`Linear could not be reached (${reason}).`);
    }

    const text = await response.text();
    let body: GraphQlResponse = {};
    try {
      body = JSON.parse(text) as GraphQlResponse;
    } catch {
      throw new LinearError(
        `Linear returned a body that is not JSON (${response.status}).`,
        response.status,
      );
    }

    if (body.errors?.length) {
      const message = body.errors
        .map((error) => error.message ?? "unknown error")
        .join("; ");
      throw new LinearError(`Linear refused it: ${message.slice(0, 300)}`, response.status);
    }

    if (!response.ok || !body.data) {
      throw new LinearError(
        `Linear refused it (${response.status}).`,
        response.status,
      );
    }

    return body.data as T;
  }

  async function mutateIssue(
    document: string,
    variables: Record<string, unknown>,
    field: "issueCreate" | "issueUpdate",
  ): Promise<RemoteIssue> {
    const data = await query<Record<string, { success: boolean; issue?: unknown }>>(
      document,
      variables,
    );
    const payload = data[field];
    if (!payload?.success || !payload.issue) {
      throw new LinearError(`Linear did not confirm the ${field} call.`);
    }
    return asIssue(payload.issue);
  }

  return {
    name: "linear",

    async viewer() {
      const data = await query<{ viewer: RemoteUser }>(
        `query PrepoViewer { viewer { id name email } }`,
      );
      return data.viewer;
    },

    async teams() {
      const data = await query<{ teams: { nodes: RemoteTeam[] } }>(
        `query PrepoTeams { teams { nodes { id key name } } }`,
      );
      return data.teams.nodes;
    },

    async projects(teamId) {
      const data = await query<{ team: { projects: { nodes: RemoteProject[] } } }>(
        `query PrepoProjects($teamId: String!) {
           team(id: $teamId) { projects { nodes { id name } } }
         }`,
        { teamId },
      );
      return data.team?.projects?.nodes ?? [];
    },

    async states(teamId) {
      const data = await query<{ team: { states: { nodes: RemoteState[] } } }>(
        `query PrepoStates($teamId: String!) {
           team(id: $teamId) { states { nodes { id name type } } }
         }`,
        { teamId },
      );
      return data.team?.states?.nodes ?? [];
    },

    async members(teamId) {
      const data = await query<{ team: { members: { nodes: RemoteUser[] } } }>(
        `query PrepoMembers($teamId: String!) {
           team(id: $teamId) { members { nodes { id name email } } }
         }`,
        { teamId },
      );
      return data.team?.members?.nodes ?? [];
    },

    async createIssue(input: IssueWrite) {
      return mutateIssue(
        `mutation PrepoCreateIssue($input: IssueCreateInput!) {
           issueCreate(input: $input) { success issue { ${ISSUE_FIELDS} } }
         }`,
        {
          input: {
            teamId: input.teamId,
            title: input.title,
            description: input.description,
            priority: input.priority,
            dueDate: input.dueDate,
            assigneeId: input.assigneeId,
            projectId: input.projectId,
            ...(input.stateId ? { stateId: input.stateId } : {}),
          },
        },
        "issueCreate",
      );
    },

    async updateIssue(issueId: string, patch: IssuePatch) {
      return mutateIssue(
        `mutation PrepoUpdateIssue($id: String!, $input: IssueUpdateInput!) {
           issueUpdate(id: $id, input: $input) { success issue { ${ISSUE_FIELDS} } }
         }`,
        { id: issueId, input: patch },
        "issueUpdate",
      );
    },

    async issue(issueId: string) {
      const data = await query<{ issue: unknown }>(
        `query PrepoIssue($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`,
        { id: issueId },
      );
      return data.issue ? asIssue(data.issue) : null;
    },

    async issuesUpdatedSince(teamId, since) {
      const collected: RemoteIssue[] = [];
      let after: string | null = null;

      for (let page = 0; page < MAX_PAGES; page += 1) {
        const data: {
          issues: {
            nodes: unknown[];
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
          };
        } = await query(
          `query PrepoIssues($teamId: ID!, $since: DateTimeOrDuration!, $after: String) {
             issues(
               filter: { team: { id: { eq: $teamId } }, updatedAt: { gt: $since } }
               first: ${PAGE_SIZE}
               after: $after
             ) {
               nodes { ${ISSUE_FIELDS} }
               pageInfo { hasNextPage endCursor }
             }
           }`,
          { teamId, since, after },
        );

        collected.push(...data.issues.nodes.map(asIssue));
        if (!data.issues.pageInfo.hasNextPage) break;
        after = data.issues.pageInfo.endCursor;
      }

      return collected;
    },
  };
}
