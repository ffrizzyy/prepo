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
 * An in-memory Linear, for the suites and for any deployment with no key.
 *
 * It is deliberately a *real* object with real state, not a set of stubbed
 * return values: tests can read back what Prepo sent, edit an issue behind the
 * app's back to simulate a pull, and make a call fail to exercise the retry
 * path. What it is not is evidence that Linear itself behaves this way, that
 * needs a key, and the smoke test says so.
 */

export type FixtureFailure =
  | "teams"
  | "projects"
  | "states"
  | "members"
  | "createIssue"
  | "updateIssue"
  | "issue"
  | "issuesUpdatedSince";

export type FixtureOptions = {
  teams?: RemoteTeam[];
  projects?: RemoteProject[];
  states?: RemoteState[];
  members?: RemoteUser[];
  issues?: RemoteIssue[];
  /** Make every call of these kinds fail with the message given. */
  fail?: Partial<Record<FixtureFailure, string>>;
};

export type LinearFixture = {
  client: LinearClient;
  /** What Prepo asked Linear to create, in order. */
  readonly created: IssueWrite[];
  /** What Prepo asked Linear to change, in order. */
  readonly updates: { issueId: string; patch: IssuePatch }[];
  /** Every document name requested, so a test can prove nothing was called. */
  readonly calls: string[];
  remoteIssues: RemoteIssue[];
  touch(issueId: string, patch: Partial<RemoteIssue>): void;
  remove(issueId: string): void;
};

const DEFAULT_TEAM: RemoteTeam = { id: "team-eng", key: "ENG", name: "Engineering" };

const DEFAULT_STATES: RemoteState[] = [
  { id: "state-backlog", name: "Backlog", type: "backlog" },
  { id: "state-todo", name: "Todo", type: "unstarted" },
  { id: "state-progress", name: "In Progress", type: "started" },
  { id: "state-done", name: "Done", type: "completed" },
  { id: "state-cancelled", name: "Cancelled", type: "canceled" },
];

const DEFAULT_MEMBERS: RemoteUser[] = [
  { id: "linear-lena", name: "Lena Fischer", email: "lena@northwind.dev" },
  { id: "linear-sam", name: "Sam Okafor", email: "sam@northwind.dev" },
];

let counter = 0;

export function fixtureLinear(options: FixtureOptions = {}): LinearFixture {
  const teams = options.teams ?? [DEFAULT_TEAM];
  const projects = options.projects ?? [
    { id: "project-q4", name: "Q4 Launch" },
  ];
  const states = options.states ?? DEFAULT_STATES;
  const members = options.members ?? DEFAULT_MEMBERS;

  const created: IssueWrite[] = [];
  const updates: { issueId: string; patch: IssuePatch }[] = [];
  const calls: string[] = [];

  const guard = (kind: FixtureFailure) => {
    const failure = options.fail?.[kind];
    if (failure) throw new LinearError(failure, 400);
  };

  const stateForType = (type: string) =>
    states.find((state) => state.type === type) ?? states[0]!;

  const fixture: LinearFixture = {
    created,
    updates,
    calls,
    remoteIssues: [...(options.issues ?? [])],

    touch(issueId, patch) {
      const issue = fixture.remoteIssues.find((entry) => entry.id === issueId);
      if (issue) Object.assign(issue, patch);
    },

    remove(issueId) {
      fixture.remoteIssues = fixture.remoteIssues.filter(
        (entry) => entry.id !== issueId,
      );
    },

    client: {
      name: "linear-fixture",

      async viewer() {
        calls.push("viewer");
        guard("teams");
        return members[0]!;
      },

      async teams() {
        calls.push("teams");
        guard("teams");
        return teams;
      },

      async projects() {
        calls.push("projects");
        guard("projects");
        return projects;
      },

      async states() {
        calls.push("states");
        guard("states");
        return states;
      },

      async members() {
        calls.push("members");
        guard("members");
        return members;
      },

      async createIssue(input: IssueWrite) {
        calls.push("createIssue");
        guard("createIssue");
        created.push(input);

        counter += 1;
        const issue: RemoteIssue = {
          id: `fixture-issue-${counter}`,
          identifier: `ENG-${100 + counter}`,
          title: input.title,
          description: input.description,
          url: `https://linear.app/fixture/issue/ENG-${100 + counter}`,
          priority: input.priority,
          dueDate: input.dueDate,
          updatedAt: new Date().toISOString(),
          state: { ...stateForType("unstarted") },
          assignee: members.find((member) => member.id === input.assigneeId) ?? null,
          teamId: input.teamId,
        };
        fixture.remoteIssues.push(issue);
        return issue;
      },

      async updateIssue(issueId: string, patch: IssuePatch) {
        calls.push("updateIssue");
        guard("updateIssue");

        const issue = fixture.remoteIssues.find((entry) => entry.id === issueId);
        if (!issue) throw new LinearError(`No such issue: ${issueId}`, 404);

        updates.push({ issueId, patch });
        if (patch.title !== undefined) issue.title = patch.title;
        if (patch.description !== undefined) issue.description = patch.description;
        if (patch.priority !== undefined) issue.priority = patch.priority;
        if (patch.dueDate !== undefined) issue.dueDate = patch.dueDate;
        if (patch.assigneeId !== undefined) {
          issue.assignee =
            members.find((member) => member.id === patch.assigneeId) ?? null;
        }
        if (patch.stateId !== undefined) {
          const state = states.find((entry) => entry.id === patch.stateId);
          if (state) issue.state = { ...state };
        }
        issue.updatedAt = new Date().toISOString();
        return issue;
      },

      async issue(issueId: string) {
        calls.push("issue");
        guard("issue");
        return fixture.remoteIssues.find((entry) => entry.id === issueId) ?? null;
      },

      async issuesUpdatedSince(_teamId: string, since: string) {
        calls.push("issuesUpdatedSince");
        guard("issuesUpdatedSince");
        const from = new Date(since).getTime();
        return fixture.remoteIssues.filter(
          (issue) => new Date(issue.updatedAt).getTime() > from,
        );
      },
    },
  };

  return fixture;
}

export const FIXTURE_STATE_IDS = {
  backlog: "state-backlog",
  unstarted: "state-todo",
  started: "state-progress",
  completed: "state-done",
  canceled: "state-cancelled",
} as const;
