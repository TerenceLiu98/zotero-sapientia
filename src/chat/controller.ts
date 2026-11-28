import { RequestError } from "@agentclientprotocol/sdk";
import type * as acp from "@agentclientprotocol/sdk";
import { secretValues } from "../agents/secrets";
import { discoverAgentProfiles } from "../agents/discovery";
import { defaultWorkspace, resolveLaunchSpec } from "../agents/launch";
import {
  getDefaultProfile,
  getDefaultProfileId,
  getLibraryDefaultModel,
  loadProfiles,
  mergeProfiles,
  setDefaultProfileId,
} from "../agents/store";
import { AgentConnection, type AgentEvent } from "../acp/connection";
import { sessionChoicesFromConfig, type SessionChoices } from "../acp/models";
import { READ_CURRENT_PAPER } from "../context/paper-tools";
import { WriteApprovals } from "../writes/approval";
import { writeAllowed, type WriteHandoff } from "../writes/request";
import { startPaperTools } from "../context/tool-server";
import { UserError } from "../utils/errors";
import { logError, redactor } from "../utils/log";
import {
  libraryRecap,
  loadLibrarySession,
  saveLibrarySession,
} from "./library-session";
import { foldUpdate, type ChatMessage, type TurnContext } from "./transcript";

export type {
  AssistantBlock,
  AssistantMessage,
  AssistantTool,
  ChatMessage,
  TurnContext,
} from "./transcript";

export type ConnectionState =
  "disconnected" | "connecting" | "connected" | "error";

export type ExecutionState = "idle" | "executing" | "cancelling";

interface AgentPermission {
  title: string;
  details: string;
  decide(allow: boolean): void;
}

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
  models: SessionChoices | null;
  reasoning: SessionChoices | null;
  changingModel: boolean;
  agentPermission: AgentPermission | null;
  libraryWrites?: { direct: boolean; tagDeletion: boolean };
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
 * Sending opens a session when there is none.
 * The Library Agent keeps its transcript when a new ACP session is needed.
 */
export class ChatController {
  readonly writes: WriteApprovals;
  private state: ChatState = {
    agentName: null,
    connection: "disconnected",
    execution: "idle",
    error: null,
    messages: [],
    canRestore: false,
    models: null,
    reasoning: null,
    changingModel: false,
    agentPermission: null,
  };

  private readonly listeners = new Set<Listener>();
  private connection: AgentConnection | null = null;
  private paperTools: ReturnType<typeof startPaperTools> | null = null;
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
  private libraryProfileId = "";
  private libraryLoaded: Promise<void> | null = null;
  private librarySave = Promise.resolve();
  private recap = "";

  constructor(
    private readonly writeHandoff?: WriteHandoff,
    readonly library = false,
    private readonly libraryThreadId?: string,
  ) {
    if (library)
      this.state.libraryWrites = { direct: false, tagDeletion: false };
    this.writes = new WriteApprovals(
      library
        ? {
            writeAllowed: () => true,
            direct: () => this.state.libraryWrites!.direct,
            tagDeletionAllowed: () => this.state.libraryWrites!.tagDeletion,
          }
        : undefined,
    );
  }

  get selectedProfileId(): string {
    return this.library
      ? this.libraryProfileId || getLibraryDefaultModel()?.profileId || ""
      : getDefaultProfileId();
  }

  get selectedAgentModel(): { profileId: string; modelId?: string } {
    return this.connection && this.profileId
      ? { profileId: this.profileId, modelId: this.state.models?.currentId }
      : { profileId: this.selectedProfileId };
  }

  setLibraryWrites(patch: Partial<NonNullable<ChatState["libraryWrites"]>>) {
    if (!this.state.libraryWrites) return;
    this.update({ libraryWrites: { ...this.state.libraryWrites, ...patch } });
  }

  loadLibrary(): Promise<void> {
    if (!this.library) return Promise.resolve();
    return (this.libraryLoaded ??= loadLibrarySession(this.libraryThreadId)
      .then((snapshot) => {
        if (!snapshot) return;
        const { messages, profileId, sessionId } = snapshot;
        this.libraryProfileId = messages.length
          ? profileId
          : (getLibraryDefaultModel()?.profileId ?? profileId);
        this.nextMessageNumber =
          1 +
          messages.reduce((max, { id }) => Math.max(max, Number(id) || 0), 0);
        if (sessionId && profileId)
          this.restorableSession = { id: sessionId, profileId };
        this.update({ messages, canRestore: this.restorableSession !== null });
      })
      .catch((error) =>
        logError("Could not load the Library Agent conversation", error),
      ));
  }

  private persistLibrary(): void {
    if (!this.library) return;
    const profileId = this.libraryProfileId;
    const remembered = this.restorableSession;
    const sessionId = this.recap
      ? null
      : (this.sessionId ??
        (remembered?.profileId === profileId ? remembered.id : null));
    const snapshot = { messages: this.state.messages, profileId, sessionId };
    this.librarySave = this.librarySave
      .then(() => saveLibrarySession(snapshot, this.libraryThreadId))
      .catch((error) =>
        logError("Could not save the Library Agent conversation", error),
      );
  }

  flushLibrary(): Promise<void> {
    return this.librarySave;
  }

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
    if (this.library) await this.loadLibrary();
    const preferred = this.library && getLibraryDefaultModel();
    if (this.library && !preferred) return;
    if (
      preferred &&
      (this.state.connection === "disconnected" ||
        this.state.connection === "error")
    ) {
      if (!this.state.messages.length)
        this.libraryProfileId = preferred.profileId;
      await this.connect();
      return;
    }
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
    if (connection) this.rememberSession(connection);
    this.sessionId = null;
    this.replaying = null;
    await Promise.all([connection && this.close(connection), this.connecting]);
    if (this.state.connection !== "error") {
      this.update({
        connection: "disconnected",
        canRestore: this.restorableSession !== null,
        models: null,
        reasoning: null,
      });
    }
    if (this.library && this.libraryLoaded) {
      this.persistLibrary();
      await this.librarySave;
    }
  }

  async selectAgent(id: string): Promise<void> {
    if (this.library) await this.loadLibrary();
    if (this.turn || this.changingModel) return;
    const local = loadProfiles().some((profile) => profile.id === id);
    if (
      !local &&
      !(await discoverAgentProfiles()).some((profile) => profile.id === id)
    )
      return;
    if (this.turn || this.changingModel) return;
    if (this.selectedProfileId === id && (this.connecting || this.connection))
      return;
    if (!this.library) setDefaultProfileId(id);
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
        reasoning: null,
      });
    }
    if (this.library) {
      this.libraryProfileId = id;
      this.persistLibrary();
    }
    await this.connect();
  }

  selectModel(id: string): Promise<void> {
    return this.selectSessionChoice(this.state.models, id);
  }

  selectReasoning(id: string): Promise<void> {
    return this.selectSessionChoice(this.state.reasoning, id);
  }

  private async selectSessionChoice(
    choices: SessionChoices | null,
    id: string,
  ): Promise<void> {
    const connection = this.connection;
    const sessionId = this.sessionId;
    if (
      !connection ||
      !sessionId ||
      !choices ||
      this.turn ||
      this.connecting ||
      this.changingModel ||
      choices.currentId === id ||
      !choices.options.some((option) => option.id === id)
    )
      return;

    this.changingModel = connection
      .setConfigOption(sessionId, choices.configId, id)
      .then(({ configOptions }) => {
        if (this.connection === connection && this.sessionId === sessionId)
          this.update(sessionChoicesFromConfig(configOptions));
      })
      .catch((error) => {
        if (this.connection !== connection || this.sessionId !== sessionId)
          return;
        const failure = toFailure(error);
        logError(
          `Session option selection failed (${failure.key}) ${JSON.stringify(failure.params)}`,
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
    const recap = this.recap;
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
    this.persistLibrary();

    try {
      onAccepted?.();
      const response = await connection.prompt(
        sessionId,
        promptBlocks(
          prompt,
          context,
          this.paperTools ? turn.assistantId : null,
          this.state.libraryWrites,
          recap,
        ),
      );
      turn.settle();
      if (this.turn === turn) {
        if (!turn.cancelled && response.stopReason !== "cancelled")
          this.recap = "";
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
      turn.abort.abort();
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
    this.recap = "";
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
      reasoning: null,
    });
    this.persistLibrary();
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
    if (this.library) {
      await this.librarySave;
      return;
    }
    this.restorableSession = null;
    this.update({
      messages: [],
      canRestore: false,
      error: null,
      connection: "disconnected",
      models: null,
      reasoning: null,
    });
  }

  private async connectOnce(
    signal: AbortSignal,
    restore: boolean,
  ): Promise<boolean> {
    if (this.connection) {
      return true;
    }
    if (this.library) await this.loadLibrary();
    const saved = loadProfiles();
    const defaultId = this.selectedProfileId;
    const available =
      saved.find((entry) => entry.id === defaultId) ||
      (!defaultId && saved.length)
        ? saved
        : mergeProfiles(saved, await discoverAgentProfiles());
    const requested = available.find((entry) => entry.id === defaultId);
    const requirePreferred =
      this.library && defaultId === getLibraryDefaultModel()?.profileId;
    const fallback = this.library ? getDefaultProfile(available) : available[0];
    const profile = requested ?? (requirePreferred ? undefined : fallback);
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
      const connection = await AgentConnection.open(
        spec,
        signal,
        profile.id === "detected-antigravity" ||
          /(?:^|[\\/])agy(?:\.exe)?$/i.test(spec.command)
          ? (request) => this.requestAgentPermission(request)
          : undefined,
      );
      if (signal.aborted) {
        await connection.close();
        return false;
      }
      this.connection = connection;
      this.releaseSecrets = releaseSecrets;
      this.profileId = profile.id;
      if (this.library) this.libraryProfileId = profile.id;
      this.sessionCwd = spec.cwd;
      connection.onEvent((event) => {
        if (this.connection === connection) this.handleEvent(event);
      });
      if (connection.capabilities.mcpCapabilities?.http) {
        this.paperTools = startPaperTools(
          (turnId) => {
            const turn = this.turn;
            if (
              this.connection === connection &&
              this.sessionId &&
              turn?.assistantId === turnId &&
              !turn.abort.signal.aborted &&
              (this.library ||
                turn.context?.paper ||
                turn.context?.tagItems?.length)
            ) {
              return {
                paper: turn.context?.paper,
                tagItems: turn.context?.tagItems,
                readSelection: turn.context?.readSelection,
                signal: turn.abort.signal,
                recordPdfRead: (pages) => this.recordPdfRead(turn, pages),
              };
            }
          },
          this.writeHandoff ?? this.writes.request,
          this.library
            ? {
                library: true,
                writeAllowed: () => true,
                tagDeletionAllowed: () => this.state.libraryWrites!.tagDeletion,
              }
            : undefined,
        );
      }
      const restoreId =
        (restore || this.library) &&
        this.restorableSession?.profileId === profile.id
          ? this.restorableSession.id
          : null;
      await this.openSession(connection, restoreId);
      if (signal.aborted || this.connection !== connection) return false;
      this.update({ connection: "connected" });
      this.persistLibrary();
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
   * agent supports it. A new Library Agent session gets a recap on its first
   * prompt. A new paper-sidebar session starts with an empty transcript.
   */
  private async openSession(
    connection: AgentConnection,
    restoreId: string | null = null,
  ): Promise<void> {
    this.update({ canRestore: false, models: null, reasoning: null });
    const mcpServers = this.paperTools ? [this.paperTools.server] : [];
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
        this.restorableSession = null;
        this.recap = "";
        await this.loadSessionConfig(
          connection,
          restoreId,
          response.configOptions,
        );
        return;
      }
    }
    if (this.library) this.recap = libraryRecap(this.state.messages);
    else this.update({ messages: [] });
    const { sessionId, configOptions } = await connection.newSession(
      this.sessionCwd,
      mcpServers,
    );
    if (this.connection !== connection) return;
    this.sessionId = sessionId;
    this.restorableSession = null;
    await this.loadSessionConfig(connection, sessionId, configOptions);
    this.persistLibrary();
  }

  private async loadSessionConfig(
    connection: AgentConnection,
    sessionId: string,
    configOptions: acp.SessionConfigOption[] | null | undefined,
  ): Promise<void> {
    if (configOptions) this.update(sessionChoicesFromConfig(configOptions));
    const preferred = this.library && getLibraryDefaultModel();
    if (!preferred || preferred.profileId !== this.profileId) return;
    const models = this.state.models;
    if (!models?.options.some(({ id }) => id === preferred.modelId))
      throw new UserError("library-default-model-unavailable", {
        model: preferred.modelId,
      });
    if (models.currentId === preferred.modelId) return;
    const configured = await connection.setConfigOption(
      sessionId,
      models.configId,
      preferred.modelId,
    );
    if (this.connection !== connection || this.sessionId !== sessionId) return;
    this.update(sessionChoicesFromConfig(configured.configOptions));
    if (this.state.models?.currentId !== preferred.modelId)
      throw new UserError("library-default-model-unavailable", {
        model: preferred.modelId,
      });
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
        this.update(sessionChoicesFromConfig(update.configOptions));
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
    const messages = foldUpdate(this.state.messages, update, this.library);
    if (messages !== this.state.messages) this.update({ messages });
  }

  private endTurn(stopReason: acp.StopReason): void {
    const turn = this.turn;
    this.turn = null;
    if (!turn) {
      return;
    }
    turn.abort.abort();
    const now = Date.now();
    this.update({
      execution: "idle",
      messages: this.state.messages.map((message) =>
        message.id === turn.assistantId && message.role === "assistant"
          ? {
              ...message,
              stopReason,
              thinkingEndedAt: message.thinkingEndedAt ?? now,
              ...(this.library && { endedAt: now }),
            }
          : message,
      ),
    });
    this.persistLibrary();
  }

  private async requestAgentPermission({
    sessionId,
    toolCall,
    options,
  }: acp.RequestPermissionRequest): Promise<acp.RequestPermissionResponse> {
    const signal = this.turn?.abort.signal;
    const allowOnce = options.find(({ kind }) => kind === "allow_once");
    const denyOnce = options.find(({ kind }) => kind === "reject_once");
    if (
      !signal ||
      signal.aborted ||
      sessionId !== this.sessionId ||
      !allowOnce ||
      this.state.agentPermission
    )
      return { outcome: { outcome: "cancelled" } };

    return new Promise((resolve) => {
      const cancel = () => {
        signal.removeEventListener("abort", cancel);
        this.update({ agentPermission: null });
        resolve({ outcome: { outcome: "cancelled" } });
      };
      const permission: AgentPermission = {
        title: redactor.redact(toolCall.title ?? ""),
        details: redactor.redact(
          JSON.stringify(toolCall.rawInput, null, 2) ?? "",
        ),
        decide: (allow) => {
          if (this.state.agentPermission !== permission) return;
          const option = allow ? allowOnce : denyOnce;
          signal.removeEventListener("abort", cancel);
          this.update({ agentPermission: null });
          resolve({
            outcome: option
              ? { outcome: "selected", optionId: option.optionId }
              : { outcome: "cancelled" },
          });
        },
      };
      signal.addEventListener("abort", cancel, { once: true });
      this.update({ agentPermission: permission });
    });
  }

  private recordPdfRead(
    turn: Turn,
    pages: readonly { uri: string; text: string }[],
  ) {
    if (this.turn !== turn || turn.abort.signal.aborted) return;
    const messages = this.state.messages;
    const last = messages.at(-1);
    if (last?.role !== "assistant" || last.id !== turn.assistantId) return;
    const pdfRead = new Map(last.pdfRead);
    for (const { uri, text } of pages) {
      const excerpt = text.replace(/\s+/g, " ").trim();
      pdfRead.set(
        uri,
        excerpt.length > 420 ? excerpt.slice(0, 419) + "…" : excerpt,
      );
    }
    this.update({ messages: [...messages.slice(0, -1), { ...last, pdfRead }] });
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
      reasoning: null,
    });
    return false;
  }

  /** Keeps the previous session when it represents the current transcript. */
  private rememberSession(connection: AgentConnection): void {
    if (
      this.sessionId &&
      this.profileId &&
      (this.library ? !this.recap : connection.supportsSessionRestore)
    ) {
      this.restorableSession = {
        id: this.sessionId,
        profileId: this.profileId,
      };
    }
  }

  private async close(connection: AgentConnection): Promise<void> {
    const releaseSecrets = this.releaseSecrets;
    this.releaseSecrets = null;
    const paperTools = this.paperTools;
    this.paperTools = null;
    try {
      await Promise.all([connection.close(), paperTools?.close()]);
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
  readonly abort = new AbortController();
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

function snapshotContext({
  paper,
  tagItems,
  selections,
  readSelection,
}: TurnContext): TurnContext {
  return {
    paper: paper && {
      ...paper,
      authors: [...paper.authors],
      attachment: paper.attachment && { ...paper.attachment },
      ...(paper.attachments && {
        attachments: paper.attachments.map((attachment) => ({ ...attachment })),
      }),
    },
    ...(tagItems && {
      tagItems: tagItems.map((item) => ({
        ...item,
        authors: [...item.authors],
      })),
    }),
    selections: selections.map((selection) => ({ ...selection })),
    ...(readSelection && { readSelection }),
  };
}

function promptBlocks(
  text: string,
  context: TurnContext | undefined,
  toolTurnId: string | null,
  libraryWrites?: ChatState["libraryWrites"],
  recap?: string,
): acp.ContentBlock[] {
  const blocks: acp.ContentBlock[] = [{ type: "text", text }];
  const paper = context?.paper;
  const tagItems = context?.tagItems;
  if (recap) blocks.push({ type: "text", text: recap });
  if (libraryWrites && toolTurnId) {
    blocks.push({
      type: "text",
      text: `Use the zotero-sapientia tools with turnId "${toolTurnId}" for the personal Zotero library. Use search_library and list_library_collections, then pass itemKey or itemID to read tools and cite exact PDF URIs. Use propose_zotero_write for requested writes, in batches of at most 50 operations, and wait for results. For bibliographic corrections use your available sources and supply evidence URLs and summaries. Report unresolved records with report_metadata_unresolved when evidence conflicts or is unreliable. The current mode is ${libraryWrites.direct ? "direct writes" : "batch approval"}. Tag deletion is ${libraryWrites.tagDeletion ? "enabled" : "disabled"}.`,
    });
  }
  if (paper) {
    const {
      itemID,
      itemKey,
      libraryID,
      title,
      authors,
      abstract,
      doi,
      year,
      attachment,
      attachments,
    } = paper;
    const pdfTool =
      attachment && toolTurnId
        ? { name: READ_CURRENT_PAPER, turnId: toolTurnId }
        : undefined;
    blocks.push({
      type: "text",
      text: `Current Zotero paper (metadata):\n${JSON.stringify({
        itemID,
        itemKey,
        libraryID,
        title,
        authors,
        abstract,
        doi,
        year,
        pdf: attachment?.uri,
        attachments,
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
        text:
          attachments && attachments.length > 1
            ? "Cite known pages using the exact Markdown link URI returned for that attachment and page."
            : "Cite known pages using their exact Zotero URI, or a Markdown link such as [p. 3](#page=3) for this single PDF. Use the 1-based physical PDF page number.",
      });
    }
  }
  if (paper && toolTurnId) {
    blocks.push({
      type: "text",
      text: `Use the zotero-sapientia tools with turnId "${toolTurnId}". For PDF reads, prefer a page or range when the relevant pages are known. Cite the exact page URI returned by the tool.${writeAllowed() ? " Use propose_zotero_write for requested updates and wait for user approval. For notes, use create_note to make a child note, or read_paper_notes then edit_note with the exact noteKey and complete replacement HTML to edit an existing note. Read current tags before proposing tag changes." : " Zotero writes are disabled in read-only mode."}`,
    });
  }
  if (tagItems?.length && toolTurnId) {
    blocks.push({
      type: "text",
      text: `Use the zotero-sapientia tools with turnId "${toolTurnId}". The following Zotero items were selected for tagging:\n${JSON.stringify(tagItems)}\nCall read_paper_tags without an item identifier for all selected items, or with itemID for one.${writeAllowed() ? " For requested tag changes, send one propose_zotero_write call with an operations array, using an explicit itemID per add_tags or delete_tags operation. Wait for user approval." : " Zotero writes are disabled in read-only mode."}`,
    });
  }
  const selections = context?.selections;
  if (selections?.length) {
    blocks.push({
      type: "text",
      text: `Excerpts the user added. Cite PDF excerpts with their exact source URI. Excerpts from previous answers are conversation context.\n${JSON.stringify(
        selections.map((selection) => {
          if ("answerId" in selection) {
            return { text: selection.text, source: "previous_agent_answer" };
          }
          const { text, itemTitle, pageIndex, pageLabel, uri, comment } =
            selection;
          return {
            text,
            title: itemTitle,
            page: pageIndex === undefined ? undefined : pageIndex + 1,
            pageLabel,
            uri,
            comment,
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
