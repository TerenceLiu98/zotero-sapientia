import { config } from "../../package.json";

export const READ_MATERIALS = [
  "metadata",
  "pdf",
  "selection",
  "annotations",
  "notes",
  "tags",
] as const;
export type ReadMaterial = (typeof READ_MATERIALS)[number];

const pref = `${config.prefsPrefix}.readScope`;

export function readAllowed(material: ReadMaterial): boolean {
  const scope = Zotero.Prefs.get(pref, true);
  return typeof scope !== "string" || !scope.split(",").includes(material);
}

export function setReadAllowed(material: ReadMaterial, allowed: boolean): void {
  const blocked = READ_MATERIALS.filter((entry) =>
    entry === material ? !allowed : !readAllowed(entry),
  );
  Zotero.Prefs.set(pref, blocked.join(","), true);
}
