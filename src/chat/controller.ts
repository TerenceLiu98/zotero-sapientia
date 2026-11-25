import { RequestError } from "@agentclientprotocol/sdk";
import type * as acp from "@agentclientprotocol/sdk";
import { secretValues } from "../agents/secrets";
import { discoverAgentProfiles } from "../agents/discovery";
import { defaultWorkspace, resolveLaunchSpec } from "../agents/launch";
import {
  getDefaultProfile,
  getDefaultProfileId,
  loadProfiles,
  setDefaultProfileId,
} from "../agents/store";
import { AgentConnection, type AgentEvent } from "../acp/connection";
import { modelsFromConfig, type SessionModels } from "../acp/models";
import { READ_CURRENT_PAPER, startPdfTool } from "../context/pdf-tool";
import { UserError } from "../utils/errors";
import { logError, redactor } from "../utils/log";
import { foldUpdate, type ChatMessage, type TurnContext } from "./transcript";

export type { AssistantBlock, ChatMessage, TurnContext } from "./transcript";

export type ConnectionState =
  "disconnected" | "connecting" | "connected" | "error";

export type ExecutionState = "idle" | "executing" | "cancelling";

export interface ChatState {
  /** The agent behind the current or last connection. */
  agentName: string | null;
  connection: ConnectionState;
  execution: ExecutionState;
  /** Why the connection is in the error state. */
  error: UserError | null;
  messages: ChatMessage[];
  /** The interrupted conversation can be reopened. */
  canRestore: boolean;
  models: SessionModels | null;
  changingModel: boolean;
}

/** How long an agent gets to end a cancelled turn before it is considered stuck. */
const STOP_TIMEOUT_MS = 5000;

/** How long ending the conversation may keep Zotero waiting while it quits. */
const SHUTDOWN_TIMEOUT_MS = 5000;

type Listener = (state: ChatState) => void;

/**
 * The conversation: which agent it talks to, its session, and its transcript.
 * It has no user interface; views subscribe to it and act on its state.
 *
 * A session owns the transcript. Sending opens a session when there is none,
 * and every new session starts an empty transcript.
 */
export class ChatController {
  private state: ChatState = {
    agentName: null,
    connection: "disconnected",
    execution: "idle",
    error: null,
    messages: [],
    canRestore: false,
    models: null,
    changingModel: false,
  };

  private readonly listeners = new Set<Listener>();
  private connection: AgentConnection | null = null;
  private pdfTool: ReturnType<typeof startPdfTool> | null = null;
  private sessionCwd: string = defaultWorkspace();
  private sessionId: string | null = null;
  /** The session to offer for restoration once the connection is gone. */
  private restorableSession: { id: string; profileId: string } | null = null;
  private profileId: string | null = null;
  private replaying: string | null = null;
  private connecting: Promise<boolean> | null = null;
  private connectAbort: AbortController | null = null;
  private releaseSecrets: (() => void) | null = null;
  /** The turn in flight; updates that do not belong to it are dropped. */
  private turn: Turn | null = null;
  private nextMessageNumber = 1;
  private changingModel: Promise<void> | null = null;

  getState(): ChatState {
    return this.state;
  }

  /** Subscribes to state changes. Returns a function that unsubscribes. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Connects to the default agent and opens a session, unless that is already
   * the case. Resolves false, after reporting the failure in the state, if it
   * cannot be done.
   */
  connect(restore = false): Promise<boolean> {
    if (!this.connecting) {
      const abort = new AbortController();
      this.connectAbort = abort;
      this.connecting = this.connectOnce(abort.signal, restore).finally(() => {
        this.connectAbort = null;
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  /** Start the selected session when the sidebar opens, before the first prompt. */
  async warm(): Promise<void> {
    if (this.state.connection !== "disconnected" || this.state.canRestore)
      return;
    if (!loadProfiles().length && !(await discoverAgentProfiles()).length)
      return;
    if (this.state.connection === "disconnected" && !this.state.canRestore)
      await this.connect();
  }

  async disconnect(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    this.connectAbort?.abort();
    this.endTurn("cancelled");
    if (connection) {
      this.rememberSession(connection);
    }
    this.sessionId = null;
    this.replaying = null;
    await Promise.all([connection && this.close(connection), this.connecting]);
    if (this.state.connection !== "error") {
      this.update({
        connection: "disconnected",
        canRestore: this.restorableSession !== null,
        models: null,
      });
    }
  }

  async selectAgent(id: string): Promise<void> {
    if (this.turn || this.changingModel) return;
    const local = loadProfiles().some((profile) => profile.id === id);
    if (
      !local &&
      !(await discoverAgentProfiles()).some((profile) => profile.id === id)
    )
      return;
    if (this.turn || this.changingModel) return;
    if (getDefaultProfileId() === id && (this.connecting || this.connection))
      return;
    setDefaultProfileId(id);
    if (this.connecting || (this.connection && this.profileId !== id))
      await this.disconnect();
    if (this.profileId !== id) {
      this.restorableSession = null;
      this.update({
        connection: "disconnected",
        agentName: null,
        canRestore: false,
        error: null,
        models: null,
      });
    }
    await this.connect();
  }

  async selectModel(id: string): Promise<void> {
    const { models } = this.state;
    const connection = this.connection;
    const sessionId = this.sessionId;
    if (
      !connection ||
      !sessionId ||
      !models ||
      this.turn ||
      this.connecting ||
      this.changingModel ||
      models.currentId === id ||
      !models.options.some((option) => option.id === id)
    )
      return;

    this.changingModel = connection
      .setModel(sessionId, models.configId, id)
      .then((updated) => {
        if (this.connection === connection && this.sessionId === sessionId)
          this.update({ models: updated });
      })
      .catch((error) => {
        if (this.connection !== connection || this.sessionId !== sessionId)
          return;
        const failure = toFailure(error);
        logError(
          `Model selection failed (${failure.key}) ${JSON.stringify(failure.params)}`,
        );
        this.update({ error: failure });
      })
      .finally(() => {
        this.changingModel = null;
        this.update({ changingModel: false });
      });
    this.update({ changingModel: true, error: null });
    await this.changingModel;
  }

  /**
   * Calls onAccepted when the prompt enters the transcript, then resolves
   * when the turn ends. Resolves false if the prompt could not be started.
   */
  send(
    text: string,
    context?: TurnContext,
    onAccepted?: () => void,
  ): Promise<boolean> {
    return this.sendPrompt(
      text,
      context && snapshotContext(context),
      undefined,
      onAccepted,
    );
  }

  /** Requests another response to the last question in the current session. */
  async regenerate(assistantId: string): Promise<boolean> {
    const [question, answer] = this.state.messages.slice(-2);
    if (
      this.state.connection !== "connected" ||
      question?.role !== "user" ||
      answer?.role !== "assistant" ||
      answer.id !== assistantId ||
      !answer.stopReason
    )
      return false;
    return this.sendPrompt(question.text, question.context, assistantId);
  }

  private async sendPrompt(
    text: string,
    context?: TurnContext,
    replaceAnswerId?: string,
    onAccepted?: () => void,
  ): Promise<boolean> {
    const prompt = text.trim();
    if (!prompt || this.turn) {
      return false;
    }
    if (!(await this.connect())) {
      return false;
    }
    if (this.changingModel) await this.changingModel;
    const connection = this.connection;
    const sessionId = this.sessionId;
    if (
      this.turn ||
      !connection ||
      !sessionId ||
      (replaceAnswerId && this.state.messages.at(-1)?.id !== replaceAnswerId)
    ) {
      return false;
    }

    const turn = new Turn(this.nextMessageId(), context);
    this.turn = turn;
    this.update({
      execution: "executing",
      messages: [
        ...(replaceAnswerId
          ? this.state.messages.slice(0, -1)
          : [
              ...this.state.messages,
              {
                id: this.nextMessageId(),
                role: "user" as const,
                text: prompt,
                context,
              },
            ]),
        {
          id: turn.assistantId,
          role: "assistant",
          blocks: [],
          context,
          startedAt: Date.now(),
          stopReason: null,
        },
      ],
    });

    try {
      onAccepted?.();
      const response = await connection.prompt(
        sessionId,
        promptBlocks(prompt, context, this.pdfTool ? turn.assistantId : null),
      );
      turn.settle();
      if (this.turn === turn) {
        this.endTurn(turn.cancelled ? "cancelled" : response.stopReason);
      }
    } catch (error) {
      turn.settle();
      if (this.turn === turn) {
        this.fail(error);
      }
    }
    return true;
  }

  /** Asks the agent to end the running turn and waits until it has. */
  async stop(): Promise<void> {
    const turn = this.turn;
    const connection = this.connection;
    if (turn && connection && this.sessionId) {
      await this.cancelTurn(turn, connection, this.sessionId);
    }
  }

  private async cancelTurn(
    turn: Turn,
    connection: AgentConnection,
    sessionId: string,
  ): Promise<void> {
    if (!turn.cancelled) {
      turn.cancelled = true;
      this.update({ execution: "cancelling" });
      try {
        await connection.cancel(sessionId);
      } catch (error) {
        if (this.turn === turn) this.fail(error);
        return;
      }
    }
    const ended = await Promise.race([
      turn.settled.then(() => true),
      Zotero.Promise.delay(STOP_TIMEOUT_MS).then(() => false),
    ]);
    if (!ended && this.turn === turn) {
      this.fail(new UserError("acp-stop-timeout"));
    }
  }

  /** Clears the transcript and rejects all later updates from the old turn. */
  async newConversation(): Promise<void> {
    const connection = this.connection;
    if (
      !connection ||
      this.connecting ||
      this.changingModel ||
      this.state.connection !== "connected"
    )
      return;
    const turn = this.turn;
    const sessionId = this.sessionId;
    const abort = new AbortController();
    this.sessionId = null;
    this.restorableSession = null;
    this.connectAbort = abort;
    this.connecting = Promise.resolve()
      .then(async () => {
        if (turn && sessionId)
          await this.cancelTurn(turn, connection, sessionId);
        if (abort.signal.aborted) return false;
        if (!this.connection) return this.connectOnce(abort.signal, false);
        if (this.connection !== connection) return false;
        await this.openSession(connection);
        if (this.connection !== connection) return false;
        this.update({ connection: "connected" });
        return true;
      })
      .catch((error) => this.connection === connection && this.fail(error))
      .finally(() => {
        this.connectAbort = null;
        this.connecting = null;
      });
    this.update({
      connection: "connecting",
      messages: [],
      canRestore: false,
      error: null,
      models: null,
    });
    await this.connecting;
  }

  /** Reopens the conversation that was interrupted by a lost connection. */
  async restore(): Promise<void> {
    if (!this.state.canRestore || this.connection || this.connecting) {
      return;
    }
    await this.connect(true);
  }

  /** Ends the conversation and the agent process. */
  async shutdown(): Promise<void> {
    await Promise.race([
      this.disconnect(),
      Zotero.Promise.delay(SHUTDOWN_TIMEOUT_MS),
    ]);
    this.restorableSession = null;
    this.update({
      messages: [],
      canRestore: false,
      error: null,
      connection: "disconnected",
      models: null,
    });
  }

  private async connectOnce(
    signal: AbortSignal,
    restore: boolean,
  ): Promise<boolean> {
    if (this.connection) {
      return true;
    }
    const saved = loadProfiles();
    const defaultId = getDefaultProfileId();
    const profile =
      saved.find((entry) => entry.id === defaultId) ??
      getDefaultProfile(
        !defaultId && saved.length
          ? saved
          : [...saved, ...(await discoverAgentProfiles())],
      );
    if (signal.aborted) return false;
    if (!profile) {
      return this.fail(new UserError("agent-not-configured"));
    }

    this.update({
      connection: "connecting",
      error: null,
      agentName: profile.name,
    });
    const releaseSecrets = redactor.retainSecrets(secretValues(profile));
    try {
      const spec = await resolveLaunchSpec(profile);
      const connection = await AgentConnection.open(spec, signal);
      if (signal.aborted) {
        await connection.close();
        return false;
      }
      this.connection = connection;
      this.releaseSecrets = releaseSecrets;
      this.profileId = profile.id;
      this.sessionCwd = spec.cwd;
      connection.onEvent((event) => {
        if (this.connection === connection) this.handleEvent(event);
      });
      if (connection.capabilities.mcpCapabilities?.http) {
        this.pdfTool = startPdfTool((turnId) => {
          const turn = this.turn;
          if (
            this.connection === connection &&
            this.sessionId &&
            turn?.assistantId === turnId &&
            !turn.cancelled
          ) {
            return turn.context?.paper?.attachment;
          }
        });
      }
      const restoreId =
        restore && this.restorableSession?.profileId === profile.id
          ? this.restorableSession.id
          : null;
      await this.openSession(connection, restoreId);
      if (signal.aborted || this.connection !== connection) return false;
      this.update({ connection: "connected" });
      return true;
    } catch (error) {
      return signal.aborted ? false : this.fail(error);
    } finally {
      if (this.releaseSecrets !== releaseSecrets) releaseSecrets();
    }
  }

  /**
   * Opens a session on the connected agent and makes it the current one.
   * Reopens the remembered session if a restoration was requested and the
   * agent supports it; otherwise every new session starts an empty transcript,
   * because the agent has no memory of messages sent to an earlier one.
   */
  private async openSession(
    connection: AgentConnection,
    restoreId: string | null = null,
  ): Promise<void> {
    this.update({ canRestore: false, models: null });
    const mcpServers = this.pdfTool ? [this.pdfTool.server] : [];
    if (restoreId && connection.supportsSessionRestore) {
      this.replaying = restoreId;
      let response: acp.LoadSessionResponse | null;
      try {
        response = await connection.loadSession(
          restoreId,
          this.sessionCwd,
          mcpServers,
        );
      } finally {
        this.replaying = null;
      }
      if (this.connection !== connection) return;
      if (response) {
        // The local messages retain the original Zotero context and the
        // cancelled output the user saw. ACP replay can include prompt blocks
        // and output that arrived after cancellation.
        this.sessionId = restoreId;
        if (response.configOptions)
          this.update({ models: modelsFromConfig(response.configOptions) });
        return;
      }
    }
    this.update({ messages: [] });
    const { sessionId, configOptions } = await connection.newSession(
      this.sessionCwd,
      mcpServers,
    );
    if (this.connection !== connection) return;
    this.sessionId = sessionId;
    this.restorableSession = null;
    this.update({ models: modelsFromConfig(configOptions) });
  }

  private handleEvent(event: AgentEvent): void {
    if (event.type === "transport-closed") {
      this.fail(event.error);
      return;
    }
    if (event.type === "exit") {
      if (this.connection) {
        this.fail(this.connection.exitError());
      }
      return;
    }
    const { sessionId, update } = event.params;
    if (update.sessionUpdate === "config_option_update") {
      if (sessionId === this.sessionId || sessionId === this.replaying) {
        this.update({ models: modelsFromConfig(update.configOptions) });
      }
      return;
    }
    // An update that no running turn is waiting for is a late arrival of a
    // cancelled turn, or belongs to another session.
    if (
      !this.turn ||
      this.turn.cancelled ||
      event.params.sessionId !== this.sessionId
    ) {
      return;
    }
    this.update({
      messages: foldUpdate(this.state.messages, update),
    });
  }

  private endTurn(stopReason: acp.StopReason): void {
    const turn = this.turn;
    this.turn = null;
    if (!turn) {
      return;
    }
    this.update({
      execution: "idle",
      messages: this.state.messages.map((message) =>
        message.id === turn.assistantId && message.role === "assistant"
          ? {
              ...message,
              stopReason,
              thinkingEndedAt: message.thinkingEndedAt ?? Date.now(),
            }
          : message,
      ),
    });
  }

  /** Reports a failure that ended the conversation, and cleans up behind it. */
  private fail(error: unknown): false {
    const failure = toFailure(error);
    logError(
      `Conversation failed (${failure.key}) ${JSON.stringify(failure.params)}`,
    );
    const connection = this.connection;
    this.connection = null;
    this.endTurn("cancelled");
    if (connection) {
      this.rememberSession(connection);
      void this.close(connection).catch((error) => logError(String(error)));
    }
    this.sessionId = null;
    this.update({
      connection: "error",
      error: failure,
      canRestore: this.restorableSession !== null,
      models: null,
    });
    return false;
  }

  /** Keeps the session id for restoration if the agent can reopen sessions. */
  private rememberSession(connection: AgentConnection): void {
    if (this.sessionId && this.profileId && connection.supportsSessionRestore) {
      this.restorableSession = {
        id: this.sessionId,
        profileId: this.profileId,
      };
    }
  }

  private async close(connection: AgentConnection): Promise<void> {
    const releaseSecrets = this.releaseSecrets;
    this.releaseSecrets = null;
    const pdfTool = this.pdfTool;
    this.pdfTool = null;
    try {
      await Promise.all([connection.close(), pdfTool?.close()]);
    } finally {
      releaseSecrets?.();
    }
  }

  private nextMessageId(): string {
    return String(this.nextMessageNumber++);
  }

  private update(patch: Partial<ChatState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of [...this.listeners]) {
      listener(this.state);
    }
  }
}

/** A turn in flight: the assistant message it fills and whether it was cancelled. */
class Turn {
  /** Resolves once the agent has answered the prompt request, one way or another. */
  readonly settled: Promise<void>;
  private declareSettled!: () => void;
  /** Set once Stop was pressed; the turn's later updates are dropped. */
  cancelled = false;

  constructor(
    readonly assistantId: string,
    readonly context?: TurnContext,
  ) {
    this.settled = new Promise((resolve) => {
      this.declareSettled = resolve;
    });
  }

  settle(): void {
    this.declareSettled();
  }
}

function snapshotContext({ paper, selections }: TurnContext): TurnContext {
  return {
    paper: paper && {
      ...paper,
      authors: [...paper.authors],
      attachment: paper.attachment && { ...paper.attachment },
      materials: { ...paper.materials },
    },
    selections: selections.map((selection) => ({ ...selection })),
  };
}

function promptBlocks(
  text: string,
  context: TurnContext | undefined,
  pdfTurnId: string | null,
): acp.ContentBlock[] {
  const blocks: acp.ContentBlock[] = [{ type: "text", text }];
  const paper = context?.paper;
  if (paper) {
    const {
      itemKey,
      libraryID,
      title,
      authors,
      abstract,
      doi,
      year,
      attachment,
    } = paper;
    const pdfTool =
      attachment && paper.materials.pdfText && pdfTurnId
        ? { name: READ_CURRENT_PAPER, turnId: pdfTurnId }
        : undefined;
    blocks.push({
      type: "text",
      text: `Current Zotero paper (metadata):\n${JSON.stringify({
        itemKey,
        libraryID,
        title,
        authors,
        abstract,
        doi,
        year,
        pdf: attachment?.uri,
        pdfTool,
        page:
          attachment?.pageIndex === undefined
            ? undefined
            : attachment.pageIndex + 1,
        pageLabel: attachment?.pageLabel,
      })}`,
    });
    if (attachment) {
      blocks.push({
        type: "text",
        text: "Cite known pages in the current PDF using Markdown links such as [p. 3](#page=3). Use the 1-based physical PDF page number.",
      });
      if (pdfTool) {
        blocks.push({
          type: "text",
          text: "When you need the full PDF text, call the tool named in pdfTool with its turnId.",
        });
      }
    }
  }
  if (context?.selections.length) {
    blocks.push({
      type: "text",
      text: `Excerpts the user added. Cite PDF excerpts with their exact source URI. Excerpts from previous answers are conversation context.\n${JSON.stringify(
        context.selections.map((selection) => {
          if ("answerId" in selection) {
            return { text: selection.text, source: "previous_agent_answer" };
          }
          const { text, itemTitle, pageIndex, pageLabel, uri } = selection;
          return {
            text,
            title: itemTitle,
            page: pageIndex === undefined ? undefined : pageIndex + 1,
            pageLabel,
            uri,
          };
        }),
      )}`,
    });
  }
  return blocks;
}

function toFailure(error: unknown): UserError {
  if (error instanceof UserError) {
    const params = Object.fromEntries(
      Object.entries(error.params).map(([key, value]) => [
        key,
        typeof value === "string" ? redactor.redact(value) : value,
      ]),
    );
    return new UserError(error.key, params, { cause: error });
  }
  const message = redactor.redact(
    error instanceof Error ? error.message : String(error),
  );
  if (error instanceof RequestError) {
    return new UserError("acp-request-failed", { message }, { cause: error });
  }
  return new UserError("error-unexpected", { message }, { cause: error });
}
