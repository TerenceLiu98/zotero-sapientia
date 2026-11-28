import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleStop,
  ClipboardList,
  FileText,
  LoaderCircle,
  Minus,
  PanelRight,
  Wrench,
  X,
} from "lucide";
import type {
  AssistantMessage,
  AssistantTool,
  ChatState,
} from "../chat/controller";
import { getString, type MessageId } from "../utils/locale";
import { h, iconButton, lucideIcon } from "./ui/dom";

interface RunActions {
  closeProgress(): void;
  toggleProgress(): void;
  openRun(): void;
  closeRun(): void;
  stop(): void;
}

type RunStatus =
  "running" | "needs-input" | "stopping" | "completed" | "stopped";

const statusLabels: Record<RunStatus, MessageId> = {
  running: "library-run-running",
  "needs-input": "library-run-needs-input",
  stopping: "library-run-stopping",
  completed: "library-run-completed",
  stopped: "library-run-stopped",
};

function runDuration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function toolDuration(tool: AssistantTool) {
  return tool.startedAt !== undefined && tool.endedAt !== undefined
    ? getString("library-run-seconds", {
        seconds: Math.max(
          0,
          Math.round((tool.endedAt - tool.startedAt) / 100) / 10,
        ),
      })
    : "";
}

export function createLibraryRun(doc: Document, actions: RunActions) {
  const win = doc.defaultView!;
  const requests = h(doc, "div", { class: "sap-library-run-requests" });
  const requestsSection = h(
    doc,
    "section",
    {
      class: "sap-library-run-request-region",
      hidden: true,
    },
    h(doc, "h2", {}, getString("library-run-needs-input")),
    requests,
  );

  const steps = h(doc, "ol", { class: "sap-library-run-timeline" });
  const activity = h(doc, "ol", {
    class: "sap-library-run-timeline sap-library-run-tools",
  });
  const items = h(doc, "ol", {
    class: "sap-library-run-timeline sap-library-run-progress-items",
  });
  const outputs = h(doc, "div", { class: "sap-library-run-output-items" });
  const used = h(doc, "div", { class: "sap-library-run-used-items" });
  const progressDetails = details("library-progress-title", items);
  const outputDetails = details("library-run-outputs", outputs);
  const usedDetails = details("library-run-used", used);
  const runLink = h(
    doc,
    "button",
    {
      type: "button",
      class: "sap-library-run-link",
      click: actions.openRun,
    },
    getString("library-run-view"),
    lucideIcon(doc, ArrowUpRight, 13),
  );
  const progress = h(
    doc,
    "aside",
    {
      id: "sap-library-inspector",
      class: "sap-library-run-inspector",
      "aria-label": getString("library-progress-title"),
    },
    iconButton(
      doc,
      getString("library-close-progress"),
      X,
      actions.closeProgress,
      "sap-library-run-icon sap-library-close-progress",
    ),
    requestsSection,
    progressDetails,
    outputDetails,
    usedDetails,
    runLink,
  );
  const crumb = h(doc, "span", { class: "sap-library-run-crumb-title" });
  const status = h(doc, "span", {
    class: "sap-library-run-status",
    role: "status",
  });
  const stop = h(
    doc,
    "button",
    {
      type: "button",
      class: "sap-library-run-stop",
      click: actions.stop,
    },
    lucideIcon(doc, CircleStop, 14),
    getString("library-run-stop"),
  );
  const title = h(doc, "h1");
  const toggleProgress = iconButton(
    doc,
    getString("library-progress-title"),
    PanelRight,
    actions.toggleProgress,
    "sap-library-run-icon sap-library-run-toggle",
  );
  toggleProgress.setAttribute("aria-controls", progress.id);
  const metadata = h(doc, "div", { class: "sap-library-run-meta" });
  const timeline = h(doc, "progress", { class: "sap-library-run-bar", max: 1 });
  const counters = h(doc, "dl", { class: "sap-library-run-counters" });
  const time = h(doc, "dd", { class: "sap-library-run-time" });
  const stepSummary = h(doc, "span", {
    class: "sap-library-run-panel-summary",
  });
  const toolSummary = h(doc, "span", {
    class: "sap-library-run-panel-summary",
  });
  const plan = panel("library-run-plan", ClipboardList, stepSummary, steps);
  const activityPanel = panel(
    "library-run-activity",
    Activity,
    toolSummary,
    activity,
  );
  const run = h(
    doc,
    "section",
    {
      class: "sap-library-run-surface",
      "aria-label": getString("library-run-view"),
    },
    h(
      doc,
      "header",
      { class: "sap-library-run-toolbar" },
      h(
        doc,
        "button",
        {
          type: "button",
          click: actions.closeRun,
          class: "sap-library-run-link",
        },
        lucideIcon(doc, CircleStop, 13),
        getString("library-chats"),
      ),
      h(doc, "span", { "aria-hidden": "true" }, "/"),
      crumb,
      status,
      stop,
      toggleProgress,
    ),
    h(
      doc,
      "div",
      { class: "sap-library-run-scroll" },
      h(
        doc,
        "div",
        { class: "sap-library-run-main" },
        metadata,
        title,
        timeline,
        counters,
        plan,
        activityPanel,
      ),
    ),
  );
  let selected: AssistantMessage | undefined;
  let latest = false;
  let state: ChatState | undefined;
  let timer: number | undefined;
  let drawnPlan: AssistantMessage["plan"];
  let drawnTools: AssistantTool[] | undefined;
  let drawnToolNames = "";
  let earlierOpen = false;
  let runId: string | undefined;

  function details(label: MessageId, list: HTMLElement) {
    return h(
      doc,
      "details",
      { class: "sap-library-run-section", open: true },
      h(doc, "summary", {}, getString(label), lucideIcon(doc, ChevronDown, 12)),
      list,
    );
  }

  function panel(
    label: MessageId,
    icon: typeof Activity,
    count: HTMLElement,
    children: HTMLElement,
  ) {
    return h(
      doc,
      "section",
      { class: "sap-library-run-panel" },
      h(doc, "h2", {}, lucideIcon(doc, icon, 15), getString(label), count),
      children,
    );
  }

  function statusIcon(value: string) {
    const icon =
      value === "completed"
        ? Check
        : value === "in_progress"
          ? LoaderCircle
          : value === "failed" || value === "cancelled"
            ? X
            : value === "paused"
              ? Minus
              : null;
    return h(
      doc,
      "span",
      { class: "sap-library-run-step-icon", "aria-hidden": "true" },
      icon && lucideIcon(doc, icon, 11),
    );
  }

  function step(text: string, value: string) {
    return h(
      doc,
      "li",
      { "data-status": value, class: "sap-library-run-step" },
      statusIcon(value),
      h(doc, "span", {}, text),
    );
  }

  function toolRow(tool: AssistantTool, expanded: boolean) {
    const name = tool.name || tool.title || getString("thinking-tool");
    return h(
      doc,
      "li",
      {
        "data-tool-id": tool.toolCallId,
        "data-status": tool.status,
        class: "sap-library-run-step",
      },
      statusIcon(tool.status),
      h(
        doc,
        "details",
        { open: expanded, class: "sap-library-run-tool" },
        h(
          doc,
          "summary",
          {},
          lucideIcon(doc, Wrench, 13),
          h(doc, "span", {}, name),
          h(doc, "time", {}, toolDuration(tool)),
          lucideIcon(doc, ChevronDown, 12),
        ),
        tool.name && tool.title && tool.title !== tool.name
          ? h(doc, "p", {}, tool.title)
          : null,
        tool.input
          ? h(
              doc,
              "pre",
              { "aria-label": getString("library-run-tool-input") },
              tool.input,
            )
          : null,
        tool.output
          ? h(
              doc,
              "pre",
              { "aria-label": getString("library-run-tool-output") },
              tool.output,
            )
          : null,
        !tool.input && !tool.output
          ? h(doc, "p", {}, statusText(tool.status))
          : null,
      ),
    );
  }

  function statusText(value: string) {
    return getString(
      value === "completed"
        ? "library-run-completed"
        : value === "cancelled"
          ? "library-run-stopped"
          : value === "failed"
            ? "library-run-failed"
            : value === "in_progress"
              ? "library-run-running"
              : value === "paused"
                ? "library-run-needs-input"
                : "library-run-pending",
    );
  }

  function refreshRequests() {
    const visible = Array.from(requests.children).filter(
      (card) => !card.hasAttribute("hidden"),
    );
    const awaiting = visible.some(
      (card) =>
        !card.hasAttribute("data-phase") ||
        card.getAttribute("data-phase") === "pending",
    );
    requestsSection.hidden = !visible.length;
    progress.dataset.needsInput = String(awaiting);
    requestsSection.dataset.pending = String(awaiting);
    run.dataset.needsInput = String(awaiting && latest);
    renderStatus(awaiting && latest);
  }
  const observer = new win.MutationObserver(refreshRequests);
  observer.observe(requests, {
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "data-phase"],
    childList: true,
  });

  function renderStatus(awaiting: boolean) {
    if (!state || !selected) return;
    const value = !selected.stopReason
      ? state.execution === "cancelling"
        ? "stopping"
        : awaiting
          ? "needs-input"
          : "running"
      : selected.stopReason === "end_turn"
        ? "completed"
        : "stopped";
    status.dataset.status = value;
    timeline.dataset.status = value;
    status.textContent = getString(statusLabels[value]);
    stop.hidden = !latest || Boolean(selected.stopReason);
    stop.disabled = state.execution === "cancelling";
  }

  function renderTime() {
    if (selected?.startedAt === undefined) return;
    const end =
      selected.endedAt ??
      (selected.stopReason ? selected.thinkingEndedAt : Date.now());
    time.textContent =
      end === undefined ? "" : runDuration(end - selected.startedAt);
    time.parentElement?.toggleAttribute("hidden", end === undefined);
  }

  function stopTimer() {
    if (timer !== undefined) win.clearInterval(timer);
    timer = undefined;
  }

  function renderProgress(
    entries: ReadonlyArray<{ content: string; status: string }>,
  ) {
    const earlier = Math.max(0, entries.length - 2);
    const compact = (entry: (typeof entries)[number]) =>
      step(entry.content, entry.status);
    progressDetails.hidden = entries.length === 0;
    items.replaceChildren(
      ...(!earlierOpen && earlier
        ? [
            h(
              doc,
              "li",
              { class: "sap-library-run-earlier" },
              h(
                doc,
                "button",
                {
                  type: "button",
                  class: "sap-library-run-link",
                  click: () => {
                    earlierOpen = true;
                    renderProgress(entries);
                  },
                },
                getString("library-run-earlier-steps", { count: earlier }),
              ),
            ),
          ]
        : []),
      ...entries.slice(earlierOpen ? 0 : earlier).map(compact),
    );
  }

  function render(
    stateValue: ChatState,
    fallbackTitle?: string,
    messageId?: string,
  ) {
    state = stateValue;
    const lastAssistant = state.messages.findLast(
      (message) => message.role === "assistant",
    );
    selected = messageId
      ? (state.messages.find(
          (message): message is AssistantMessage =>
            message.role === "assistant" && message.id === messageId,
        ) ?? lastAssistant)
      : lastAssistant;
    latest = selected === lastAssistant;
    if (selected?.id !== runId) {
      runId = selected?.id;
      earlierOpen = false;
      drawnPlan = undefined;
      drawnTools = undefined;
      steps.replaceChildren();
      activity.replaceChildren();
    }
    if (!selected) {
      progressDetails.hidden =
        outputDetails.hidden =
        usedDetails.hidden =
        runLink.hidden =
          true;
      stopTimer();
      refreshRequests();
      return;
    }
    const current = selected;
    const user = state.messages
      .slice(0, state.messages.indexOf(current))
      .findLast((message) => message.role === "user");
    const prompt =
      user?.text.trim() || fallbackTitle || getString("library-run-view");
    crumb.textContent = prompt;
    crumb.title = prompt;
    title.textContent = prompt;
    const agentName = latest ? state.agentName : null;
    const started = current.startedAt
      ? new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
          minute: "2-digit",
        }).format(current.startedAt)
      : null;
    metadata.textContent = [agentName, started].filter(Boolean).join(" · ");
    metadata.hidden = !metadata.textContent;
    const tools = current.blocks.filter(
      (block): block is AssistantTool => block.type === "tool",
    );
    const entries = current.plan ?? [];
    const done = entries.filter((entry) => entry.status === "completed").length;
    const complete = current.stopReason === "end_turn";
    const count = entries.length;
    if (count) timeline.value = done / count;
    else if (current.stopReason) timeline.value = complete ? 1 : 0;
    else timeline.removeAttribute("value");
    timeline.setAttribute("aria-label", getString("library-progress-title"));
    const metric = (label: MessageId, value: string | HTMLElement) =>
      h(
        doc,
        "div",
        {},
        h(doc, "dt", {}, getString(label)),
        typeof value === "string" ? h(doc, "dd", {}, value) : value,
      );
    const cost = current.usage?.cost;
    counters.replaceChildren(
      ...(count ? [metric("library-run-steps", `${done} / ${count}`)] : []),
      metric("library-run-tool-calls", String(tools.length)),
      ...(current.startedAt ? [metric("library-run-time", time)] : []),
      ...(cost &&
      /^[A-Z]{3}$/i.test(cost.currency) &&
      Number.isFinite(cost.amount)
        ? [
            metric(
              "library-run-session-cost",
              new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: cost.currency,
              }).format(cost.amount),
            ),
          ]
        : []),
    );
    if (
      current.plan !== drawnPlan ||
      drawnTools?.length !== tools.length ||
      tools.some((tool, index) => tool !== drawnTools?.[index])
    ) {
      const open = new Set(
        Array.from<HTMLElement>(
          activity.querySelectorAll<HTMLElement>("li[data-tool-id]"),
        )
          .filter((row) => row.querySelector("details[open]"))
          .map((row) => row.dataset.toolId),
      );
      steps.replaceChildren(
        ...entries.map((entry) => step(entry.content, entry.status)),
      );
      activity.replaceChildren(
        ...tools.map((tool) => toolRow(tool, open.has(tool.toolCallId))),
      );
      renderProgress(
        count
          ? entries
          : tools.map((tool) => ({
              content: tool.title || tool.name || getString("thinking-tool"),
              status: tool.status,
            })),
      );
      const availableOutputs = tools.filter(
        (tool) => tool.status === "completed" && tool.output,
      );
      const artifacts = new Set(
        tools
          .filter((tool) => tool.status === "completed")
          .flatMap((tool) => tool.artifacts ?? [])
          .map(({ name }) => name),
      );
      const openOutputs = new Set(
        Array.from<HTMLDetailsElement, string | undefined>(
          outputs.querySelectorAll<HTMLDetailsElement>("details[open]"),
          (row) => row.dataset.toolId,
        ),
      );
      outputs.replaceChildren(
        ...Array.from(artifacts, (name) =>
          h(
            doc,
            "div",
            { class: "sap-library-run-artifact" },
            lucideIcon(doc, FileText, 14),
            h(doc, "span", {}, name),
          ),
        ),
        ...availableOutputs.map((tool) =>
          h(
            doc,
            "details",
            {
              class: "sap-library-run-output",
              "data-tool-id": tool.toolCallId,
              open: openOutputs.has(tool.toolCallId),
            },
            h(
              doc,
              "summary",
              {},
              lucideIcon(doc, FileText, 14),
              h(
                doc,
                "span",
                {},
                tool.name || tool.title || getString("thinking-tool"),
              ),
              lucideIcon(doc, ChevronDown, 12),
            ),
            h(doc, "pre", {}, tool.output),
          ),
        ),
      );
      outputDetails.hidden = !outputs.childElementCount;
      drawnPlan = current.plan;
      drawnTools = tools;
    }
    const names = new Set(
      state.messages
        .flatMap((message) =>
          message.role === "assistant"
            ? message.blocks.flatMap((block) =>
                block.type === "tool" ? [block.name || block.title] : [],
              )
            : [],
        )
        .filter(Boolean),
    );
    const namesSignature = JSON.stringify([...names]);
    if (drawnToolNames !== namesSignature) {
      drawnToolNames = namesSignature;
      used.replaceChildren(
        ...Array.from(names, (name) =>
          h(
            doc,
            "div",
            {},
            lucideIcon(doc, Wrench, 13),
            h(doc, "span", {}, name),
          ),
        ),
      );
    }
    usedDetails.hidden = !names.size;
    plan.hidden = !count;
    activityPanel.hidden = !tools.length;
    stepSummary.textContent = `${done} / ${count}`;
    toolSummary.textContent = String(tools.length);
    runLink.hidden = false;
    renderTime();
    if (current.stopReason) stopTimer();
    else if (current.startedAt && timer === undefined)
      timer = win.setInterval(renderTime, 1000);
    refreshRequests();
  }
  progressDetails.hidden =
    outputDetails.hidden =
    usedDetails.hidden =
    runLink.hidden =
      true;
  return {
    progress,
    run,
    requests,
    render,
    refreshRequests,
    setPresentation(mode: "chat" | "run") {
      progress.dataset.presentation = mode;
    },
    setProgressOpen(open: boolean) {
      toggleProgress.setAttribute("aria-expanded", String(open));
    },
    destroy() {
      stopTimer();
      observer.disconnect();
    },
  };
}
