import * as acp from "@agentclientprotocol/sdk";
import type { McpServer } from "@agentclientprotocol/sdk";
import { version } from "../../package.json";
import type { LaunchSpec } from "../agents/launch";
import { withTimeout } from "../utils/async";
import { UserError } from "../utils/errors";
import { redactor } from "../utils/log";
import { launchProcess, type AgentProcess } from "./process";

const CLIENT_NAME = "zotero-sapientia";

/**
 * How long the agent gets to answer the handshake and to open a session. The
 * first run of an agent installed through a package manager can be that slow.
 * A prompt has no timeout: a turn may legitimately run for minutes.
 */
const REQUEST_TIMEOUT_MS = 60000;

/** At most this much of the agent's stderr is quoted in an error. */
const STDERR_EXCERPT_CHARS = 500;

/** JSON-RPC "resource not found", which is how an agent reports an unknown session. */
const SESSION_NOT_FOUND = -32002;

export type AgentEvent =
  /** A `session/update` notification, delivered in arrival order. */
  | { type: "update"; params: acp.SessionNotification }
  /** The agent process has exited. */
  | { type: "exit" }
  | { type: "transport-closed"; error: UserError };

type Listener = (event: AgentEvent) => void;
type PermissionHandler = (
  request: acp.RequestPermissionRequest,
) => Promise<acp.RequestPermissionResponse>;

/**
 * One Agent Client Protocol connection to a stdio agent, from the handshake
 * until the agent process is gone. It owns the process: closing the connection
 * ends it.
 */
export class AgentConnection {
  static async open(
    spec: LaunchSpec,
    signal?: AbortSignal,
    requestPermission?: PermissionHandler,
  ): Promise<AgentConnection> {
    signal?.throwIfAborted();
    const connection = new AgentConnection(
      await launchProcess(spec),
      requestPermission,
    );
    const abort = () => void connection.close().catch(() => {});
    signal?.addEventListener("abort", abort, { once: true });
    try {
      signal?.throwIfAborted();
      await connection.initialize();
      signal?.throwIfAborted();
    } catch (error) {
      await connection.close();
      throw error;
    } finally {
      signal?.removeEventListener("abort", abort);
    }
    return connection;
  }

  /** What the agent said it can do. */
  capabilities: acp.AgentCapabilities = {};

  /** Whether the agent can reopen a session it was in before (`session/load`). */
  get supportsSessionRestore(): boolean {
    return this.capabilities.loadSession === true;
  }

  private readonly connection: acp.ClientConnection;
  private readonly listeners = new Set<Listener>();
  private exitCode: number | null = null;
  private closing: Promise<void> | null = null;

  private constructor(
    private readonly process: AgentProcess,
    requestPermission?: PermissionHandler,
  ) {
    this.connection = acp
      .client({ name: CLIENT_NAME })
      .onRequest(
        acp.methods.client.session.requestPermission,
        ({ params }) =>
          requestPermission?.(params) ?? { outcome: { outcome: "cancelled" } },
      )
      .onNotification(acp.methods.client.session.update, ({ params }) =>
        this.emit({ type: "update", params }),
      )
      .connect(acp.ndJsonStream(process.stdin, process.stdout));
    void process.exited.then((exitCode) => {
      this.exitCode = exitCode;
      this.emit({ type: "exit" });
    });
    void this.connection.closed.then(async () => {
      if (!this.closing) {
        const error = await this.transportError(new Error("ACP stream closed"));
        this.emit({ type: "transport-closed", error });
      }
    });
  }

  /** Subscribes to agent events. Returns a function that unsubscribes. */
  onEvent(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async newSession(
    cwd: string,
    mcpServers: McpServer[] = [],
  ): Promise<acp.NewSessionResponse> {
    return this.send(() =>
      withTimeout(
        this.connection.agent.request(acp.methods.agent.session.new, {
          cwd,
          mcpServers,
        }),
        REQUEST_TIMEOUT_MS,
        () => new UserError("acp-timeout", { operation: "session/new" }),
      ),
    );
  }

  /**
   * Reopens a session the agent was in before. The agent replays the session
   * as `update` events before this resolves.
   *
   * @returns null if the agent no longer has the session.
   */
  async loadSession(
    sessionId: string,
    cwd: string,
    mcpServers: McpServer[] = [],
  ): Promise<acp.LoadSessionResponse | null> {
    try {
      return await this.send(() =>
        withTimeout(
          this.connection.agent.request(acp.methods.agent.session.load, {
            sessionId,
            cwd,
            mcpServers,
          }),
          REQUEST_TIMEOUT_MS,
          () => new UserError("acp-timeout", { operation: "session/load" }),
        ),
      );
    } catch (error) {
      if (
        error instanceof acp.RequestError &&
        error.code === SESSION_NOT_FOUND
      ) {
        return null;
      }
      throw error;
    }
  }

  setConfigOption(
    sessionId: string,
    configId: string,
    value: string,
  ): Promise<acp.SetSessionConfigOptionResponse> {
    return this.send(() =>
      withTimeout(
        this.connection.agent.request(
          acp.methods.agent.session.setConfigOption,
          {
            sessionId,
            configId,
            value,
          },
        ),
        REQUEST_TIMEOUT_MS,
        () =>
          new UserError("acp-timeout", {
            operation: "session/set_config_option",
          }),
      ),
    );
  }

  /** Sends a prompt and resolves once the agent's turn has ended. */
  async prompt(
    sessionId: string,
    prompt: acp.ContentBlock[],
  ): Promise<acp.PromptResponse> {
    return this.send(() =>
      this.connection.agent.request(acp.methods.agent.session.prompt, {
        sessionId,
        prompt,
      }),
    );
  }

  /** Asks the agent to end the turn it is running. */
  async cancel(sessionId: string): Promise<void> {
    await this.send(() =>
      this.connection.agent.notify(acp.methods.agent.session.cancel, {
        sessionId,
      }),
    );
  }

  /** Closes the connection and ends the agent process. Safe to call more than once. */
  close(): Promise<void> {
    if (!this.closing) {
      this.connection.close();
      this.closing = this.process.terminate();
    }
    return this.closing;
  }

  private async initialize(): Promise<void> {
    let response: acp.InitializeResponse;
    try {
      response = await withTimeout(
        this.connection.agent.request(acp.methods.agent.initialize, {
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: {},
          clientInfo: { name: CLIENT_NAME, version },
        }),
        REQUEST_TIMEOUT_MS,
        () => new UserError("acp-handshake-timeout"),
      );
    } catch (error) {
      throw await this.transportError(error);
    }
    if (response.protocolVersion !== acp.PROTOCOL_VERSION) {
      throw new UserError("acp-protocol-unsupported", {
        agent: response.protocolVersion,
        client: acp.PROTOCOL_VERSION,
      });
    }
    this.capabilities = response.agentCapabilities ?? {};
  }

  /**
   * Runs a request, turning a lost transport into a `UserError`. Errors the
   * agent reported in the protocol are passed on with their code.
   */
  private async send<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof acp.RequestError || error instanceof UserError) {
        throw error;
      }
      throw await this.transportError(error);
    }
  }

  private async transportError(error: unknown): Promise<UserError> {
    if (error instanceof UserError) {
      return error;
    }
    if (error instanceof acp.RequestError) {
      return new UserError(
        "acp-request-failed",
        { message: redactor.redact(error.message) },
        { cause: error },
      );
    }
    // The transport closes a moment before the process is seen exiting.
    if (this.exitCode === null) {
      await Promise.race([this.process.exited, Zotero.Promise.delay(500)]);
    }
    if (this.exitCode !== null) {
      return this.exitError(error);
    }
    return new UserError(
      "acp-connection-lost",
      { detail: this.stderrExcerpt() },
      { cause: error },
    );
  }

  /** The failure to report when the agent process is gone. */
  exitError(cause?: unknown): UserError {
    return new UserError(
      "acp-agent-exited",
      { code: this.exitCode ?? "unknown", detail: this.stderrExcerpt() },
      { cause },
    );
  }

  private stderrExcerpt(): string {
    return redactor.redact(excerptOf(this.process.stderrTail()));
  }

  private emit(event: AgentEvent): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }
}

/** The end of the agent's stderr, with a marker when earlier lines were cut. */
function excerptOf(stderr: string): string {
  const lines = stderr.slice(-STDERR_EXCERPT_CHARS).split("\n");
  if (lines.length > 1 && lines[0].trim()) {
    lines[0] = `…${lines[0]}`;
  }
  return lines.join("\n").trim();
}
