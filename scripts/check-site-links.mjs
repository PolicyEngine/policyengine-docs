import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const output = resolve(process.argv[2] ?? "dist");
const name = process.argv[3];
assert.match(name ?? "", /^[a-z0-9-]+$/, "provide the generated site name");
const mount = `/${name}`;
const origin = "https://docs.example";
const root = readFileSync(join(output, "index.html"), "utf8");
assert.match(
  root,
  new RegExp(`href=["']${mount}/["']`),
  `hub links to ${mount}`,
);

function htmlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? htmlFiles(path)
      : entry.name.endsWith(".html")
        ? [path]
        : [];
  });
}

const pages = htmlFiles(join(output, name));
assert.ok(pages.length > 0, `${mount}: HTML pages exist`);
let checked = 0;
for (const page of pages) {
  const url = new URL(
    page.slice(output.length).replace(/index\.html$/, ""),
    origin,
  );
  const html = readFileSync(page, "utf8");
  const links = html.matchAll(
    /<(?:a|link|script|img)\b[^>]*?\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi,
  );
  for (const [, , href] of links) {
    if (href.startsWith("#")) continue;
    const target = new URL(href.replaceAll("&amp;", "&"), url);
    if (target.origin !== origin) continue;
    assert.ok(
      target.pathname === mount || target.pathname.startsWith(`${mount}/`),
      `${page}: local link escapes ${mount} mount: ${href}`,
    );
    const path = join(output, decodeURIComponent(target.pathname));
    assert.ok(
      [path, `${path}.html`, join(path, "index.html")].some(
        (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
      ),
      `${page}: local link has no exported file: ${href}`,
    );
    checked += 1;
  }
}
assert.ok(checked > 0, `${mount}: no local links were validated`);
console.log(
  `Validated ${checked} local links across ${pages.length} ${mount} pages.`,
);
