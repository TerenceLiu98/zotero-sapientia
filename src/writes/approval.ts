import { redactor } from "../utils/log";
import {
  applyWithHistory,
  listHistory,
  undoWrite,
  type HistoryEntry,
} from "./history";
import type {
  WriteHandoff,
  WriteOutcome,
  WriteProposal,
  WriteResult,
} from "./request";
import { writeAllowed } from "./request";

export function writeError(error: unknown): string {
  return redactor.redact(
    error instanceof Error ? error.message : String(error),
  );
}

export interface Review {
  id: number;
  proposal: WriteProposal;
  phase: "pending" | "running" | "completed" | "cancelled";
  stopping?: boolean;
  outcomes: readonly WriteOutcome[];
}

interface ActiveReview {
  view: Review;
  cancellation: AbortController;
  finish(result: WriteResult): void;
}

export class WriteApprovals {
  private nextID = 0;
  private active: ActiveReview | null = null;
  private review: Review | null = null;
  private readonly listeners = new Set<(review: Review | null) => void>();

  subscribe(listener: (review: Review | null) => void) {
    this.listeners.add(listener);
    listener(this.review);
    return () => this.listeners.delete(listener);
  }

  private publish(review: Review | null) {
    this.review = review;
    for (const listener of this.listeners) listener(review);
  }

  request: WriteHandoff = (proposal, signal) => {
    if (signal.aborted || !writeAllowed())
      return Promise.resolve({ status: "cancelled", outcomes: [] });
    if (this.active) return Promise.resolve({ status: "busy", outcomes: [] });

    return new Promise<WriteResult>((resolve) => {
      const id = ++this.nextID;
      const cancel = () => this.cancel(id);
      this.active = {
        view: { id, proposal, phase: "pending", outcomes: [] },
        cancellation: new AbortController(),
        finish(result) {
          signal.removeEventListener("abort", cancel);
          resolve(result);
        },
      };
      signal.addEventListener("abort", cancel, { once: true });
      this.publish(this.active.view);
    });
  };

  async confirm(id: number) {
    const active = this.active;
    if (active?.view.id !== id || active.view.phase !== "pending") return;
    if (!writeAllowed()) {
      this.cancel(id);
      return;
    }
    const { signal } = active.cancellation;
    active.view = { ...active.view, phase: "running" };
    this.publish(active.view);
    for (const change of active.view.proposal.operations) {
      if (signal.aborted) break;
      const { target, operation } = change;
      let outcome: WriteOutcome;
      try {
        const historyID = await applyWithHistory(change, signal);
        if (historyID === null) break;
        outcome = historyID
          ? { target, operation, status: "applied", historyID }
          : { target, operation, status: "unchanged" };
      } catch (error) {
        outcome = {
          target,
          operation,
          status: "failed",
          error: writeError(error),
        };
      }
      active.view = {
        ...active.view,
        outcomes: [...active.view.outcomes, outcome],
      };
      this.publish(active.view);
      await Zotero.Promise.delay(0);
    }
    this.finish(active);
  }

  cancel(id: number) {
    const active = this.active;
    if (active?.view.id !== id) return;
    active.cancellation.abort();
    if (active.view.phase === "pending") {
      this.finish(active);
    } else {
      active.view = { ...active.view, stopping: true };
      this.publish(active.view);
    }
  }

  cancelActive() {
    if (this.active) this.cancel(this.active.view.id);
  }

  dismiss(id: number) {
    if (!this.active && this.review?.id === id) this.publish(null);
  }

  private finish(active: ActiveReview) {
    const { proposal, outcomes } = active.view;
    const remaining = proposal.operations.slice(outcomes.length);
    const status = remaining.length ? "cancelled" : "completed";
    const result: WriteResult = {
      status,
      outcomes: [
        ...outcomes,
        ...remaining.map(({ target, operation }): WriteOutcome => ({
          target,
          operation,
          status: "cancelled",
        })),
      ],
    };
    this.active = null;
    active.finish(result);
    this.publish({ ...active.view, phase: status, outcomes: result.outcomes });
  }

  history(): Promise<HistoryEntry[]> {
    return listHistory();
  }

  undo(id: string): Promise<void> {
    return undoWrite(id);
  }
}
