import { config } from "../../package.json";
import { logError } from "../utils/log";
import { parseProfile, type AgentProfile } from "./profile";

const PREFS = config.prefsPrefix;
export const LIBRARY_DEFAULT_MODEL_PREF = `${PREFS}.libraryDefaultModel`;

export interface LibraryDefaultModel {
  profileId: string;
  modelId: string;
}

export function getLibraryDefaultModel(): LibraryDefaultModel | null {
  const raw = Zotero.Prefs.get(LIBRARY_DEFAULT_MODEL_PREF, true);
  if (typeof raw !== "string" || !raw) return null;
  try {
    const value = JSON.parse(raw);
    if (
      typeof value?.profileId === "string" &&
      value.profileId &&
      typeof value.modelId === "string" &&
      value.modelId
    )
      return { profileId: value.profileId, modelId: value.modelId };
  } catch (error) {
    logError("The Library Agent default model could not be read", error);
  }
  return null;
}

export function setLibraryDefaultModel(
  value: LibraryDefaultModel | null,
): void {
  Zotero.Prefs.set(
    LIBRARY_DEFAULT_MODEL_PREF,
    value ? JSON.stringify(value) : "",
    true,
  );
}

/** Reads the saved agents. A list that cannot be read is treated as empty. */
export function loadProfiles(): AgentProfile[] {
  const raw = Zotero.Prefs.get(`${PREFS}.profiles`, true);
  if (typeof raw !== "string" || !raw) {
    return [];
  }
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) {
      throw new Error("profiles preference is not an array");
    }
    return list.map(parseProfile);
  } catch (error) {
    logError("Saved agents could not be read", error);
    return [];
  }
}

export function saveProfiles(profiles: AgentProfile[]): void {
  Zotero.Prefs.set(`${PREFS}.profiles`, JSON.stringify(profiles), true);
}

export function mergeProfiles(
  saved: readonly AgentProfile[],
  detected: readonly AgentProfile[],
): AgentProfile[] {
  const profiles = new Map(saved.map((profile) => [profile.id, profile]));
  for (const profile of detected) {
    if (!profiles.has(profile.id)) profiles.set(profile.id, profile);
  }
  return [...profiles.values()];
}

/** The agent a new conversation talks to. */
export function getDefaultProfileId(): string {
  return (Zotero.Prefs.get(`${PREFS}.defaultProfileId`, true) as string) ?? "";
}

export function setDefaultProfileId(id: string): void {
  Zotero.Prefs.set(`${PREFS}.defaultProfileId`, id, true);
}

export function getDefaultProfile(
  profiles = loadProfiles(),
): AgentProfile | undefined {
  const id = getDefaultProfileId();
  return profiles.find((profile) => profile.id === id) ?? profiles[0];
}
