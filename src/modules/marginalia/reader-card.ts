import {
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Ellipsis,
  Expand,
  Highlighter,
  ListMinus,
  MessageCircleQuestionMark,
  Pencil,
  Sparkles,
  Underline,
  X,
  type IconNode,
} from "lucide";
import { formatError, UserError } from "../../utils/errors";
import { getString } from "../../utils/locale";
import { logWarn } from "../../utils/log";
import { h, iconButton, lucideIcon } from "../ui/dom";
import type { PdfPosition } from "./geometry";

type Reader = _ZoteroTypes.ReaderInstance;
type Rewrite = "concise" | "polish" | "expand";

export interface ReaderActions {
  enabled(): boolean;
  editable(annotation: Zotero.Item): boolean;
  ask(reader: Reader, annotation: Zotero.Item, draft?: string): void;
  rewrite(
    annotation: Zotero.Item,
    draft: string,
    action: Rewrite,
    signal: AbortSignal,
  ): Promise<string>;
  saveComment(
    annotation: Zotero.Item,
    comment: string,
    previousComment: string,
  ): Promise<void>;
}

export function createCard(
  doc: Document,
  reader: Reader,
  original: Zotero.Item,
  position: PdfPosition,
  actions: ReaderActions,
  toggle: () => void,
  schedule: () => void,
) {
  const glyph =
    original.annotationType === "underline" ? Underline : Highlighter;
  const id = `sap-marginalia-${Services.uuid.generateUUID()}`;
  let current = original;
  let before = "";
  let editing = false;
  let expanded = false;
  let floating = false;
  let pending: AbortController | undefined;
  let openMenu: HTMLElement | undefined;
  let menuTrigger: HTMLButtonElement | undefined;

  const page = h(doc, "span", { class: "sap-marginalia-page" });
  const quote = h(doc, "blockquote");
  const comment = h(doc, "div", { class: "sap-marginalia-comment" });
  const tags = h(doc, "div", { class: "sap-marginalia-tags" });
  const connector = doc.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  ) as unknown as SVGPathElement;
  const error = h(doc, "div", {
    class: "sap-marginalia-error",
    role: "alert",
    hidden: true,
  });
  const count = h(doc, "span", { class: "sap-marginalia-count" });
  const input = h(doc, "textarea", {
    rows: 1,
    "aria-label": getString("marginalia-reader-edit"),
    input: () => adjustEditor(),
  });
  const marker = iconButton(doc, "", glyph, toggle, "sap-marginalia-marker");
  marker.hidden = true;
  marker.dataset.annotationKey = original.key;
  marker.setAttribute("aria-controls", id);
  const disclosure = iconButton(
    doc,
    "",
    ChevronDown,
    () => {
      if (floating && expanded) {
        toggle();
        marker.focus();
      } else {
        expanded = !expanded;
        syncExpansion();
        schedule();
      }
    },
    "sap-marginalia-icon sap-marginalia-disclosure",
  );
  disclosure.setAttribute("aria-controls", `${id}-comment`);
  comment.id = `${id}-comment`;
  const menuButton = iconButton(
    doc,
    getString("marginalia-reader-actions"),
    Ellipsis,
    () => toggleMenu(options, menuButton),
    "sap-marginalia-icon",
  );
  const ai = iconButton(
    doc,
    getString("marginalia-reader-ai"),
    Sparkles,
    () => toggleMenu(aiMenu, ai),
    "sap-marginalia-icon sap-marginalia-ai",
  );
  const cancel = iconButton(
    doc,
    getString("prefs-agent-cancel"),
    X,
    cancelEdit,
    "sap-marginalia-icon",
  );
  const save = iconButton(
    doc,
    getString("prefs-agent-save"),
    Check,
    () => void commit(),
    "sap-marginalia-icon",
  );

  function menuItem(label: string, icon: IconNode, run: () => void) {
    return h(
      doc,
      "button",
      {
        type: "button",
        click: () => {
          closeMenu();
          run();
        },
      },
      lucideIcon(doc, icon),
      label,
    );
  }

  const edit = menuItem(
    getString("marginalia-reader-edit-action"),
    Pencil,
    startEdit,
  );
  const options = h(
    doc,
    "div",
    {
      class: "sap-marginalia-menu sap-marginalia-options",
      hidden: true,
    },
    edit,
    menuItem(
      getString("marginalia-reader-ask-action"),
      MessageCircleQuestionMark,
      () => actions.ask(reader, current),
    ),
  );
  const aiMenu = h(
    doc,
    "div",
    {
      class: "sap-marginalia-menu sap-marginalia-ai-menu",
      hidden: true,
    },
    menuItem(
      getString("marginalia-reader-ask"),
      MessageCircleQuestionMark,
      () => {
        actions.ask(reader, current, input.value);
      },
    ),
    menuItem(
      getString("marginalia-reader-concise"),
      ListMinus,
      () => void rewrite("concise"),
    ),
    menuItem(
      getString("marginalia-reader-polish"),
      BriefcaseBusiness,
      () => void rewrite("polish"),
    ),
    menuItem(
      getString("marginalia-reader-expand"),
      Expand,
      () => void rewrite("expand"),
    ),
  );
  for (const [menu, trigger, suffix] of [
    [options, menuButton, "options"],
    [aiMenu, ai, "ai"],
  ] as const) {
    menu.id = `${id}-${suffix}`;
    trigger.setAttribute("aria-controls", menu.id);
    trigger.setAttribute("aria-expanded", "false");
  }
  const editor = h(
    doc,
    "div",
    {
      class: "sap-marginalia-editor",
      hidden: true,
    },
    input,
    h(doc, "div", { class: "sap-marginalia-actions" }, count, ai, cancel, save),
    error,
    aiMenu,
  );
  const card = h(
    doc,
    "article",
    {
      id,
      class: "sap-marginalia-card",
      "data-annotation-key": original.key,
      hidden: true,
    },
    h(
      doc,
      "header",
      { class: "sap-marginalia-header" },
      h(doc, "span", { class: "sap-marginalia-type" }, lucideIcon(doc, glyph)),
      page,
      disclosure,
      menuButton,
      options,
    ),
    quote,
    comment,
    editor,
    tags,
  );
  comment.addEventListener("dblclick", startEdit);
  card.addEventListener("keydown", (event) => {
    if (
      (event as KeyboardEvent).key !== "Escape" ||
      (save.disabled && !pending)
    )
      return;
    if (openMenu) closeMenu();
    else if (editing) cancelEdit();
    else if (floating) {
      toggle();
      marker.focus();
    } else if (expanded) {
      expanded = false;
      syncExpansion();
      schedule();
    } else return;
    event.preventDefault();
    event.stopPropagation();
  });

  function clickOutside(event: Event) {
    const target = event.target as Node;
    if (!openMenu?.contains(target) && !menuTrigger?.contains(target))
      closeMenu(false);
  }

  function toggleMenu(menu: HTMLElement, trigger: HTMLButtonElement) {
    const wasOpen = openMenu === menu;
    closeMenu(false);
    if (wasOpen) return;
    openMenu = menu;
    menuTrigger = trigger;
    trigger.setAttribute("aria-expanded", "true");
    card.dataset.menuOpen = "true";
    menu.hidden = false;
    positionMenu();
    menu.querySelector<HTMLButtonElement>("button:not([hidden])")?.focus();
    doc.addEventListener("pointerdown", clickOutside, true);
    card.addEventListener("focusout", leaveCard);
  }

  function positionMenu() {
    if (!openMenu || !menuTrigger || !card.parentElement) return;
    const bounds = card.parentElement.getBoundingClientRect();
    const anchor = menuTrigger.getBoundingClientRect();
    openMenu.classList.toggle(
      "sap-menu-above",
      bounds.bottom - anchor.bottom < openMenu.offsetHeight + 8 &&
        anchor.top - bounds.top > bounds.bottom - anchor.bottom,
    );
    openMenu.classList.toggle(
      "sap-menu-inset",
      anchor.left + openMenu.offsetWidth + 8 > bounds.right,
    );
  }

  function leaveCard(event: FocusEvent) {
    if (event.relatedTarget && !card.contains(event.relatedTarget as Node))
      closeMenu(false);
  }

  function closeMenu(focus = true) {
    if (!openMenu) return;
    openMenu.hidden = true;
    menuTrigger?.setAttribute("aria-expanded", "false");
    if (focus) menuTrigger?.focus();
    openMenu = menuTrigger = undefined;
    delete card.dataset.menuOpen;
    doc.removeEventListener("pointerdown", clickOutside, true);
    card.removeEventListener("focusout", leaveCard);
  }

  function render(annotation: Zotero.Item) {
    current = annotation;
    const label =
      annotation.annotationPageLabel || String(position.pageIndex + 1);
    const number = getString("marginalia-reader-page", { page: label });
    const type = getString(
      annotation.annotationType === "underline"
        ? "marginalia-reader-underline"
        : "marginalia-reader-highlight",
    );
    page.textContent = [type, annotation.annotationAuthorName, number]
      .filter(Boolean)
      .join(" · ");
    const name = getString("marginalia-reader-show-comment", { page: label });
    marker.title = name;
    marker.setAttribute("aria-label", name);
    quote.textContent = annotation.annotationText;
    quote.hidden = !quote.textContent;
    comment.textContent = annotation.annotationComment;
    tags.replaceChildren(
      ...annotation.getTags().map(({ tag }) => h(doc, "span", {}, tag)),
    );
    tags.hidden = !tags.childElementCount;
    edit.hidden = !actions.editable(annotation);
    for (const node of [card, marker, connector])
      node.style.setProperty(
        "--sap-annotation-color",
        annotation.annotationColor,
      );
  }

  function syncExpansion() {
    card.dataset.expanded = String(expanded || floating);
    disclosure.setAttribute("aria-expanded", String(expanded || floating));
    const label = getString(
      expanded || floating
        ? "marginalia-reader-close"
        : "marginalia-reader-expand-card",
    );
    disclosure.title = label;
    disclosure.setAttribute("aria-label", label);
  }

  function adjustEditor() {
    count.textContent = getString("marginalia-reader-character-count", {
      count: Array.from(input.value).length,
    });
    ai.disabled = Boolean(pending) || !input.value.trim();
    input.style.height = "0px";
    input.style.height = `${input.scrollHeight}px`;
    schedule();
  }

  function startEdit() {
    if (editing || !actions.editable(current)) return;
    before = current.annotationComment || "";
    input.value = before;
    setEditing(true);
    adjustEditor();
    input.focus();
  }

  function cancelEdit() {
    pending?.abort();
    pending = undefined;
    input.readOnly = save.disabled = false;
    delete editor.dataset.busy;
    setEditing(false);
    menuButton.focus();
  }

  function setEditing(next: boolean) {
    editing = next;
    card.dataset.editing = String(next);
    editor.hidden = !next;
    comment.hidden = next;
    error.hidden = true;
    menuButton.disabled = next;
    disclosure.disabled = next;
    closeMenu(false);
    schedule();
  }

  function showError(message: string) {
    error.textContent = message;
    error.hidden = false;
    schedule();
  }

  async function rewrite(action: Rewrite) {
    const controller = new AbortController();
    pending = controller;
    input.readOnly = ai.disabled = save.disabled = true;
    editor.dataset.busy = "true";
    count.textContent = getString("marginalia-shortcut-running");
    error.hidden = true;
    try {
      const result = await actions.rewrite(
        current,
        input.value,
        action,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      input.value = result;
      if (!card.hidden) input.focus();
    } catch (cause) {
      if (controller.signal.aborted) return;
      logWarn("Could not revise a marginal comment", cause);
      showError(
        cause instanceof UserError
          ? formatError(cause)
          : getString("marginalia-reader-rewrite-error"),
      );
    } finally {
      if (pending === controller) {
        pending = undefined;
        input.readOnly = save.disabled = false;
        delete editor.dataset.busy;
        if (editing) {
          if (card.hidden) ai.disabled = !input.value.trim();
          else adjustEditor();
        }
      }
    }
  }

  async function commit() {
    input.readOnly = cancel.disabled = save.disabled = ai.disabled = true;
    try {
      if ((current.annotationComment || "") !== before) {
        showError(getString("marginalia-reader-comment-changed"));
        return;
      }
      await actions.saveComment(current, input.value, before);
      setEditing(false);
      menuButton.focus();
    } catch (cause) {
      logWarn("Could not save a marginal comment", cause);
      showError(getString("marginalia-reader-save-error"));
    } finally {
      input.readOnly = cancel.disabled = save.disabled = false;
      ai.disabled = !input.value.trim();
    }
  }

  const hide = () => {
    closeMenu(false);
    card.hidden = marker.hidden = true;
    connector.removeAttribute("d");
    marker.setAttribute("aria-expanded", "false");
  };
  render(original);
  syncExpansion();
  return {
    card,
    marker,
    connector,
    render,
    hide,
    positionMenu,
    showCard(left: number, top: number, width: number, asPopover: boolean) {
      const resize = card.hidden || card.style.width !== `${width}px`;
      Object.assign(card.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
      });
      card.hidden = false;
      if (floating !== asPopover) {
        floating = asPopover;
        card.dataset.floating = String(floating);
        syncExpansion();
      }
      marker.setAttribute("aria-expanded", String(floating));
      if (!floating) marker.hidden = true;
      if (resize && editing && !pending) adjustEditor();
    },
    showMarker(left: number, top: number) {
      Object.assign(marker.style, { left: `${left}px`, top: `${top}px` });
      marker.hidden = false;
    },
    connect(x: number, y: number, edge: number, end: number) {
      const bend = (edge - x) * 0.42;
      connector.setAttribute(
        "d",
        `M ${x} ${y} C ${x + bend} ${y}, ${edge - bend} ${end}, ${edge} ${end}`,
      );
    },
    disconnect() {
      connector.removeAttribute("d");
    },
    get editing() {
      return editing;
    },
    remove() {
      pending?.abort();
      hide();
      card.remove();
      marker.remove();
      connector.remove();
    },
  };
}
