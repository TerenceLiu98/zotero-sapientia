import MarkdownIt from "markdown-it";
import { getString } from "../../utils/locale";
import { h } from "../ui/dom";

const PDF_LINK =
  /^zotero:\/\/open-pdf\/(?:library|groups\/\d+)\/items\/[a-z0-9]+(?:\?[^#\s]*)?$/i;
const markdown = new MarkdownIt({ html: false, breaks: true }).disable("image");
markdown.validateLink = (url) =>
  /^https?:\/\//i.test(url) || PDF_LINK.test(url);
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

export function renderAnswerText(doc: Document, text: string): HTMLElement {
  const body = h(doc, "div", { class: "sap-answer-text" });
  const template = h(doc, "template");
  template.innerHTML = markdown.render(text);
  body.append(template.content);
  for (const link of body.querySelectorAll<HTMLAnchorElement>(
    "a[data-sap-href]",
  )) {
    const url = link.getAttribute("data-sap-href")!;
    link.removeAttribute("data-sap-href");
    if (!markdown.validateLink(url)) continue;
    link.setAttribute("href", url);
    const citation = PDF_LINK.test(url);
    if (citation) {
      link.classList.add("sap-citation");
      link.title = getString("action-open-citation");
    }
    link.addEventListener("click", (event: Event) => {
      event.preventDefault();
      if (citation) Zotero.getMainWindow()?.ZoteroPane.loadURI(url);
      else Zotero.launchURL(url);
    });
  }
  return body;
}
