import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("repeated builds replace generated output and retain actual source identities", () => {
  const fixture = mkdtempSync(join(tmpdir(), "docs-builder-"));
  try {
    cpSync(join(repository, "build.sh"), join(fixture, "build.sh"));
    cpSync(join(repository, "scripts"), join(fixture, "scripts"), {
      recursive: true,
    });
    const bin = join(fixture, "bin");
    mkdirSync(bin);
    const executable = (name, content) =>
      writeFileSync(join(bin, name), content, { mode: 0o755 });
    executable(
      "npm",
      `#!/bin/bash
set -eu
[[ "$*" == *"mystmd@1.7.1"* && "$*" != *" -g "* ]]
while [[ "$1" != "--prefix" ]]; do shift; done
mkdir -p "$2/node_modules/.bin"
cp "$FIXTURE_TOOLS/myst" "$2/node_modules/.bin/myst"
`,
    );
    executable(
      "git",
      `#!/bin/bash
set -eu
if [[ "$1" == "clone" ]]; then
  mkdir -p "\${@: -1}/docs"
elif [[ "$1" == "-C" && "$3" == "rev-parse" ]]; then
  printf '%s\\n' "$FIXTURE_COMMIT"
else
  exit 1
fi
`,
    );
    executable(
      "myst",
      `#!/bin/bash
set -eu
if [[ "$1" == "--version" ]]; then echo v1.7.1; exit; fi
if [[ "\${FAIL_SITE:-}" == "$BASE_URL" ]]; then exit 42; fi
mkdir -p _build/html
printf '<html><a href="%s/">%s</a></html>' "$BASE_URL" "$FIXTURE_LABEL" > _build/html/index.html
if [[ "$FIXTURE_LABEL" == "old" ]]; then
  echo '<html>obsolete</html>' > _build/html/obsolete.html
  echo 'old asset' > _build/html/obsolete.css
fi
`,
    );
    // Unrelated files outside the generated site remain untouched.
    mkdirSync(join(fixture, "dist"));
    writeFileSync(join(fixture, "dist", "user-note.txt"), "preserve");
    mkdirSync(join(fixture, "tmp_spm-calculator"));
    writeFileSync(
      join(fixture, "tmp_spm-calculator", "user-note.txt"),
      "preserve",
    );
    const run = (label, failSite = "") =>
      spawnSync("bash", ["build.sh"], {
        cwd: fixture,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          FIXTURE_TOOLS: bin,
          FIXTURE_LABEL: label,
          FIXTURE_COMMIT: (label === "old" ? "1" : "2").repeat(40),
          FAIL_SITE: failSite,
        },
      });
    const old = run("old");
    assert.equal(old.status, 0, old.stdout + old.stderr);
    const manifestPath = join(fixture, "dist", "source-manifest.json");
    const oldManifest = readFileSync(manifestPath, "utf8");
    const failed = run("new", "/microdf");
    assert.notEqual(failed.status, 0);
    assert.equal(readFileSync(manifestPath, "utf8"), oldManifest);
    assert.match(
      readFileSync(join(fixture, "dist/spm-calculator/index.html"), "utf8"),
      />old</,
    );
    const fresh = run("new");
    assert.equal(fresh.status, 0, fresh.stdout + fresh.stderr);
    for (const site of ["spm-calculator", "microdf", "policyengine-uk-data"]) {
      const output = join(fixture, "dist", site);
      assert.match(readFileSync(join(output, "index.html"), "utf8"), />new</);
      assert.ok(!existsSync(join(output, "html")), "output must not nest");
      assert.ok(
        !existsSync(join(output, "obsolete.html")),
        "stale page removed",
      );
      assert.ok(
        !existsSync(join(output, "obsolete.css")),
        "stale asset removed",
      );
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert.equal(manifest.toolchain.myst, "v1.7.1");
    assert.equal(manifest.toolchain.node, process.version);
    assert.equal(manifest.sites.length, 3);
    assert.ok(manifest.sites.every((site) => site.commit === "2".repeat(40)));
    for (const [file, hash] of Object.entries(
      manifest.aggregator_source_sha256,
    )) {
      assert.equal(
        hash,
        createHash("sha256")
          .update(readFileSync(join(fixture, file)))
          .digest("hex"),
      );
    }
    assert.equal(
      readFileSync(join(fixture, "dist/user-note.txt"), "utf8"),
      "preserve",
    );
    assert.equal(
      readFileSync(join(fixture, "tmp_spm-calculator/user-note.txt"), "utf8"),
      "preserve",
    );
    assert.ok(
      !readdirSync(fixture).some((name) => name.startsWith(".docs-build.")),
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
