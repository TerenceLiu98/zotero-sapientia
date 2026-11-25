import { cjkFriendly } from "@mdit/plugin-cjk-friendly";
import { katex } from "@mdit/plugin-katex";
import { ParseError } from "katex";
import MarkdownIt from "markdown-it";
import {
  Check,
  Copy,
  FileText,
  Globe,
  RotateCcw,
  Sparkle,
  Square,
  type IconNode,
} from "lucide";
import { getString } from "../../utils/locale";
import { h, lucideIcon } from "../ui/dom";

const MAX_CARDS = 2;
const PDF_LINK =
  /^zotero:\/\/open-pdf\/(?:library|groups\/\d+)\/items\/[a-z0-9]+(?:\?page=[1-9]\d*)?$/i;
const PDF_PAGE_LINK = /^#page=([1-9]\d*)$/;
const WEB_LINK = /^https?:\/\/[^\s/]+/i;
const markdown = new MarkdownIt({ html: false, breaks: true })
  .disable("image")
  .use(cjkFriendly)
  .use(katex, { delimiters: "all", trust: false, throwOnError: true });
for (const rule of ["math_inline", "math_block"] as const) {
  const render = markdown.renderer.rules[rule]!;
  markdown.renderer.rules[rule] = (...args) => {
    try {
      return render(...args);
    } catch (error) {
      if (!(error instanceof ParseError)) throw error;
      const [tokens, index] = args;
      const { content, markup } = tokens[index];
      const close =
        markup === "\\(" ? "\\)" : markup === "\\[" ? "\\]" : markup;
      const raw = markdown.utils.escapeHtml(
        `${markup}${content.trimEnd()}${close}`,
      );
      return rule === "math_block" ? `<pre>${raw}</pre>\n` : raw;
    }
  };
}
markdown.validateLink = (url) =>
  WEB_LINK.test(url) || PDF_LINK.test(url) || PDF_PAGE_LINK.test(url);
markdown.renderer.rules.link_open = (
  tokens,
  index,
  options,
  _env,
  renderer,
) => {
  const token = tokens[index];
  const href = token.attrGet("href");
  if (href) {
    token.attrs = token.attrs?.filter(([name]) => name !== "href") ?? null;
    token.attrSet("data-sap-href", href);
  }
  return renderer.renderToken(tokens, index, options);
};

interface AnswerSource {
  url: string;
  title: string;
  label: string;
  pdf: boolean;
}

interface AnswerOptions {
  id: string;
  onStop?(): void;
  onRegenerate?(): void;
}

export interface AnswerState {
  text: string;
  streaming: boolean;
  question?: string;
  pdfUrl?: string;
  regenerate?: boolean;
  stopping?: boolean;
}

export function createAnswer(doc: Document, options: AnswerOptions) {
  const question = h(doc, "h3", { class: "sap-answer-question", hidden: true });
  const sources = h(doc, "div", {
    class: "sap-answer-sources",
    hidden: true,
    role: "group",
    "aria-label": getString("answer-sources"),
  });
  const writing = h(
    doc,
    "div",
    { class: "sap-answer-writing", hidden: true },
    lucideIcon(doc, Sparkle, 12),
    getString("answer-writing"),
  );
  const body = h(doc, "div", { class: "sap-answer-text" });
  const clipboardStatus = h(doc, "span", {
    class: "sap-answer-status",
    role: "status",
  });
  let sourceKey = "";
  let currentText: string | undefined;
  let currentPdfUrl: string | undefined;
  let currentSources: AnswerSource[] = [];
  let currentPlainText = "";
  let copyTimer: number | undefined;

  const copy = action(getString("action-copy-answer"), Copy, () => {
    const references = currentSources.map(
      (source, index) => `[${index + 1}] ${source.title}\n${source.url}`,
    );
    Zotero.Utilities.Internal.copyTextToClipboard(
      [currentPlainText, ...references].filter(Boolean).join("\n\n"),
    );
    const copied = getString("status-answer-copied");
    copy.replaceChildren(lucideIcon(doc, Check));
    clipboardStatus.textContent = copied;
    if (copyTimer !== undefined) doc.defaultView?.clearTimeout(copyTimer);
    copyTimer = doc.defaultView?.setTimeout(() => {
      copy.replaceChildren(lucideIcon(doc, Copy));
      clipboardStatus.textContent = "";
    }, 1200);
  });
  const regenerate = options.onRegenerate
    ? action(
        getString("action-regenerate-answer"),
        RotateCcw,
        options.onRegenerate,
      )
    : null;
  const stop = options.onStop
    ? action(getString("action-stop"), Square, options.onStop, true)
    : null;
  const actions = h(
    doc,
    "div",
    { class: "sap-answer-controls" },
    copy,
    regenerate,
    stop,
    clipboardStatus,
  );
  const element = h(
    doc,
    "section",
    { class: "sap-answer", hidden: true },
    question,
    sources,
    writing,
    body,
    actions,
  );

  function action(
    label: string,
    figure: IconNode,
    run: () => void,
    withLabel = false,
  ) {
    return h(
      doc,
      "button",
      {
        class: "sap-answer-action",
        type: "button",
        title: label,
        "aria-label": label,
        click: run,
      },
      lucideIcon(doc, figure),
      withLabel ? label : null,
    );
  }

  function render({
    text,
    streaming,
    question: prompt,
    pdfUrl,
    regenerate: canRegenerate,
    stopping,
  }: AnswerState) {
    question.hidden = !prompt;
    if (question.textContent !== (prompt ?? ""))
      question.textContent = prompt ?? "";
    element.hidden = !text.trim();
    element.classList.toggle("sap-answer-streaming", streaming);
    element.setAttribute("aria-busy", String(streaming));
    writing.hidden = !streaming;
    copy.hidden = streaming;
    if (regenerate) regenerate.hidden = streaming || !canRegenerate;
    if (stop) {
      stop.hidden = !streaming;
      stop.disabled = Boolean(stopping);
    }
    actions.hidden = streaming && !stop;
    if (currentText === text && currentPdfUrl === pdfUrl) return;
    currentText = text;
    currentPdfUrl = pdfUrl;

    const before = Array.from<HTMLAnchorElement>(body.querySelectorAll("a"));
    const active = before.find((link) => link === doc.activeElement);
    const ordinal = active
      ? before
          .filter(
            (link) => link.getAttribute("href") === active.getAttribute("href"),
          )
          .indexOf(active)
      : -1;
    const result = renderMarkdown(doc, text, options.id, pdfUrl);
    currentSources = result.sources;
    currentPlainText = result.plainText;
    body.replaceChildren(result.content);
    if (active && ordinal >= 0) {
      const matches = Array.from<HTMLAnchorElement>(
        body.querySelectorAll("a"),
      ).filter(
        (link) => link.getAttribute("href") === active.getAttribute("href"),
      );
      matches[ordinal]?.focus({ preventScroll: true });
    }
    const nextKey = JSON.stringify(result.sources);
    if (sourceKey !== nextKey) {
      sourceKey = nextKey;
      sources.hidden = !result.sources.length;
      sources.replaceChildren(...renderSourceCards(doc, result.sources));
    }
  }

  return {
    element,
    render,
    destroy() {
      if (copyTimer !== undefined) doc.defaultView?.clearTimeout(copyTimer);
    },
  };
}

function renderMarkdown(
  doc: Document,
  text: string,
  id: string,
  pdfUrl?: string,
) {
  const template = h(doc, "template");
  template.innerHTML = markdown.render(text);
  const content = template.content;
  const plainContent = content.cloneNode(true) as DocumentFragment;
  for (const formula of plainContent.querySelectorAll(".katex")) {
    const tex = formula.querySelector(
      'annotation[encoding="application/x-tex"]',
    )?.textContent;
    if (tex) {
      formula.replaceWith(
        formula.parentElement?.classList.contains("katex-display")
          ? `$$\n${tex.trimEnd()}\n$$`
          : `$${tex}$`,
      );
    }
  }
  for (const br of plainContent.querySelectorAll("br")) br.replaceWith("\n");
  const plainText = plainContent.textContent?.trim() ?? "";
  const sources = new Map<string, AnswerSource>();
  const anchors = Array.from<HTMLAnchorElement>(
    content.querySelectorAll("a[data-sap-href]"),
  );
  anchors.forEach((link, index) => {
    const href = link.getAttribute("data-sap-href") ?? "";
    const url = resolveSourceUrl(href, pdfUrl);
    link.removeAttribute("data-sap-href");
    if (!url) {
      link.replaceWith(
        ...Array.from(link.childNodes).filter((child) => child !== null),
      );
      return;
    }
    const source =
      sources.get(url) ?? describeSource(url, link.textContent?.trim() ?? "");
    sources.set(url, source);
    connectSource(link, source);
    link.className = "sap-citation";

    const previewId = `sap-source-${id}-${index}`;
    const preview = h(
      doc,
      "span",
      { class: "sap-citation-preview", id: previewId, role: "tooltip" },
      h(doc, "strong", {}, source.title),
      h(doc, "span", {}, source.label),
    );
    const chip = h(doc, "span", { class: "sap-citation-wrap" });
    link.setAttribute("aria-describedby", previewId);
    link.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      chip.dataset.dismissed = "true";
      event.stopPropagation();
    });
    link.addEventListener("blur", () => delete chip.dataset.dismissed);
    chip.addEventListener("pointerleave", () => delete chip.dataset.dismissed);
    link.replaceWith(chip);
    chip.append(link, preview);
  });
  return { content, plainText, sources: Array.from(sources.values()) };
}

function resolveSourceUrl(href: string, pdfUrl?: string): string | undefined {
  if (WEB_LINK.test(href)) return href;
  if (PDF_LINK.test(href)) {
    const page = new URL(href).searchParams.get("page");
    return page && Number.isSafeInteger(Number(page)) ? href : undefined;
  }
  const page = PDF_PAGE_LINK.exec(href)?.[1];
  if (!page || !Number.isSafeInteger(Number(page))) return;
  if (!pdfUrl || !PDF_LINK.test(pdfUrl)) return;

  const url = new URL(pdfUrl);
  url.searchParams.set("page", page);
  return url.href;
}

function describeSource(url: string, text: string): AnswerSource {
  const pdf = PDF_LINK.test(url);
  if (pdf) {
    const page = /[?&]page=(\d+)(?:&|$)/.exec(url)?.[1];
    const label = page
      ? getString("answer-source-page", { page })
      : getString("answer-pdf-source");
    return { url, title: text || label, label, pdf };
  }
  let host: string;
  try {
    host = Services.io.newURI(url).host;
  } catch {
    host = url;
  }
  return { url, title: text || host, label: host, pdf };
}

function connectSource(link: HTMLAnchorElement, source: AnswerSource): void {
  link.setAttribute("href", source.url);
  link.addEventListener("click", (event: Event) => {
    event.preventDefault();
    if (source.pdf) Zotero.getMainWindow()?.ZoteroPane.loadURI(source.url);
    else Zotero.launchURL(source.url);
  });
}

function renderSourceCards(
  doc: Document,
  sources: AnswerSource[],
): HTMLElement[] {
  const card = (source: AnswerSource, index: number) => {
    const link = h(
      doc,
      "a",
      { class: "sap-answer-source", title: source.title },
      h(
        doc,
        "span",
        { class: "sap-answer-source-label" },
        lucideIcon(doc, source.pdf ? FileText : Globe, 12),
        h(doc, "span", { class: "sap-answer-source-origin" }, source.label),
        h(
          doc,
          "span",
          { class: "sap-answer-source-index", "aria-hidden": "true" },
          String(index + 1),
        ),
      ),
      h(doc, "span", { class: "sap-answer-source-title" }, source.title),
    );
    connectSource(link, source);
    return link;
  };
  const row = h(
    doc,
    "div",
    { class: "sap-answer-source-row" },
    ...sources.slice(0, MAX_CARDS).map(card),
  );
  const remaining = sources.slice(MAX_CARDS);
  if (!remaining.length) return [row];
  const overflow = h(
    doc,
    "details",
    { class: "sap-answer-source-more" },
    h(
      doc,
      "summary",
      { "aria-label": getString("answer-sources") },
      `+${remaining.length}`,
    ),
    h(
      doc,
      "div",
      { class: "sap-answer-source-extra sap-answer-source-row" },
      ...remaining.map((source, index) => card(source, index + MAX_CARDS)),
    ),
  );
  return [row, overflow];
}
