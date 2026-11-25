import type { McpServer } from "@agentclientprotocol/sdk";
import { z } from "zod";
import { version } from "../../package.json";
import { redactor } from "../utils/log";
import type { WriteHandoff } from "../writes/request";
import { callPaperTool, listPaperTools, type ResolveTurn } from "./paper-tools";

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const MAX_REQUEST_BYTES = 64 * 1024;
const endpoint = "/mcp";
const rpcMessage = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});
const classes = Components.classes as unknown as Record<
  string,
  {
    createInstance<T>(iid: nsJSIID<T>): T;
    getService<T>(iid: nsJSIID<T>): T;
  }
>;

function invalid(code: number, message: string) {
  return { error: { code, message } };
}

async function answerRpc(
  message: z.infer<typeof rpcMessage>,
  active: ResolveTurn,
  handoff: WriteHandoff,
) {
  const { method, params } = message;
  switch (method) {
    case "initialize": {
      const requested = params?.protocolVersion;
      const protocolVersion =
        typeof requested === "string" && PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : PROTOCOL_VERSIONS[0];
      return {
        result: {
          protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "zotero-sapientia", version },
        },
      };
    }
    case "ping":
      return { result: {} };
    case "tools/list":
      return { result: { tools: listPaperTools() } };
    case "tools/call":
      return {
        result: await callPaperTool(
          params?.name,
          params?.arguments,
          active,
          handoff,
        ),
      };
    default:
      return invalid(-32601, "Method not found.");
  }
}

function writeJson(response: nsIHttpResponse, value: object) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  const stream = classes[
    "@mozilla.org/intl/converter-output-stream;1"
  ].createInstance(Components.interfaces.nsIConverterOutputStream);
  stream.init(response.bodyOutputStream, "UTF-8");
  stream.writeString(JSON.stringify(value));
  stream.flush();
}

/** A stateless MCP endpoint whose credentials belong to one ACP connection. */
export function startPaperTools(
  active: ResolveTurn,
  handoff: WriteHandoff,
): {
  server: McpServer;
  close(): Promise<void>;
} {
  const { HttpServer } = ChromeUtils.importESModule(
    "chrome://remote/content/server/httpd.sys.mjs",
  );
  const { NetUtil } = ChromeUtils.importESModule(
    "resource://gre/modules/NetUtil.sys.mjs",
  );
  const random = classes["@mozilla.org/security/random-generator;1"].getService(
    Components.interfaces.nsIRandomGenerator,
  );
  const token = Array.from(random.generateRandomBytes(32), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const authorization = `Bearer ${token}`;
  const http: nsIHttpServer = new HttpServer();
  let closed: Promise<void> | undefined;

  async function handle(request: nsIHttpRequest, response: nsIHttpResponse) {
    const status = (code: number, text: string) =>
      response.setStatusLine(request.httpVersion, code, text);
    response.setHeader("Cache-Control", "no-store");
    if (request.hasHeader("Origin") && request.getHeader("Origin") !== origin) {
      status(403, "Forbidden");
      return;
    }
    if (
      closed ||
      !request.hasHeader("Authorization") ||
      request.getHeader("Authorization") !== authorization
    ) {
      status(401, "Unauthorized");
      return;
    }
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      status(405, "Method Not Allowed");
      return;
    }
    if (
      request.hasHeader("MCP-Protocol-Version") &&
      !PROTOCOL_VERSIONS.includes(request.getHeader("MCP-Protocol-Version"))
    ) {
      status(400, "Unsupported MCP version");
      return;
    }
    const input = request.bodyInputStream;
    const length = input.available();
    if (length > MAX_REQUEST_BYTES) {
      status(413, "Content Too Large");
      return;
    }

    let data: unknown;
    try {
      data = JSON.parse(
        NetUtil.readInputStreamToString(input, length, { charset: "UTF-8" }),
      );
    } catch {
      status(400, "Bad Request");
      writeJson(response, {
        jsonrpc: "2.0",
        id: null,
        ...invalid(-32700, "Parse error."),
      });
      return;
    }
    const parsed = rpcMessage.safeParse(data);
    if (!parsed.success) {
      status(400, "Bad Request");
      writeJson(response, {
        jsonrpc: "2.0",
        id: null,
        ...invalid(-32600, "Invalid request."),
      });
      return;
    }
    if (parsed.data.id === undefined) {
      status(202, "Accepted");
      return;
    }
    const result = await answerRpc(
      parsed.data,
      (id) => (closed ? undefined : active(id)),
      handoff,
    );
    writeJson(response, { jsonrpc: "2.0", id: parsed.data.id, ...result });
  }

  http.registerPathHandler(endpoint, (request, response) => {
    response.processAsync();
    void handle(request, response)
      .catch(() => {
        response.setStatusLine(
          request.httpVersion,
          500,
          "Internal Server Error",
        );
      })
      .finally(() => response.finish());
  });
  http.start(-1);
  const origin = `http://127.0.0.1:${http.identity.primaryPort}`;
  const releaseSecret = redactor.retainSecrets([token]);

  return {
    server: {
      type: "http",
      name: "zotero-sapientia",
      url: `${origin}${endpoint}`,
      headers: [{ name: "Authorization", value: authorization }],
    },
    close() {
      closed ??= new Promise<void>((resolve) => http.stop(resolve)).finally(
        releaseSecret,
      );
      return closed;
    },
  };
}
