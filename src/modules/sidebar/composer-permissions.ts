import {
  Check,
  CircleCheck,
  Hand,
  ShieldAlert,
  Zap,
  type IconNode,
} from "lucide";
import type { ChatState } from "../../chat/controller";
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

type LibraryWrites = NonNullable<ChatState["libraryWrites"]>;
export interface LibraryPermissions {
  get(): LibraryWrites;
  set(patch: Partial<LibraryWrites>): void;
}

export function createComposerPermissions(
  doc: Document,
  cancelWrites: () => void,
  library?: LibraryPermissions,
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
    library ? "library-approval-scope" : "permission-approval-scope",
    Hand,
    () => {
      if (library) library.set({ direct: false });
      else setWriteAllowed(true);
      close(true);
    },
  );
  const otherMode = row(
    library ? "direct" : "read-only",
    library ? "library-direct" : "permission-read-only",
    library ? "library-direct-scope" : "permission-read-only-scope",
    library ? Zap : CircleCheck,
    () => {
      if (library) library.set({ direct: true });
      else {
        setWriteAllowed(false);
        cancelWrites();
      }
      close(true);
    },
  );
  const tagDeletion = row(
    "tag-deletion",
    "permission-tag-deletion",
    "permission-tag-deletion-scope",
    ShieldAlert,
    () => {
      if (library) library.set({ tagDeletion: !library.get().tagDeletion });
      else setTagDeletionAllowed(!tagDeletionAllowed());
    },
    true,
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
    approval,
    otherMode,
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
    const libraryWrites = library?.get();
    const approvalMode = libraryWrites ? !libraryWrites.direct : writeAllowed();
    const allowed = Boolean(libraryWrites) || approvalMode;
    if (approvalMode !== lastMode) {
      lastMode = approvalMode;
      label.textContent = getString(
        approvalMode
          ? "permission-approval"
          : library
            ? "library-direct"
            : "permission-read-only",
      );
      trigger.title = getString("permission-title");
      trigger.setAttribute(
        "aria-label",
        `${getString("permission-title")}: ${label.textContent}`,
      );
      badge.replaceChildren(
        lucideIcon(doc, approvalMode ? Hand : library ? Zap : CircleCheck, 16),
      );
    }
    approval.setAttribute("aria-checked", String(approvalMode));
    otherMode.setAttribute("aria-checked", String(!approvalMode));
    tagDeletion.setAttribute(
      "aria-checked",
      String(allowed && (libraryWrites?.tagDeletion ?? tagDeletionAllowed())),
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
    if (focusOption) (lastMode ? approval : otherMode).focus();
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
      const options = [approval, otherMode, tagDeletion].filter(
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
  const observers = (library ? [] : [TAG_DELETION_PREF, READ_ONLY_PREF]).map(
    (pref) => Zotero.Prefs.registerObserver(pref, render, true),
  );
  render();

  return {
    element,
    render,
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
