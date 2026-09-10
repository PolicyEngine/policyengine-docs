import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [repository, workspace, mystVersion] = process.argv.slice(2);
assert.equal(
  mystVersion,
  "v1.7.1",
  "the installed MyST version is the pinned version",
);
const sites = readFileSync(join(workspace, "sources.tsv"), "utf8")
  .trim()
  .split("\n")
  .map((line) => {
    const [repo, docsPath, name, commit] = line.split("\t");
    assert.match(commit, /^[0-9a-f]{40}$/, `${repo}: invalid cloned commit`);
    return {
      repository: repo,
      docs_path: docsPath,
      mount: `/${name}/`,
      commit,
    };
  });
const files = [
  "build.sh",
  "vercel.json",
  "scripts/check-spm-links.mjs",
  "scripts/write-source-manifest.mjs",
];
const sourceHashes = Object.fromEntries(
  files.map((file) => [
    file,
    createHash("sha256")
      .update(readFileSync(join(repository, file)))
      .digest("hex"),
  ]),
);
writeFileSync(
  join(workspace, "output", "source-manifest.json"),
  `${JSON.stringify(
    {
      schema_version: 1,
      built_at: new Date().toISOString(),
      toolchain: { myst: mystVersion, node: process.version },
      aggregator_source_sha256: sourceHashes,
      sites,
    },
    null,
    2,
  )}\n`,
);
