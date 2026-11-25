import { assert } from "chai";
import {
  formatArgs,
  parseArgs,
  parseProfile,
  ProfileError,
} from "../src/agents/profile";
import { Redactor, secretValues } from "../src/agents/secrets";
import {
  getDefaultProfile,
  loadProfiles,
  saveProfiles,
  setDefaultProfileId,
} from "../src/agents/store";
import { makeAgent, reset, use } from "./helpers";

describe("an agent profile", () => {
  beforeEach(reset);

  describe("arguments", () => {
    it("split on whitespace, with quotes keeping words together", () => {
      assert.deepEqual(
        parseArgs(`serve --model "two words" 'and three words here'`),
        ["serve", "--model", "two words", "and three words here"],
      );
    });

    it("reach the agent as typed, without expansion", () => {
      assert.deepEqual(parseArgs("serve ~ $HOME *.pdf"), [
        "serve",
        "~",
        "$HOME",
        "*.pdf",
      ]);
    });

    it("are escaped with a backslash", () => {
      // Outside single quotes, a backslash escapes the next character.
      assert.deepEqual(
        parseArgs(String.raw`serve a\ b "say \"hi\"" 'it'\''s'`),
        ["serve", "a b", 'say "hi"', "it's"],
      );
    });

    it("keep an empty argument", () => {
      assert.deepEqual(parseArgs("serve '' x"), ["serve", "", "x"]);
    });

    it("are refused when a quote is left open", () => {
      assert.throws(() => parseArgs('serve "open'), ProfileError);
      assert.throws(() => parseArgs("serve 'open"), ProfileError);
    });

    it("are refused when a backslash is left hanging", () => {
      assert.throws(() => parseArgs("serve x \\"), ProfileError);
    });

    it("read back the same after being written as a command line", () => {
      const args = [
        "serve",
        "two words",
        'say "hi"',
        "it's",
        "a\\b",
        "",
        "--name=va lue",
      ];
      assert.deepEqual(parseArgs(formatArgs(args)), args);
    });
  });

  describe("validation", () => {
    it("fills in an id and trims what the user typed", () => {
      const profile = parseProfile({
        name: "  Claude  ",
        command: " codex acp ",
        args: ["acp"],
        env: { A: "1" },
        cwd: " /tmp ",
      });
      assert.match(profile.id, /^[a-z0-9]{8}$/i);
      assert.equal(profile.name, "Claude");
      assert.equal(profile.command, "codex acp");
      assert.deepEqual(profile.cwd, "/tmp");
    });

    it("names the field that is wrong", () => {
      const valid = { name: "A", command: "x", args: [], env: {}, cwd: "" };
      assert.equal(
        fieldOf(() => parseProfile({ ...valid, name: "" })),
        "name",
      );
      assert.equal(
        fieldOf(() => parseProfile({ ...valid, command: " " })),
        "command",
      );
      assert.equal(
        fieldOf(() => parseProfile({ ...valid, args: ["a\0b"] })),
        "args",
      );
      for (const env of [{ "1BAD": "x" }, { "A-B": "x" }, { A: 1 }]) {
        assert.equal(
          fieldOf(() => parseProfile({ ...valid, env })),
          "env",
        );
      }
      assert.equal(
        fieldOf(() => parseProfile(valid)),
        "",
      );
    });
  });

  describe("saved in the preferences", () => {
    it("reads the agents and the default selection back from preferences", async () => {
      const agent = await makeAgent("saved");
      const profile = agent.profile(["--note", "two words"]);
      use(profile);
      const other = agent.profile([], { id: "other", name: "Other" });

      saveProfiles([profile, other]);
      setDefaultProfileId("other");

      assert.deepEqual(loadProfiles(), [profile, other]);
      assert.equal(getDefaultProfile(loadProfiles())?.id, "other");
    });

    it("falls back to the first agent when the default is gone", async () => {
      const agent = await makeAgent("fallback");
      saveProfiles([agent.profile()]);
      setDefaultProfileId("no-longer-there");
      assert.equal(getDefaultProfile(loadProfiles())?.id, "fixture");
    });
  });

  describe("credentials", () => {
    it("are every environment value and every argument that passes one", () => {
      assert.deepEqual(
        secretValues({
          args: [
            "serve",
            "--api-key=sk-123456",
            "--token",
            "abc12345",
            "--model",
            "x",
            "-p",
            "password1",
          ],
          env: { API_KEY: "k", TOKEN: "t" },
        }),
        ["k", "t", "sk-123456", "abc12345"],
      );
    });

    it("are masked wherever they appear", () => {
      const redactor = new Redactor();
      redactor.setSecrets(["sk-123456", "abc12345"]);
      assert.equal(
        redactor.redact(
          "failed with api key sk-123456 for abc12345 (sk-123456)",
        ),
        "failed with api key •••••• for •••••• (••••••)",
      );
    });

    it("masks short values without replacing unrelated text", () => {
      const redactor = new Redactor();
      redactor.setSecrets(["1", "no", "true", "false"]);
      assert.equal(
        redactor.redact("the agent returned true after 1 retry"),
        "the agent returned •••••• after •••••• retry",
      );
    });

    it("masks values escaped in serialized diagnostics", () => {
      const redactor = new Redactor();
      const secret = 'a"b\\.$';
      redactor.setSecrets([secret]);
      assert.equal(
        redactor.redact(JSON.stringify({ secret })),
        '{"secret":"••••••"}',
      );
    });

    it("retains credentials for a running agent after settings are edited", () => {
      const redactor = new Redactor();
      const release = redactor.retainSecrets(["old-key"]);
      redactor.setSecrets(["new-key"]);
      assert.equal(redactor.redact("old-key new-key"), "•••••• ••••••");
      release();
      assert.equal(redactor.redact("old-key new-key"), "old-key ••••••");
    });

    it("mask the longer value whole when one contains another", () => {
      const redactor = new Redactor();
      redactor.setSecrets(["sk-123456", "sk-123456789"]);
      assert.equal(redactor.redact("key sk-123456789"), "key ••••••");
    });
  });
});

/** The field a `ProfileError` names, or "" when nothing was thrown. */
function fieldOf(run: () => unknown): string {
  try {
    run();
    return "";
  } catch (error) {
    return error instanceof ProfileError
      ? error.field
      : `unexpected error: ${error}`;
  }
}
