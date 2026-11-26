import { Bot, Sparkles } from "lucide";
import { config } from "../../../package.json";
import type { AgentProfile } from "../../agents/profile";
import { h, lucideIcon } from "./dom";

export type Provider =
  "claude" | "codex" | "opencode" | "antigravity" | "auto" | "custom";

export function agentProvider(agent?: AgentProfile): Provider {
  const identity = `${agent?.id ?? ""} ${agent?.name ?? ""}`.toLowerCase();
  if (identity.includes("claude")) return "claude";
  if (identity.includes("codex")) return "codex";
  if (identity.includes("opencode")) return "opencode";
  if (identity.includes("antigravity")) return "antigravity";
  return "custom";
}

export function agentIcon(doc: Document, agent: AgentProfile, size: number) {
  return providerIcon(doc, agentProvider(agent), size);
}

export function providerIcon(doc: Document, provider: Provider, size: number) {
  if (provider === "auto" || provider === "custom")
    return lucideIcon(doc, provider === "auto" ? Sparkles : Bot, size);

  // Claude Code product favicon: https://claude.com/product/claude-code
  // Codex extension icon: https://marketplace.visualstudio.com/items?itemName=OpenAI.chatgpt
  // OpenCode transparent logos: https://opencode.ai/brand
  // Antigravity product icon: https://antigravity.google/favicon.svg
  const base = `chrome://${config.addonRef}/content/icons/agents/`;
  const file =
    provider === "opencode"
      ? "opencode-on-light.svg"
      : provider === "codex"
        ? "codex.png"
        : `${provider}.svg`;
  const image = h(doc, "img", {
    src: base + file,
    alt: "",
    width: size,
    height: size,
    class: "sap-composer-provider-image",
  });
  return provider === "opencode"
    ? h(
        doc,
        "picture",
        {},
        h(doc, "source", {
          media: "(prefers-color-scheme: dark)",
          srcset: base + "opencode-on-dark.svg",
        }),
        image,
      )
    : image;
}
