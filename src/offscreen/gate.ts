// The code-enforced rules before an acting tool runs. Pure, so they are unit tested.
import type { Mode } from "../shared/protocol";
import { isWebUrl } from "../shared/protocol";
import type { TuskState } from "./state";

/** Tools that change the page or the browser. Pointing, reading and asking are not in here. */
export const ACTING_TOOLS = new Set(["click", "type_text", "select_option", "go_back", "open_url"]);
/** Acting tools that can hit an irreversible target. */
export const TARGETED_TOOLS = new Set(["click", "type_text", "select_option"]);

export type GateInput = {
  tool: string;
  args: Record<string, unknown>;
  mode: Mode;
  state: TuskState;
  overBudget: boolean;
  /** For click/type/select: the target is a send/buy/pay/delete-like control. */
  targetIrreversible?: boolean;
};

export function gate(i: GateInput): { block: string } | undefined {
  if (i.overBudget) return { block: "BUDGET: the monthly limit is reached. Do nothing more; the person has been told." };
  if (!ACTING_TOOLS.has(i.tool)) return undefined;
  if (i.tool === "open_url" && !isWebUrl(String(i.args.url ?? ""))) {
    return { block: "NOT_ALLOWED: only web addresses (http or https) can be opened." };
  }
  if (i.mode === "show" && !i.state.doIt) {
    return {
      block:
        'SHOW_MODE: in "Show me how" mode the person does the clicking. Point at the right thing with point_at and explain. ' +
        "Only if they accept your offer, call offer_to_do_it first (after the same step failed twice) and wait for their yes.",
    };
  }
  if (TARGETED_TOOLS.has(i.tool) && i.targetIrreversible && !i.state.grantConfirm) {
    return { block: "NEEDS_CONFIRMATION: this cannot be undone. Call ask_confirmation with a plain question first, then wait for the person's yes." };
  }
  return undefined;
}

/** The next escalation state after a tool result: two errors in a row move to the strong model. */
export function afterToolResult(state: Pick<TuskState, "failStreak" | "escalated">, ok: boolean): { failStreak: number; escalated: boolean } {
  if (ok) return { failStreak: 0, escalated: state.escalated };
  const failStreak = state.failStreak + 1;
  return { failStreak, escalated: state.escalated || failStreak >= 2 };
}

const STILL = /(still|again)\b.*\b(not|n't|doesn'?t|won'?t|can'?t|nothing)|(doesn'?t|does not|won'?t|not) work|nothing happens|funktioniert (immer )?(noch )?nicht|geht (immer )?noch nicht|immer noch|klappt nicht|no funciona|sigue sin|todav[ií]a no|sigue igual/i;
/** The person says the last step did not work (any of the four languages). */
export const saysStillBroken = (text: string): boolean => STILL.test(text);

const DO_IT = /\b(do it( for me)?|you do it|please (do|close|click|press)|can you (do|close|click) (it|this|that)|mach (das|es)( bitte)?( f[uü]r mich)?|erledige|k[uü]mmere dich|hazlo( t[uú])?|h[aá]zmelo|[cč]erralo)\b/i;
/** The person explicitly asks Tusk to do the step itself. */
export const asksToDoIt = (text: string): boolean => DO_IT.test(text);

const SECRET_WORDS = /\b(password|passwort|kennwort|contrase[nñ]a|pin|iban|cvv|cvc|otp|tan|secret|geheim)\b/i;
/** True when a note looks like it holds a secret: refuse to remember it. */
export function looksSecret(note: string): boolean {
  if (SECRET_WORDS.test(note)) return true;
  if (/\bsk-[A-Za-z0-9_-]{8,}/.test(note)) return true;
  if (/\d(?:[ -]?\d){8,}/.test(note)) return true; // long digit runs: card, account or phone numbers
  if (/\b[A-Za-z0-9+/_-]{24,}\b/.test(note)) return true; // long tokens
  return false;
}
