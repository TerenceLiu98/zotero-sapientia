import type { SessionConfigOption } from "@agentclientprotocol/sdk";

export interface SessionChoices {
  configId: string;
  currentId: string;
  options: { id: string; name: string }[];
}

export function sessionChoicesFromConfig(
  configOptions: SessionConfigOption[] | null | undefined,
) {
  return {
    models: choices(configOptions, "model"),
    reasoning: choices(configOptions, "thought_level"),
  };
}

function choices(
  configOptions: SessionConfigOption[] | null | undefined,
  category: "model" | "thought_level",
): SessionChoices | null {
  const selector = configOptions?.find(
    (option) => option.type === "select" && option.category === category,
  );
  if (selector?.type !== "select") return null;

  const options = selector.options
    .flatMap((option) => ("group" in option ? option.options : [option]))
    .map(({ value, name }) => ({ id: value, name }));
  return options.length
    ? { configId: selector.id, currentId: selector.currentValue, options }
    : null;
}
