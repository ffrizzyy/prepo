"use client";

import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { ActionItem, Ticket, TicketStatusId } from "@prepo/shared";

type State = {
  tickets: Ticket[];
  actionItems: ActionItem[];
};

type Action =
  | { type: "approve"; ids: string[] }
  | { type: "reject"; id: string }
  | { type: "move"; id: string; status: TicketStatusId };

const HIGH_CONFIDENCE = 0.85;

function nextKey(tickets: Ticket[]): string {
  const max = tickets.reduce((acc, ticket) => {
    const value = Number(ticket.key.split("-")[1] ?? 0);
    return Number.isFinite(value) ? Math.max(acc, value) : acc;
  }, 100);
  return `PRE-${max + 1}`;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "approve": {
      const ids = new Set(action.ids);
      const approved = state.actionItems.filter((item) => ids.has(item.id));
      if (approved.length === 0) return state;

      let tickets = [...state.tickets];
      for (const item of approved) {
        const key = nextKey(tickets);
        tickets = [
          ...tickets,
          {
            id: `tk_${key.replace("-", "_").toLowerCase()}`,
            key,
            actionItemId: item.id,
            title: item.title,
            description: item.description,
            assigneeName: item.ownerName,
            status: item.ownerName ? "todo" : "backlog",
            priority: item.priority,
            dueAt: item.dueAt,
            labels: ["from-meeting"],
            linearUrl: null,
            meetingId: item.meetingId,
            sourceQuote: item.title,
            createdAt: new Date().toISOString(),
          },
        ];
      }

      return {
        tickets,
        actionItems: state.actionItems.map((item) =>
          ids.has(item.id) ? { ...item, status: "ticketed" } : item,
        ),
      };
    }

    case "reject":
      return {
        ...state,
        actionItems: state.actionItems.map((item) =>
          item.id === action.id ? { ...item, status: "rejected" } : item,
        ),
      };

    case "move":
      return {
        ...state,
        tickets: state.tickets.map((ticket) =>
          ticket.id === action.id ? { ...ticket, status: action.status } : ticket,
        ),
      };

    default:
      return state;
  }
}

type StoreValue = {
  tickets: Ticket[];
  actionItems: ActionItem[];
  approveActionItem: (id: string) => void;
  rejectActionItem: (id: string) => void;
  approveAllHighConfidence: () => void;
  moveTicket: (id: string, status: TicketStatusId) => void;
};

const StoreContext = createContext<StoreValue | null>(null);

export function WorkspaceStoreProvider({
  initialTickets,
  initialActionItems,
  children,
}: {
  initialTickets: Ticket[];
  initialActionItems: ActionItem[];
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, {
    tickets: initialTickets,
    actionItems: initialActionItems,
  });

  const value = useMemo<StoreValue>(
    () => ({
      tickets: state.tickets,
      actionItems: state.actionItems,
      approveActionItem: (id) => dispatch({ type: "approve", ids: [id] }),
      rejectActionItem: (id) => dispatch({ type: "reject", id }),
      approveAllHighConfidence: () =>
        dispatch({
          type: "approve",
          ids: state.actionItems
            .filter(
              (item) =>
                item.status === "proposed" &&
                item.confidence >= HIGH_CONFIDENCE &&
                item.flags.length === 0,
            )
            .map((item) => item.id),
        }),
      moveTicket: (id, status) => dispatch({ type: "move", id, status }),
    }),
    [state.tickets, state.actionItems],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useWorkspaceStore(): StoreValue {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error("useWorkspaceStore must be used inside WorkspaceStoreProvider");
  }
  return context;
}
