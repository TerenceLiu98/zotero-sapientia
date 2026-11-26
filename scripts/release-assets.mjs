import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { URL } from "node:url";

const [xpi, destination] = process.argv.slice(2);
const repository = process.env.GITHUB_REPOSITORY;
if (!xpi || !destination || !repository) {
  throw new Error(
    "Usage: GITHUB_REPOSITORY=owner/repo node scripts/release-assets.mjs <XPI> <output-directory>",
  );
}

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const version = pkg.zoteroVersion ?? pkg.version;
const prerelease = pkg.version.includes("-");
const downloadBase = `https://github.com/${repository}/releases/download`;
const addonID = pkg.config.addonID;
const updateURL = `${downloadBase}/release/${prerelease ? "update-beta.json" : "update.json"}`;

if (
  process.env.GITHUB_REF_TYPE === "tag" &&
  process.env.GITHUB_REF_NAME !== pkg.releaseTag
) {
  throw new Error("The Git tag must match package.json releaseTag");
}

execFileSync("unzip", ["-tqq", xpi]);
const manifest = JSON.parse(
  execFileSync("unzip", ["-p", xpi, "manifest.json"], { encoding: "utf8" }),
);
const zotero = manifest.applications?.zotero;
if (
  manifest.version !== version ||
  manifest.name !== pkg.config.addonName ||
  zotero?.id !== addonID ||
  zotero.update_url !== updateURL
) {
  throw new Error(
    `Unexpected XPI manifest for ${pkg.releaseTag}: expected ${pkg.config.addonName} ${version}, ID ${addonID}, and feed ${updateURL}`,
  );
}

const bytes = readFileSync(xpi);
const digest = (algorithm) => createHash(algorithm).update(bytes).digest("hex");
const feed = {
  addons: {
    [addonID]: {
      updates: [
        {
          version,
          update_link: `${downloadBase}/${pkg.releaseTag}/sapientia.xpi`,
          update_hash: `sha512:${digest("sha512")}`,
          applications: {
            zotero: {
              strict_min_version: zotero.strict_min_version,
              strict_max_version: zotero.strict_max_version,
            },
          },
        },
      ],
    },
  },
};

mkdirSync(destination, { recursive: true });
writeFileSync(join(destination, "sapientia.xpi"), bytes);
writeFileSync(
  join(destination, "sapientia.xpi.sha256"),
  `${digest("sha256")}  sapientia.xpi\n`,
);
const name = prerelease ? "update-beta.json" : "update.json";
writeFileSync(join(destination, name), `${JSON.stringify(feed, null, 2)}\n`);
