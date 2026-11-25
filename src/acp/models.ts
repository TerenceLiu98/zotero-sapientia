import type { SessionConfigOption } from "@agentclientprotocol/sdk";

export interface SessionModels {
  configId: string;
  currentId: string;
  options: { id: string; name: string }[];
}

export function modelsFromConfig(
  configOptions: SessionConfigOption[] | null | undefined,
): SessionModels | null {
  const model = configOptions?.find(
    (option) => option.type === "select" && option.category === "model",
  );
  if (model?.type !== "select") return null;

  const options = model.options
    .flatMap((option) => ("group" in option ? option.options : [option]))
    .map(({ value, name }) => ({ id: value, name }));
  return options.length
    ? { configId: model.id, currentId: model.currentValue, options }
    : null;
}
