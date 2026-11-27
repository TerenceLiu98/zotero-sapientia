import { cjkFriendly } from "@mdit/plugin-cjk-friendly";
import { katex } from "@mdit/plugin-katex";
import { ParseError } from "katex";
import MarkdownIt from "markdown-it";
import {
  ArrowUpRight,
  Check,
  Copy,
  FileText,
  Globe,
  MessageSquarePlus,
  RotateCcw,
  Square,
  X,
  type IconNode,
} from "lucide";
import { getString } from "../../utils/locale";
import { h, lucideIcon } from "../ui/dom";
import { thinkingOrb } from "./thinking-orb";

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
  index: number;
  url: string;
  title: string;
  label: string;
  pdf: boolean;
}

interface AnswerOptions {
  id: string;
  onStop?(): void;
  onRegenerate?(): void;
  onAppendToAnnotation?(plainText: string, anchor: HTMLElement): void;
}

export interface AnswerState {
  text: string;
  streaming: boolean;
  question?: string;
  pdfUrl?: string;
  paperTitle?: string;
  pdfRead?: ReadonlyMap<string, string>;
  regenerate?: boolean;
  appendToAnnotation?: boolean;
  stopping?: boolean;
}

export function createAnswer(doc: Document, options: AnswerOptions) {
  const question = h(doc, "h3", { class: "sap-answer-question", hidden: true });
  const summary = h(doc, "div", {
    class: "sap-answer-source-summary",
    hidden: true,
  });
  const sourceTabs = h(doc, "div", {
    class: "sap-answer-sources",
    hidden: true,
    role: "group",
    "aria-label": getString("answer-sources"),
  });
  const preview = h(doc, "section", {
    class: "sap-answer-source-preview",
    hidden: true,
    id: `sap-source-${options.id}`,
  });
  const writing = h(
    doc,
    "div",
    { class: "sap-answer-writing", hidden: true },
    thinkingOrb(doc),
    getString("answer-writing"),
  );
  const body = h(doc, "div", { class: "sap-answer-text" });
  const clipboardStatus = h(doc, "span", {
    class: "sap-answer-status",
    role: "status",
  });
  let currentText: string | undefined;
  let currentPdfUrl: string | undefined;
  let currentPaperTitle: string | undefined;
  let currentPdfRead: ReadonlyMap<string, string> | undefined;
  let currentSources: AnswerSource[] = [];
  let activeUrl: string | undefined;
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
  const append: HTMLButtonElement | null = options.onAppendToAnnotation
    ? action(getString("marginalia-append-answer"), MessageSquarePlus, () =>
        options.onAppendToAnnotation?.(currentPlainText, append!),
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
    append,
    stop,
    clipboardStatus,
  );
  const element = h(
    doc,
    "section",
    { class: "sap-answer", hidden: true },
    question,
    summary,
    writing,
    body,
    sourceTabs,
    preview,
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
    paperTitle,
    pdfRead,
    regenerate: canRegenerate,
    appendToAnnotation: canAppend,
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
    if (append) append.hidden = streaming || !canAppend;
    if (stop) {
      stop.hidden = !streaming;
      stop.disabled = Boolean(stopping);
    }
    actions.hidden = streaming && !stop;
    if (
      currentText === text &&
      currentPdfUrl === pdfUrl &&
      currentPaperTitle === paperTitle &&
      currentPdfRead === pdfRead
    )
      return;
    const sourcesChanged =
      currentPaperTitle !== paperTitle || currentPdfRead !== pdfRead;
    currentText = text;
    currentPdfUrl = pdfUrl;
    currentPaperTitle = paperTitle;
    currentPdfRead = pdfRead;

    const before = Array.from<HTMLAnchorElement>(body.querySelectorAll("a"));
    const active = before.find((link) => link === doc.activeElement);
    const ordinal = active
      ? before
          .filter(
            (link) => link.getAttribute("href") === active.getAttribute("href"),
          )
          .indexOf(active)
      : -1;
    const result = renderMarkdown(doc, text, preview.id, selectSource, pdfUrl);
    const linksChanged =
      JSON.stringify(currentSources) !== JSON.stringify(result.sources);
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
    if (linksChanged || sourcesChanged) {
      if (!currentSources.some(({ url }) => url === activeUrl))
        activeUrl = undefined;
      renderSources();
    }
    highlight();
  }

  function selectSource(url?: string) {
    activeUrl = url;
    highlight();
    renderPreview();
    sourceTabs
      .querySelector<HTMLButtonElement>('[aria-pressed="true"]')
      ?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "instant",
      });
  }

  function highlight() {
    body.classList.toggle("sap-answer-has-source", !!activeUrl);
    for (const block of body.querySelectorAll(".sap-answer-source-match"))
      block.classList.remove("sap-answer-source-match");
    for (const link of body.querySelectorAll(".sap-citation")) {
      const active = link.getAttribute("href") === activeUrl;
      link.setAttribute("aria-expanded", String(active));
      if (active)
        link
          .closest("p, li, td, th, h1, h2, h3, h4, blockquote")
          ?.classList.add("sap-answer-source-match");
    }
    for (const button of sourceTabs.querySelectorAll("button"))
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.url === activeUrl),
      );
  }

  function renderSources() {
    const count = currentSources.length;
    const pages = currentPdfRead?.size ?? 0;
    summary.hidden = !count;
    sourceTabs.hidden = !count;
    summary.replaceChildren(
      h(
        doc,
        "span",
        { class: "sap-source-stack", "aria-hidden": "true" },
        ...currentSources
          .slice(0, 3)
          .map((source) => lucideIcon(doc, source.pdf ? FileText : Globe, 12)),
      ),
      getString("answer-source-count", { count }),
      pages
        ? ` · ${getString("answer-source-pages-read", { count: pages })}`
        : "",
    );
    const focused = sourceTabs.contains(doc.activeElement)
      ? (doc.activeElement as HTMLButtonElement).dataset.url
      : undefined;
    sourceTabs.replaceChildren(
      ...currentSources.map((source) => {
        const button = h(
          doc,
          "button",
          {
            type: "button",
            class: "sap-answer-source",
            title: source.title,
            "aria-controls": preview.id,
            "aria-pressed": "false",
            "data-url": source.url,
            click: () => selectSource(source.url),
          },
          lucideIcon(doc, source.pdf ? FileText : Globe, 12),
          h(doc, "span", {}, source.label),
          h(
            doc,
            "span",
            { class: "sap-answer-source-index" },
            String(source.index),
          ),
        );
        return button;
      }),
    );
    if (focused)
      [...sourceTabs.querySelectorAll("button")]
        .find((button) => button.dataset.url === focused)
        ?.focus({ preventScroll: true });
    renderPreview();
  }

  function renderPreview() {
    const source = currentSources.find(({ url }) => url === activeUrl);
    preview.hidden = !source;
    if (!source) {
      preview.replaceChildren();
      return;
    }
    const quote = currentPdfRead?.get(source.url);
    const title =
      source.pdf && source.url.split("?")[0] === currentPdfUrl
        ? currentPaperTitle || source.title
        : source.title;
    const close = () => {
      selectSource();
      [...sourceTabs.querySelectorAll("button")]
        .find((button) => button.dataset.url === source.url)
        ?.focus({ preventScroll: true });
    };
    const open = h(
      doc,
      "a",
      {
        class: "sap-answer-action sap-source-open",
        href: source.url,
        click: (event: Event) => {
          event.preventDefault();
          if (source.pdf)
            Zotero.getMainWindow()?.ZoteroPane.loadURI(source.url);
          else Zotero.launchURL(source.url);
        },
      },
      lucideIcon(doc, ArrowUpRight, 13),
      getString("answer-open-source"),
    );
    preview.replaceChildren(
      h(
        doc,
        "div",
        { class: "sap-source-preview-header" },
        lucideIcon(doc, source.pdf ? FileText : Globe, 12),
        h(doc, "span", { class: "sap-source-preview-origin" }, source.label),
        h(doc, "span", { class: "sap-citation-index" }, String(source.index)),
        action(getString("answer-close-source"), X, close),
      ),
      h(doc, "strong", {}, title),
      ...(quote ? [h(doc, "blockquote", {}, quote)] : []),
      h(
        doc,
        "div",
        { class: "sap-source-preview-actions" },
        open,
        quote
          ? action(
              getString("answer-copy-quote"),
              Copy,
              () => {
                Zotero.Utilities.Internal.copyTextToClipboard(quote);
                clipboardStatus.textContent = getString("status-answer-copied");
              },
              true,
            )
          : null,
      ),
    );
  }

  preview.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key === "Escape")
      preview.querySelector<HTMLButtonElement>("button")?.click();
  });

  return {
    element,
    render,
    plainText: () => currentPlainText,
    destroy() {
      if (copyTimer !== undefined) doc.defaultView?.clearTimeout(copyTimer);
    },
  };
}

function renderMarkdown(
  doc: Document,
  text: string,
  previewId: string,
  selectSource: (url: string) => void,
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
  for (const table of content.querySelectorAll("table")) {
    const container = h(doc, "div", { class: "sap-answer-table" });
    table.replaceWith(container);
    container.append(table);
  }
  const sources = new Map<string, AnswerSource>();
  const anchors = Array.from<HTMLAnchorElement>(
    content.querySelectorAll("a[data-sap-href]"),
  );
  anchors.forEach((link) => {
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
      sources.get(url) ??
      describeSource(url, link.textContent?.trim() ?? "", sources.size + 1);
    sources.set(url, source);
    const marker = h(
      doc,
      "a",
      {
        class: "sap-citation sap-citation-index",
        href: source.url,
        title: source.title,
        "aria-controls": previewId,
        "aria-expanded": "false",
        "aria-label": `${source.index}. ${source.title}`,
        click: (event: Event) => {
          event.preventDefault();
          selectSource(source.url);
        },
      },
      String(source.index),
    );
    const label = link.textContent?.trim() ?? "";
    if (/^(?:(?:p(?:age)?\.?\s*)?\d+|第\s*\d+\s*页)$/iu.test(label))
      link.replaceWith(marker);
    else {
      link.replaceWith(
        ...Array.from(link.childNodes).filter((child) => child !== null),
        " ",
        marker,
      );
    }
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

function describeSource(
  url: string,
  text: string,
  index: number,
): AnswerSource {
  const pdf = PDF_LINK.test(url);
  if (pdf) {
    const page = /[?&]page=(\d+)(?:&|$)/.exec(url)?.[1];
    const label = page
      ? getString("answer-source-page", { page })
      : getString("answer-pdf-source");
    return { url, title: text || label, label, pdf, index };
  }
  let host: string;
  try {
    host = Services.io.newURI(url).host;
  } catch {
    host = url;
  }
  return { url, title: text || host, label: host, pdf, index };
}
