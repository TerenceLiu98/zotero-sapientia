import type * as acp from "@agentclientprotocol/sdk";

/**
 * Byte streams to and from an agent, as the SDK's transport types them. They
 * are taken from the SDK because the sandbox's own typings name Gecko's
 * streams, which carry no element type.
 */
export type ToAgent = Parameters<typeof acp.ndJsonStream>[0];
export type FromAgent = Parameters<typeof acp.ndJsonStream>[1];
