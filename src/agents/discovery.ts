import { subprocess } from "../acp/subprocess";
import { baseEnvironment, defaultWorkspace } from "./launch";
import type { AgentProfile } from "./profile";

const BRIDGED = [
  {
    id: "detected-claude",
    name: "Claude Code",
    cli: "claude",
    adapter: "claude-agent-acp",
    pkg: "@agentclientprotocol/claude-agent-acp@0.112.0",
    executableVar: "CLAUDE_CODE_EXECUTABLE",
  },
  {
    id: "detected-codex",
    name: "Codex",
    cli: "codex",
    adapter: "codex-acp",
    pkg: "@agentclientprotocol/codex-acp@2.12.0",
    executableVar: "CODEX_PATH",
  },
] as const;

let discovery: Promise<AgentProfile[]> | undefined;

/** Finds local CLI installations once per plugin lifetime without running them. */
export function discoverAgentProfiles(): Promise<AgentProfile[]> {
  discovery ??= findProfiles();
  return discovery;
}

async function findProfiles(): Promise<AgentProfile[]> {
  const env = await baseEnvironment();
  const searchEnv = await withLocalPaths(env);
  const pathEnv: Record<string, string> =
    searchEnv.PATH === env.PATH ? {} : { PATH: searchEnv.PATH };
  const find = (command: string) => findExecutable(command, searchEnv);
  const npm = find("npx");
  const adapterCache = PathUtils.join(defaultWorkspace(), ".npm-cache");
  const profiles = await Promise.all(
    BRIDGED.map(async ({ id, name, cli, adapter, pkg, executableVar }) => {
      const executable = await find(cli);
      if (!executable) return null;
      const installedAdapter = await find(adapter);
      return {
        id,
        name,
        command: installedAdapter ?? (await npm) ?? "npx",
        args: installedAdapter
          ? []
          : [
              `--cache=${adapterCache}`,
              "--yes",
              `--package=${pkg}`,
              "--",
              adapter,
            ],
        env: { ...pathEnv, [executableVar]: executable },
        cwd: "",
      };
    }),
  );
  const nativeProfiles = await Promise.all(
    [
      {
        id: "detected-opencode",
        name: "OpenCode",
        cli: "opencode",
        args: ["acp"],
      },
      {
        id: "detected-antigravity",
        name: "Antigravity",
        cli: "agy",
        args: ["acp", "--process-per-session"],
      },
    ].map(async ({ id, name, cli, args }) => {
      const command = await find(cli);
      return command
        ? { id, name, command, args, env: pathEnv, cwd: "" }
        : null;
    }),
  );
  return [...profiles, ...nativeProfiles].filter((profile) => profile !== null);
}

async function findExecutable(
  command: string,
  env: Record<string, string>,
): Promise<string | null> {
  try {
    return await subprocess().pathSearch(command, env);
  } catch {
    return null;
  }
}

async function withLocalPaths(
  env: Record<string, string>,
): Promise<Record<string, string>> {
  if (Zotero.isWin || !env.HOME) return env;

  const home = env.HOME;
  const paths = [
    env.PATH,
    PathUtils.join(home, ".local", "bin"),
    PathUtils.join(home, ".opencode", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  // GUI launches can miss Node installed by a version manager or unpacked locally.
  if (
    !(await findExecutable("npx", {
      ...env,
      PATH: paths.filter(Boolean).join(":"),
    }))
  ) {
    const versionDirs = await Promise.all(
      [
        PathUtils.join(home, ".nvm", "versions", "node"),
        PathUtils.join(home, ".local", "lib", "nodejs"),
      ].map(async (root) => {
        const children = await IOUtils.getChildren(root).catch(() => []);
        return children
          .filter((path) =>
            /^(?:node-)?v\d+\.\d+\.\d+$/.test(PathUtils.filename(path)),
          )
          .sort((a, b) => b.localeCompare(a, "en", { numeric: true }))
          .map((path) => PathUtils.join(path, "bin"));
      }),
    );
    paths.push(
      PathUtils.join(home, ".volta", "bin"),
      PathUtils.join(home, ".local", "share", "mise", "shims"),
      ...versionDirs.flat(),
    );
  }
  return { ...env, PATH: [...new Set(paths.filter(Boolean))].join(":") };
}
