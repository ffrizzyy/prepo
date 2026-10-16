import {
  SAMPLE_ACTION_ITEMS,
  SAMPLE_MEETING,
  SAMPLE_MEETING_LIST,
  SAMPLE_ROSTER,
  SAMPLE_SEGMENTS,
  SAMPLE_TICKETS,
  WORKSPACE,
  type ActionItem,
  type Meeting,
  type Ticket,
  type TranscriptSegment,
} from "@prepo/shared";

export type RosterMember = (typeof SAMPLE_ROSTER)[number];

export const CURRENT_USER: RosterMember = SAMPLE_ROSTER[0]!;

export function getWorkspace() {
  return WORKSPACE;
}

export function getMeetings(): Meeting[] {
  return SAMPLE_MEETING_LIST;
}

export function getMeeting(id: string): Meeting | undefined {
  return SAMPLE_MEETING_LIST.find((meeting) => meeting.id === id);
}

export function getSegments(meetingId: string): TranscriptSegment[] {
  return meetingId === SAMPLE_MEETING.id ? SAMPLE_SEGMENTS : [];
}

export function getActionItems(meetingId?: string): ActionItem[] {
  if (!meetingId) return SAMPLE_ACTION_ITEMS;
  return SAMPLE_ACTION_ITEMS.filter((item) => item.meetingId === meetingId);
}

export function getTickets(): Ticket[] {
  return SAMPLE_TICKETS;
}

export function getTicket(key: string): Ticket | undefined {
  return SAMPLE_TICKETS.find((ticket) => ticket.key === key);
}

export function getRoster(): RosterMember[] {
  return SAMPLE_ROSTER;
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDate(value: string | null): string {
  if (!value) return "No date";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function relativeDue(value: string | null): string {
  if (!value) return "No date";
  const due = new Date(value).getTime();
  const now = Date.now();
  const days = Math.round((due - now) / 86_400_000);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days === -1) return "1 day overdue";
  if (days < 0) return `${Math.abs(days)} days overdue`;
  return `Due in ${days} days`;
}

export function isOverdue(value: string | null): boolean {
  if (!value) return false;
  return new Date(value).getTime() < Date.now();
}
