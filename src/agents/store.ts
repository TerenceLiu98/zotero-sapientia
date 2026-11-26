import { config } from "../../package.json";
import { logError } from "../utils/log";
import { parseProfile, type AgentProfile } from "./profile";

const PREFS = config.prefsPrefix;

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
