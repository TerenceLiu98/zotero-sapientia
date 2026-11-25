import { History, Undo2 } from "lucide";
import { getString, type MessageId } from "../../utils/locale";
import {
  writeError,
  type Review,
  type WriteApprovals,
} from "../../writes/approval";
import type { ApprovedChange, WriteOutcome } from "../../writes/request";
import { h, iconButton } from "../ui/dom";

const labels: Record<ApprovedChange["operation"], MessageId> = {
  create_note: "write-create-note",
  edit_note: "write-edit-note",
  add_tags: "write-add-tags",
  delete_tags: "write-delete-tags",
};

export function createWriteReview(doc: Document, writes: WriteApprovals) {
  let review: Review | null = null;
  let historyOpen = false;
  let historyRequest = 0;
  const title = h(doc, "h3", {}, getString("write-review"));
  const list = h(doc, "ol", { class: "sap-write-list" });
  const announcement = h(doc, "div", {
    role: "status",
    class: "sap-write-status",
  });
  const historyList = h(doc, "ol", { class: "sap-write-list" });
  const historyError = h(doc, "div", {
    role: "alert",
    class: "sap-write-error",
    hidden: true,
  });
  const historyPanel = h(
    doc,
    "section",
    {
      class: "sap-write-history",
      hidden: true,
      "aria-label": getString("write-history"),
    },
    historyError,
    historyList,
  );
  const historyButton = iconButton(
    doc,
    getString("write-history"),
    History,
    () => {
      historyOpen = !historyOpen;
      historyButton.setAttribute("aria-expanded", String(historyOpen));
      historyPanel.hidden = !historyOpen;
      if (historyOpen) void refreshHistory();
    },
  );
  historyButton.setAttribute("aria-expanded", "false");

  const confirm = action(
    "write-confirm",
    () => review && void writes.confirm(review.id),
  );
  const cancel = action(
    "write-cancel",
    () => review && writes.cancel(review.id),
  );
  const dismiss = action(
    "write-dismiss",
    () => review && writes.dismiss(review.id),
  );
  const element = h(
    doc,
    "section",
    {
      class: "sap-write-review",
      "aria-label": getString("write-review"),
      hidden: true,
    },
    title,
    list,
    announcement,
    h(doc, "div", { class: "sap-write-actions" }, cancel, confirm, dismiss),
  );

  function action(label: MessageId, run: () => void) {
    return h(
      doc,
      "button",
      { class: "sap-chat-button", type: "button", click: run },
      getString(label),
    );
  }

  function reviewRow(
    change: ApprovedChange,
    outcome: WriteOutcome | undefined,
    running: boolean,
  ) {
    const payload =
      "html" in change.change
        ? h(doc, "pre", { class: "sap-write-note" }, change.change.html)
        : h(
            doc,
            "ul",
            { class: "sap-write-tags" },
            ...change.change.tags.map((tag) => h(doc, "li", {}, tag)),
          );
    return h(
      doc,
      "li",
      { class: "sap-write-row" },
      h(doc, "strong", {}, change.target.title),
      h(doc, "div", { class: "sap-write-target" }, change.target.itemKey),
      h(doc, "div", {}, getString(labels[change.operation])),
      change.note && "noteKey" in change.change
        ? h(
            doc,
            "div",
            { class: "sap-write-target" },
            `${change.note.title} (${change.change.noteKey})`,
          )
        : null,
      payload,
      outcome || running
        ? h(
            doc,
            "div",
            { class: outcome?.error ? "sap-write-error" : "sap-write-status" },
            getString(`write-outcome-${outcome?.status ?? "waiting"}`),
            outcome?.error ? h(doc, "div", {}, outcome.error) : null,
          )
        : null,
    );
  }

  async function refreshHistory() {
    const request = ++historyRequest;
    try {
      const entries = await writes.history();
      if (request !== historyRequest) return;
      historyError.hidden = true;
      historyList.replaceChildren(
        ...(entries.length
          ? entries.map((entry) => {
              const undo = iconButton(
                doc,
                getString("write-undo"),
                Undo2,
                () => {
                  undo.disabled = true;
                  void writes.undo(entry.id).then(refreshHistory, (error) => {
                    undo.disabled = false;
                    historyError.textContent = writeError(error);
                    historyError.hidden = false;
                  });
                },
              );
              return h(
                doc,
                "li",
                { class: "sap-write-row sap-write-history-row" },
                h(
                  doc,
                  "div",
                  {},
                  h(doc, "strong", {}, entry.target.title),
                  h(doc, "div", {}, getString(labels[entry.operation])),
                  h(
                    doc,
                    "time",
                    {
                      class: "sap-write-target",
                      datetime: new Date(entry.time).toISOString(),
                    },
                    new Date(entry.time).toLocaleString(),
                  ),
                ),
                entry.undone
                  ? h(
                      doc,
                      "span",
                      { class: "sap-write-status" },
                      getString("write-undone"),
                    )
                  : undo,
              );
            })
          : [
              h(
                doc,
                "li",
                { class: "sap-write-row" },
                getString("write-history-empty"),
              ),
            ]),
      );
    } catch (error) {
      if (request !== historyRequest) return;
      historyError.textContent = writeError(error);
      historyError.hidden = false;
    }
  }

  const unsubscribe = writes.subscribe((next) => {
    const previous = review;
    review = next;
    element.hidden = !review;
    if (!review) return;
    const { phase, proposal, outcomes } = review;
    if (previous?.id !== review.id) list.scrollTop = 0;
    const scrollTop = list.scrollTop;
    list.replaceChildren(
      ...proposal.operations.map((change, index) =>
        reviewRow(change, outcomes[index], phase === "running"),
      ),
    );
    list.scrollTop = scrollTop;
    const finished = phase === "completed" || phase === "cancelled";
    confirm.hidden = phase !== "pending";
    cancel.hidden = finished;
    cancel.disabled = Boolean(review.stopping);
    dismiss.hidden = !finished;
    announcement.textContent =
      phase === "pending"
        ? ""
        : getString(
            `write-phase-${review.stopping && !finished ? "stopping" : phase}`,
            {
              done: outcomes.filter(({ status }) => status !== "cancelled")
                .length,
              total: proposal.operations.length,
            },
          );
    if (historyOpen && outcomes.length !== previous?.outcomes.length)
      void refreshHistory();
  });

  return {
    element,
    historyPanel,
    historyButton,
    destroy() {
      historyRequest++;
      unsubscribe();
    },
  };
}
