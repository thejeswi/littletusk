// Durable state of the one Little Tusk conversation: documents and entry kinds.
import { defineDoc } from "@earendil-works/pi-durable";

/** Entry kinds written by Little Tusk (shown in the chat; the model never sees most of them). */
export const KIND = {
  user: "tusk.user", // an input from the person: data { text, via }
  answer: "tusk.answer", // the person's Yes/No on a confirm or offer: data { itemId, yes }
  say: "tusk.say", // a Tusk message written without a model call (greeting)
  notice: "tusk.notice", // plain-words notice (no key, budget, errors): data { text }
  action: "tusk.action", // an action done locally, no model call: data { text }
  confirm: "tusk.confirm", // Yes/No question before an irreversible step: data { question }
  offer: "tusk.offer", // "Shall I do it for you?": data { text }
} as const;

export type TuskState = {
  /** The tab Tusk works in: where the person last sent input. 0 = none yet. */
  taskTabId: number;
  /** The latest confirm item was answered yes and no irreversible action has used it yet. */
  grantConfirm: boolean;
  /** Show mode: the person accepted an offer (or asked Tusk to do it), so acting tools are allowed. */
  doIt: boolean;
  /** Tool errors in a row. */
  failStreak: number;
  /** "It still doesn't work" messages in this topic. */
  stillCount: number;
  /** Working with the strong model until the next new topic. */
  escalated: boolean;
  lastActive: number;
  greeted: boolean;
};

export const INITIAL_STATE: TuskState = {
  taskTabId: 0,
  grantConfirm: false,
  doIt: false,
  failStreak: 0,
  stillCount: 0,
  escalated: false,
  lastActive: 0,
  greeted: false,
};

export const StateDoc = defineDoc<TuskState>({
  kind: "tusk.state",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ ...INITIAL_STATE }),
});

/** Spend per month ("YYYY-MM") and the usage total already counted. */
export type Ledger = { months: Record<string, number>; lastTotal: number };

export const LedgerDoc = defineDoc<Ledger>({
  kind: "tusk.ledger",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ months: {}, lastTotal: 0 }),
});

export type Notebook = { notes: string[] };

export const NotebookDoc = defineDoc<Notebook>({
  kind: "tusk.notebook",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ notes: [] }),
});

export const NOTEBOOK_MAX = 2000;
