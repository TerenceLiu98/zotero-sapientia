import { Check, ChevronDown, Circle, LoaderCircle, X } from "lucide";
import type { AssistantBlock, ChatMessage } from "../../chat/controller";
import { getString } from "../../utils/locale";
import { h, lucideIcon } from "../ui/dom";

type AssistantMessage = Extract<ChatMessage, { role: "assistant" }>;
type Step = Exclude<AssistantBlock, { type: "text" }>;

export function createThinkingState(doc: Document) {
  const window = doc.defaultView!;
  const statusIcon = h(doc, "span", { class: "sap-thinking-icon" });
  const pixels = h(
    doc,
    "span",
    { class: "sap-thinking-pixels", "aria-hidden": "true" },
    ...Array.from({ length: 9 }, () => h(doc, "span")),
  );
  const label = h(doc, "span", { class: "sap-thinking-label" });
  const elapsed = h(doc, "span", { class: "sap-thinking-time" });
  const list = h(doc, "ol", {
    class: "sap-thinking-steps",
    "aria-live": "polite",
  });
  const header = h(
    doc,
    "summary",
    { class: "sap-thinking-header" },
    statusIcon,
    label,
    elapsed,
    h(
      doc,
      "span",
      { class: "sap-thinking-chevron" },
      lucideIcon(doc, ChevronDown, 14),
    ),
  );
  const element = h(doc, "details", { class: "sap-thinking" }, header, list);
  let previous: AssistantMessage | undefined;
  let timer: number | undefined;
  let toggled = false;
  const rows: { step: Step; row: HTMLElement }[] = [];

  header.addEventListener("click", () => {
    toggled = true;
  });

  function renderTime() {
    const start = previous?.startedAt;
    const end = previous?.thinkingEndedAt;
    elapsed.textContent = start
      ? getString("thinking-seconds", {
          seconds: Math.max(
            0,
            Math.floor(((end ?? Date.now()) - start) / 1000),
          ),
        })
      : "";
    elapsed.hidden = !start;
  }

  function stopTimer() {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
  }

  function render(message: AssistantMessage) {
    const running = !message.stopReason && !message.thinkingEndedAt;
    const wasRunning =
      previous && !previous.stopReason && !previous.thinkingEndedAt;
    if (!toggled && running !== wasRunning) element.open = running;
    previous = message;
    const steps = message.blocks.filter(
      (block): block is Step => block.type !== "text",
    );
    element.hidden = !running && !message.startedAt && !steps.length;
    label.textContent = getString(
      running ? "thinking-running" : "thinking-finished",
    );
    if (element.dataset.running !== String(running)) {
      element.dataset.running = String(running);
      statusIcon.replaceChildren(running ? pixels : lucideIcon(doc, Check, 14));
    }
    steps.forEach((step, index) => {
      const mounted = rows[index];
      if (mounted?.step === step) return;
      const status = step.type === "tool" ? step.status : "thought";
      const glyph =
        status === "completed"
          ? Check
          : status === "failed"
            ? X
            : status === "in_progress"
              ? LoaderCircle
              : Circle;
      const row = h(
        doc,
        "li",
        { class: "sap-thinking-step", "data-status": status },
        h(
          doc,
          "span",
          { class: "sap-thinking-step-icon" },
          lucideIcon(doc, glyph, 13),
        ),
        step.type === "tool"
          ? step.title || getString("thinking-tool")
          : step.text,
      );
      if (mounted) mounted.row.replaceWith(row);
      else list.append(row);
      rows[index] = { step, row };
    });
    while (rows.length > steps.length) rows.pop()?.row.remove();
    renderTime();
    if (running && message.startedAt)
      timer ??= window.setInterval(renderTime, 1000);
    else stopTimer();
  }

  return { element, render, destroy: stopTimer };
}
