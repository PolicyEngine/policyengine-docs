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
    cpSync(join(repository, "vercel.json"), join(fixture, "vercel.json"));
    const vercelConfig = JSON.parse(
      readFileSync(join(fixture, "vercel.json"), "utf8"),
    );
    assert.equal(
      vercelConfig.installCommand,
      "",
      "Vercel must skip the obsolete dashboard installer",
    );
    assert.equal(vercelConfig.buildCommand, "bash build.sh");
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
mkdir -p _build/templates/site/myst/book-theme
echo 'kind: site' > _build/templates/site/myst/book-theme/template.yml
echo 'template renderer' > _build/templates/site/myst/book-theme/renderer.js
printf '<html><a href="%s/">%s</a></html>' "$BASE_URL" "$FIXTURE_LABEL" > _build/html/index.html
if [[ "\${CORRUPT_SITE:-}" == "$BASE_URL" ]]; then
  echo '<html><a href="/missing.html">broken mount</a></html>' > _build/html/index.html
fi
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
    const run = (label, failSite = "", corruptSite = "") =>
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
          CORRUPT_SITE: corruptSite,
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
    for (const mount of [
      "/spm-calculator",
      "/microdf",
      "/policyengine-uk-data",
    ]) {
      const brokenLinks = run("new", "", mount);
      assert.notEqual(brokenLinks.status, 0, `${mount} must be checked`);
      assert.equal(readFileSync(manifestPath, "utf8"), oldManifest);
      assert.match(
        readFileSync(join(fixture, "dist", mount, "index.html"), "utf8"),
        />old</,
      );
    }
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
    assert.ok(
      manifest.configuration_sha256["vercel.json"],
      "the manifest must bind the hosted build configuration",
    );
    assert.equal(manifest.sites.length, 3);
    assert.ok(manifest.sites.every((site) => site.commit === "2".repeat(40)));
    assert.ok(manifest.sites.every((site) => site.template.file_count === 2));
    assert.ok(
      manifest.sites.every((site) =>
        /^[0-9a-f]{64}$/.test(site.template.tree_sha256),
      ),
    );
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

test("configuration fingerprints ignore serialization and detect semantic changes", () => {
  const fixture = mkdtempSync(join(tmpdir(), "docs-manifest-"));
  try {
    const workspace = join(fixture, "workspace");
    const template = join(
      workspace,
      "sources/spm-calculator/docs/_build/templates/site/myst/book-theme",
    );
    mkdirSync(template, { recursive: true });
    mkdirSync(join(workspace, "output"));
    writeFileSync(join(template, "template.yml"), "kind: site\n");
    writeFileSync(join(template, "renderer.js"), "old renderer\n");
    writeFileSync(
      join(workspace, "sources.tsv"),
      `PolicyEngine/spm-calculator\tdocs\tspm-calculator\t${"1".repeat(40)}\n`,
    );
    cpSync(join(repository, "build.sh"), join(fixture, "build.sh"));
    cpSync(join(repository, "scripts"), join(fixture, "scripts"), {
      recursive: true,
    });
    const configuration = {
      framework: null,
      outputDirectory: "dist",
      nested: { b: 2, a: 1 },
    };
    const run = (content) => {
      writeFileSync(join(fixture, "vercel.json"), content);
      const result = spawnSync(
        process.execPath,
        [
          join(repository, "scripts/write-source-manifest.mjs"),
          fixture,
          workspace,
          "v1.7.1",
        ],
        { encoding: "utf8" },
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return JSON.parse(
        readFileSync(join(workspace, "output/source-manifest.json"), "utf8"),
      );
    };
    const pretty = run(JSON.stringify(configuration, null, 2) + "\n");
    const compact = run(JSON.stringify(configuration));
    const reordered = run(
      JSON.stringify({
        nested: { a: 1, b: 2 },
        outputDirectory: "dist",
        framework: null,
      }),
    );
    assert.ok(pretty.configuration_sha256?.["vercel.json"]);
    assert.equal(
      pretty.configuration_sha256["vercel.json"],
      compact.configuration_sha256["vercel.json"],
    );
    assert.equal(
      pretty.configuration_sha256["vercel.json"],
      reordered.configuration_sha256["vercel.json"],
    );
    const changed = run(
      JSON.stringify({ ...configuration, outputDirectory: "other" }),
    );
    assert.notEqual(
      pretty.configuration_sha256["vercel.json"],
      changed.configuration_sha256["vercel.json"],
    );
    // Template code can change without a CLI, docs commit, or template.yml change.
    writeFileSync(join(template, "renderer.js"), "new renderer\n");
    const changedTheme = run(JSON.stringify(configuration));
    assert.equal(
      pretty.sites[0].template.manifest_sha256,
      changedTheme.sites[0].template.manifest_sha256,
    );
    assert.notEqual(
      pretty.sites[0].template.tree_sha256,
      changedTheme.sites[0].template.tree_sha256,
    );
    rmSync(join(template, "template.yml"));
    const missing = spawnSync(
      process.execPath,
      [
        join(repository, "scripts/write-source-manifest.mjs"),
        fixture,
        workspace,
        "v1.7.1",
      ],
      { encoding: "utf8" },
    );
    assert.notEqual(
      missing.status,
      0,
      "missing template identity cannot be accepted",
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

for (const name of ["spm-calculator", "microdf", "policyengine-uk-data"]) {
  test(`${name} validates local links and rejects empty, escaping, or missing targets`, () => {
    const fixture = mkdtempSync(join(tmpdir(), "docs-links-"));
    try {
      const names = ["spm-calculator", "microdf", "policyengine-uk-data"];
      writeFileSync(
        join(fixture, "index.html"),
        names.map((site) => `<a href="/${site}/">${site}</a>`).join(""),
      );
      for (const site of names) {
        mkdirSync(join(fixture, site));
        writeFileSync(
          join(fixture, site, "index.html"),
          `<a href="/${site}/">home</a>`,
        );
      }
      const page = join(fixture, name, "index.html");
      const run = () =>
        spawnSync(
          process.execPath,
          [join(repository, "scripts/check-site-links.mjs"), fixture, name],
          { encoding: "utf8" },
        );
      const valid = run();
      assert.equal(valid.status, 0, valid.stdout + valid.stderr);
      for (const html of [
        "<html>No links</html>",
        '<a href="https://example.com/">external only</a>',
        '<a href="/escaped.html">escape</a>',
        `<script src="/${name}/missing.js"></script>`,
      ]) {
        writeFileSync(page, html);
        assert.notEqual(run().status, 0, `${name}: ${html}`);
      }
      writeFileSync(page, `<a class='nav' href='/${name}/'>home</a>`);
      assert.equal(
        run().status,
        0,
        "single-quoted local links must be checked",
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
}
