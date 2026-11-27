import {
  Check,
  ChevronDown,
  CircleAlert,
  FilePenLine,
  FilePlus2,
  FolderMinus,
  FolderPlus,
  History,
  LoaderCircle,
  ShieldCheck,
  Tag,
  Undo2,
  X,
} from "lucide";
import { getString, type MessageId } from "../../utils/locale";
import {
  writeError,
  type Review,
  type WriteApprovals,
} from "../../writes/approval";
import {
  parseNoteHTML,
  type ApprovedChange,
  type WriteOutcome,
} from "../../writes/request";
import { h, iconButton, lucideIcon } from "../ui/dom";

const labels: Record<ApprovedChange["operation"], MessageId> = {
  create_note: "write-create-note",
  edit_note: "write-edit-note",
  add_tags: "write-add-tags",
  delete_tags: "write-delete-tags",
  update_metadata: "write-update-metadata",
  create_collection: "write-create-collection",
  add_to_collection: "write-add-to-collection",
  remove_from_collection: "write-remove-from-collection",
  report_metadata_unresolved: "write-report-metadata-unresolved",
};
const icons = {
  create_note: FilePlus2,
  edit_note: FilePenLine,
  add_tags: Tag,
  delete_tags: Tag,
  update_metadata: FilePenLine,
  create_collection: FolderPlus,
  add_to_collection: FolderPlus,
  remove_from_collection: FolderMinus,
  report_metadata_unresolved: CircleAlert,
};

export function createWriteReview(doc: Document, writes: WriteApprovals) {
  let review: Review | null = null;
  let historyOpen = false;
  let historyRequest = 0;
  let detailsOpen = false;
  const title = h(doc, "h3", {}, getString("write-review"));
  const subtitle = h(doc, "p", { class: "sap-write-subtitle" });
  const symbol = h(doc, "span", { class: "sap-write-symbol" });
  const badge = h(doc, "span", { class: "sap-write-badge" });
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
  confirm.classList.add("sap-write-approve");
  confirm.setAttribute(
    "aria-keyshortcuts",
    Zotero.isMac ? "Meta+Enter" : "Control+Enter",
  );
  cancel.setAttribute("aria-keyshortcuts", "Escape");
  const dismiss = iconButton(
    doc,
    getString("write-dismiss"),
    X,
    () => review && writes.dismiss(review.id),
  );
  const details = iconButton(
    doc,
    getString("write-details"),
    ChevronDown,
    () => {
      detailsOpen = !detailsOpen;
      details.setAttribute("aria-expanded", String(detailsOpen));
      list.hidden = !detailsOpen;
    },
  );
  details.setAttribute("aria-expanded", "false");
  const footer = h(
    doc,
    "div",
    { class: "sap-write-actions" },
    announcement,
    cancel,
    confirm,
  );
  const element = h(
    doc,
    "section",
    {
      class: "sap-write-review",
      "aria-label": getString("write-review"),
      hidden: true,
    },
    h(
      doc,
      "header",
      { class: "sap-write-header" },
      symbol,
      h(doc, "div", { class: "sap-write-heading" }, title, subtitle),
      badge,
      details,
      dismiss,
    ),
    list,
    footer,
  );
  element.addEventListener("keydown", (event) => {
    const key = event as KeyboardEvent;
    if (key.isComposing || key.repeat || !review) return;
    const approve =
      key.key === "Enter" && (Zotero.isMac ? key.metaKey : key.ctrlKey);
    const button = approve
      ? confirm
      : key.key === "Escape"
        ? cancel
        : undefined;
    if (!button || button.hidden || button.disabled) return;
    key.preventDefault();
    key.stopPropagation();
    button.click();
  });

  function action(label: MessageId, run: () => void) {
    return h(
      doc,
      "button",
      { class: "sap-chat-button sap-write-action", type: "button", click: run },
      getString(label),
    );
  }

  function reviewRow(
    change: ApprovedChange,
    outcome: WriteOutcome | undefined,
    running: boolean,
    multiple: boolean,
  ) {
    const content = change.change;
    const target = outcome?.target ?? change.target;
    const collectionTarget =
      "collectionKey" in target ? target.collectionKey : undefined;
    const evidence = "evidence" in content ? content.evidence : undefined;
    const isNote = "html" in content;
    const payload = isNote
      ? notePreview(content.html)
      : "tags" in content
        ? content.tags.length
          ? h(
              doc,
              "ul",
              { class: "sap-write-tags" },
              ...content.tags.map((tag) => h(doc, "li", {}, tag)),
            )
          : getString("write-outcome-unchanged")
        : null;
    const fields =
      "fields" in content
        ? [
            ...(content.newItemTypeID === undefined
              ? []
              : [
                  {
                    label: getString("write-field-item-type"),
                    before: Zotero.ItemTypes.getLocalizedString(
                      content.itemTypeID,
                    ),
                    after: Zotero.ItemTypes.getLocalizedString(
                      content.newItemTypeID,
                    ),
                  },
                ]),
            ...content.fields
              .filter(({ before, after }) => before !== after)
              .map(({ field, beforeDisplay, afterDisplay }) => ({
                label: Zotero.ItemFields.getLocalizedString(field) as string,
                before: beforeDisplay,
                after: afterDisplay,
              })),
            ...(content.creators &&
            creatorList(content.creators.before) !==
              creatorList(content.creators.after)
              ? [
                  {
                    label: getString("write-field-creators"),
                    before: creatorList(content.creators.before),
                    after: creatorList(content.creators.after),
                  },
                ]
              : []),
          ]
        : [];
    return h(
      doc,
      "li",
      { class: "sap-write-row" },
      multiple
        ? h(
            doc,
            "strong",
            { class: "sap-write-operation" },
            getString(labels[change.operation]),
          )
        : null,
      h(
        doc,
        "dl",
        { class: "sap-write-fields" },
        h(
          doc,
          "dt",
          {},
          getString(
            change.operation === "create_collection"
              ? "write-field-collection"
              : "write-field-item",
          ),
        ),
        h(
          doc,
          "dd",
          {},
          multiple || change.operation === "create_collection"
            ? `${target.title} `
            : null,
          h(
            doc,
            "span",
            { class: "sap-write-target" },
            target.itemKey ?? collectionTarget,
          ),
          "unchanged" in content && content.unchanged
            ? h(
                doc,
                "div",
                { class: "sap-write-status" },
                getString("write-outcome-unchanged"),
              )
            : null,
        ),
        "collection" in content
          ? h(doc, "dt", {}, getString("write-field-collection"))
          : null,
        "collection" in content
          ? h(
              doc,
              "dd",
              {},
              content.collection.title,
              " ",
              h(
                doc,
                "span",
                { class: "sap-write-target" },
                content.collection.key,
              ),
              content.before === content.after
                ? h(
                    doc,
                    "div",
                    { class: "sap-write-status" },
                    getString("write-outcome-unchanged"),
                  )
                : null,
            )
          : null,
        "parent" in content && content.parent
          ? h(doc, "dt", {}, getString("write-field-parent-collection"))
          : null,
        "parent" in content && content.parent
          ? h(
              doc,
              "dd",
              {},
              content.parent.title,
              " ",
              h(doc, "span", { class: "sap-write-target" }, content.parent.key),
            )
          : null,
        "reason" in content
          ? h(doc, "dt", {}, getString("write-field-reason"))
          : null,
        "reason" in content ? h(doc, "dd", {}, content.reason) : null,
        evidence?.length
          ? h(doc, "dt", {}, getString("write-field-evidence"))
          : null,
        evidence?.length
          ? h(
              doc,
              "dd",
              {},
              h(
                doc,
                "ul",
                { class: "sap-write-tags" },
                ...evidence.map(({ url, summary }) =>
                  h(
                    doc,
                    "li",
                    {},
                    summary,
                    h(
                      doc,
                      "div",
                      {},
                      h(
                        doc,
                        "a",
                        {
                          href: url,
                          title: url,
                          click: (event: Event) => {
                            event.preventDefault();
                            Zotero.launchURL(url);
                          },
                        },
                        new URL(url).hostname,
                      ),
                    ),
                  ),
                ),
              ),
            )
          : null,
        change.note && "noteKey" in change.change
          ? h(doc, "dt", {}, getString("write-field-note"))
          : null,
        change.note && "noteKey" in change.change
          ? h(
              doc,
              "dd",
              {},
              `${change.note.title} `,
              h(
                doc,
                "span",
                { class: "sap-write-target" },
                change.change.noteKey,
              ),
            )
          : null,
        payload
          ? h(
              doc,
              "dt",
              {},
              getString(isNote ? "write-field-content" : "write-field-tags"),
            )
          : null,
        payload ? h(doc, "dd", {}, payload) : null,
        ...fields.flatMap(({ label, before, after }) => [
          h(doc, "dt", {}, label),
          h(
            doc,
            "dd",
            { class: "sap-write-metadata-diff" },
            h(
              doc,
              "del",
              { "aria-label": getString("write-field-before") },
              before || getString("write-field-empty"),
            ),
            h(
              doc,
              "ins",
              { "aria-label": getString("write-field-after") },
              after || getString("write-field-empty"),
            ),
          ),
        ]),
      ),
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

  function creatorList(creators: _ZoteroTypes.Item.CreatorJSON[]) {
    return creators
      .map(({ name, firstName, lastName, creatorType }) => {
        const displayName =
          name ?? [firstName, lastName].filter(Boolean).join(" ");
        return `${displayName} (${Zotero.CreatorTypes.getLocalizedString(creatorType)})`;
      })
      .join("\n");
  }

  function notePreview(html: string) {
    const preview = h(doc, "div", { class: "sap-write-note" });
    const content = parseNoteHTML(html, preview);
    for (const link of content.querySelectorAll("a[href]")) {
      link.setAttribute("title", link.getAttribute("href")!);
      link.removeAttribute("href");
    }
    preview.append(content);
    return preview;
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
    const pending = phase === "pending";
    const running = phase === "running";
    const finished = !pending && !running;
    const failed = outcomes.some(({ status }) => status === "failed");
    const unresolved = outcomes.some(({ status }) => status === "unresolved");
    const multiple = proposal.operations.length > 1;
    const first = proposal.operations[0];
    const sameItem = proposal.operations.every(
      ({ target }) =>
        target.itemID !== undefined && target.itemID === first.target.itemID,
    );
    const active = doc.activeElement;
    if (previous?.id !== review.id) {
      list.scrollTop = 0;
      detailsOpen = false;
    } else if (finished && previous.phase !== phase) {
      detailsOpen = failed || unresolved;
    }
    title.textContent = getString(
      multiple ? "write-review" : labels[first.operation],
    );
    title.title = title.textContent;
    subtitle.textContent =
      !multiple || sameItem
        ? first.target.title
        : getString("write-change-count", {
            count: proposal.operations.length,
          });
    element.setAttribute("aria-label", title.textContent);
    element.dataset.phase = finished ? "resolved" : phase;
    let treatment = "neutral";
    let statusLabel: MessageId;
    let glyph;
    if (pending) {
      const medium = proposal.operations.some(
        ({ operation }) =>
          operation === "edit_note" ||
          operation === "delete_tags" ||
          operation === "remove_from_collection" ||
          operation === "update_metadata",
      );
      treatment = medium ? "medium" : "low";
      statusLabel = medium ? "write-risk-medium" : "write-risk-low";
      glyph = multiple ? ShieldCheck : icons[first.operation];
    } else if (running) {
      statusLabel = "write-applying";
      glyph = LoaderCircle;
    } else if (failed) {
      statusLabel = "write-result-errors";
      glyph = CircleAlert;
    } else if (phase === "cancelled") {
      const denied = outcomes.every(
        ({ status }) => status === "cancelled" || status === "unresolved",
      );
      statusLabel = denied ? "write-result-denied" : "write-result-stopped";
      glyph = X;
    } else if (unresolved) {
      statusLabel = "write-outcome-unresolved";
      glyph = CircleAlert;
    } else {
      treatment = "approved";
      statusLabel = "write-result-approved";
      glyph = Check;
    }
    badge.dataset.treatment = treatment;
    badge.textContent = getString(statusLabel);
    symbol.replaceChildren(lucideIcon(doc, glyph, 16));
    const scrollTop = list.scrollTop;
    list.replaceChildren(
      ...proposal.operations.map((change, index) =>
        reviewRow(change, outcomes[index], running, multiple),
      ),
    );
    list.scrollTop = scrollTop;
    list.hidden = finished && !detailsOpen;
    details.hidden = !finished;
    details.setAttribute("aria-expanded", String(detailsOpen));
    footer.hidden = finished;
    confirm.hidden = !pending;
    cancel.hidden = finished;
    cancel.disabled = Boolean(review.stopping);
    cancel.textContent = getString(pending ? "write-deny" : "write-cancel");
    dismiss.hidden = !finished;
    announcement.hidden = !running;
    announcement.textContent = !running
      ? ""
      : getString(`write-phase-${review.stopping ? "stopping" : "running"}`, {
          done: outcomes.filter(({ status }) => status !== "cancelled").length,
          total: proposal.operations.length,
        });
    if (active === confirm || active === cancel) {
      if (finished) details.focus({ preventScroll: true });
      else if (running && active === confirm)
        cancel.focus({ preventScroll: true });
    }
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
