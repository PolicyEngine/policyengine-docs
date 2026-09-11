import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";

const sha256 = (content) => createHash("sha256").update(content).digest("hex");

// Vercel may re-serialize configuration before the build. Object-key order and
// whitespace do not change its meaning; array order and actual values do.
function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])]),
    );
  }
  return value;
}

function templateIdentity(docs) {
  function templateRoots(directory) {
    if (existsSync(join(directory, "template.yml"))) return [directory];
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => templateRoots(join(directory, entry.name)));
  }
  const roots = templateRoots(join(docs, "_build/templates/site"));
  assert.equal(
    roots.length,
    1,
    `${docs}: expected one downloaded site template`,
  );
  const [root] = roots;
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile())
        files.push([relative(root, path), "file", sha256(readFileSync(path))]);
      // Bind the link itself without following it outside the downloaded tree.
      else if (entry.isSymbolicLink())
        files.push([relative(root, path), "symlink", readlinkSync(path)]);
      else assert.fail(`${path}: unsupported template entry`);
    }
  }
  visit(root);
  files.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    path: relative(docs, root),
    manifest_sha256: sha256(readFileSync(join(root, "template.yml"))),
    tree_sha256: sha256(JSON.stringify(files)),
    file_count: files.length,
    identity_format: "sha256-sorted-path-kind-content-v1",
  };
}

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
      template: templateIdentity(join(workspace, "sources", name, docsPath)),
    };
  });
const files = [
  "build.sh",
  "scripts/check-site-links.mjs",
  "scripts/write-source-manifest.mjs",
];
const sourceHashes = Object.fromEntries(
  files.map((file) => [file, sha256(readFileSync(join(repository, file)))]),
);
writeFileSync(
  join(workspace, "output", "source-manifest.json"),
  `${JSON.stringify(
    {
      schema_version: 2,
      built_at: new Date().toISOString(),
      toolchain: { myst: mystVersion, node: process.version },
      aggregator_source_sha256: sourceHashes,
      configuration_hash_format: "sha256-canonical-json-sorted-keys-v1",
      configuration_sha256: {
        "vercel.json": sha256(
          JSON.stringify(
            canonicalJson(
              JSON.parse(readFileSync(join(repository, "vercel.json"), "utf8")),
            ),
          ),
        ),
      },
      sites,
    },
    null,
    2,
  )}\n`,
);
