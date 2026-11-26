import { Check, CircleCheck, Hand, ShieldAlert, type IconNode } from "lucide";
import { homepage } from "../../../package.json";
import { getString, type MessageId } from "../../utils/locale";
import {
  READ_ONLY_PREF,
  TAG_DELETION_PREF,
  setTagDeletionAllowed,
  setWriteAllowed,
  tagDeletionAllowed,
  writeAllowed,
} from "../../writes/request";
import { h, lucideIcon } from "../ui/dom";

let nextPermissionID = 0;

export function createComposerPermissions(
  doc: Document,
  cancelWrites: () => void,
) {
  const window = doc.defaultView!;
  const id = `sap-composer-permissions-${++nextPermissionID}`;
  const badge = h(doc, "span", { class: "sap-permission-icon" });
  const label = h(doc, "span", { class: "sap-permission-trigger-label" });
  const trigger = h(
    doc,
    "button",
    {
      type: "button",
      class: "sap-permission-trigger",
      "aria-controls": id,
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      popovertarget: id,
    },
    badge,
    label,
  );
  const approval = row(
    "approval",
    "permission-approval",
    "permission-approval-scope",
    Hand,
    () => {
      setWriteAllowed(true);
      close(true);
    },
  );
  const readOnly = row(
    "read-only",
    "permission-read-only",
    "permission-read-only-scope",
    CircleCheck,
    () => {
      setWriteAllowed(false);
      cancelWrites();
      close(true);
    },
  );
  const tagDeletion = row(
    "tag-deletion",
    "permission-tag-deletion",
    "permission-tag-deletion-scope",
    ShieldAlert,
    () => {
      setTagDeletionAllowed(!tagDeletionAllowed());
    },
    true,
  );
  const learnMore = h(
    doc,
    "button",
    {
      class: "sap-permission-help",
      role: "menuitem",
      type: "button",
      tabindex: -1,
      click: () => {
        const url = new URL(homepage);
        url.hash = "approve-and-undo-writes";
        close(true);
        Zotero.launchURL(url.href);
      },
    },
    getString("permission-learn-more"),
  );
  const header = h(
    doc,
    "div",
    { class: "sap-permission-header" },
    h(doc, "span", {}, getString("permission-heading")),
    learnMore,
  );
  const panel = h(
    doc,
    "div",
    {
      class: "sap-permission-panel",
      popover: "auto",
      id,
      role: "menu",
      "aria-label": getString("permission-heading"),
    },
    header,
    approval,
    readOnly,
    tagDeletion,
  );
  const element = h(
    doc,
    "div",
    { class: "sap-composer-permissions" },
    trigger,
    panel,
  );
  let lastMode: boolean | undefined;

  function row(
    permission: string,
    name: MessageId,
    scope: MessageId,
    icon: IconNode,
    select: () => void,
    toggle = false,
  ) {
    return h(
      doc,
      "button",
      {
        class: "sap-permission-option",
        type: "button",
        tabindex: -1,
        role: toggle ? "menuitemcheckbox" : "menuitemradio",
        "aria-checked": "false",
        "data-permission": permission,
        click: select,
      },
      h(
        doc,
        "span",
        { class: "sap-permission-option-icon", "aria-hidden": "true" },
        lucideIcon(doc, icon, 16),
      ),
      h(
        doc,
        "span",
        { class: "sap-permission-option-text" },
        h(
          doc,
          "span",
          { class: "sap-permission-option-label" },
          getString(name),
        ),
        h(
          doc,
          "span",
          { class: "sap-permission-option-scope" },
          getString(scope),
        ),
      ),
      h(
        doc,
        "span",
        { class: "sap-permission-check", "aria-hidden": "true" },
        lucideIcon(doc, Check, 16),
      ),
    );
  }

  function render() {
    const allowed = writeAllowed();
    if (allowed !== lastMode) {
      lastMode = allowed;
      label.textContent = getString(
        allowed ? "permission-approval" : "permission-read-only",
      );
      trigger.title = getString("permission-title");
      trigger.setAttribute(
        "aria-label",
        `${getString("permission-title")}: ${label.textContent}`,
      );
      badge.replaceChildren(lucideIcon(doc, allowed ? Hand : CircleCheck, 16));
    }
    approval.setAttribute("aria-checked", String(allowed));
    readOnly.setAttribute("aria-checked", String(!allowed));
    tagDeletion.setAttribute(
      "aria-checked",
      String(allowed && tagDeletionAllowed()),
    );
    tagDeletion.disabled = !allowed;
  }

  function position() {
    const anchor = trigger.getBoundingClientRect();
    const composer = trigger
      .closest(".sap-chat-composer")
      ?.getBoundingClientRect();
    const right = Math.min(
      composer?.right ?? window.innerWidth,
      window.innerWidth - 8,
    );
    const left = Math.max(8, Math.min(anchor.left, right - 240));
    const width = Math.max(0, Math.min(570, right - left));
    panel.style.left = `${left}px`;
    panel.style.bottom = `${window.innerHeight - anchor.top - 1}px`;
    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${Math.max(0, anchor.top - 14)}px`;
  }

  function close(restoreFocus = false) {
    if (!panel.matches(":popover-open")) return;
    panel.hidePopover();
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  function open(focusOption: boolean) {
    position();
    render();
    panel.showPopover();
    if (focusOption)
      (writeAllowed() ? approval : readOnly).focus({ preventScroll: true });
  }

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    if (panel.matches(":popover-open")) close();
    else open((event as MouseEvent).detail === 0);
  });
  trigger.addEventListener("keydown", (event) => {
    const key = (event as KeyboardEvent).key;
    if (key !== "ArrowUp" && key !== "ArrowDown") return;
    event.preventDefault();
    if (!panel.matches(":popover-open")) open(true);
  });
  panel.addEventListener("toggle", () =>
    trigger.setAttribute(
      "aria-expanded",
      String(panel.matches(":popover-open")),
    ),
  );
  panel.addEventListener("keydown", (event) => {
    const key = (event as KeyboardEvent).key;
    if (key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (key === "Tab") {
      close(true);
    } else if (["ArrowUp", "ArrowDown", "Home", "End"].includes(key)) {
      event.preventDefault();
      const options = [learnMore, approval, readOnly, tagDeletion].filter(
        ({ disabled }) => !disabled,
      );
      const current = options.findIndex(
        (option) => option === doc.activeElement,
      );
      const step = key === "ArrowUp" ? -1 : 1;
      const next =
        key === "Home"
          ? 0
          : key === "End"
            ? options.length - 1
            : (current + step + options.length) % options.length;
      options[next].focus();
    }
  });
  const resize = () => {
    if (panel.matches(":popover-open")) position();
  };
  window.addEventListener("resize", resize);
  const observers = [TAG_DELETION_PREF, READ_ONLY_PREF].map((pref) =>
    Zotero.Prefs.registerObserver(pref, render, true),
  );
  render();

  return {
    element,
    close: () => close(),
    destroy() {
      close();
      window.removeEventListener("resize", resize);
      observers.forEach((observer) =>
        Zotero.Prefs.unregisterObserver(observer),
      );
    },
  };
}
