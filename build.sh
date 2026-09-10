#!/bin/bash
# Build script for policyengine-docs
# Clones JB2 docs from multiple repos and builds them into a unified site

set -euo pipefail

# Keep tools, clones and incomplete output in a directory owned by this run.
repo_root=$(cd "$(dirname "$0")" && pwd)
build_dir=$(mktemp -d "$repo_root/.docs-build.XXXXXX")
trap 'rm -rf "$build_dir"' EXIT
mkdir -p "$build_dir/output" "$build_dir/sources"

# Install the qualified CLI locally, without changing global tools.
npm install --prefix "$build_dir/tools" --no-audit --no-fund mystmd@1.7.1
myst="$build_dir/tools/node_modules/.bin/myst"
myst_version=$("$myst" --version)

# List of repos with JB2 docs (repo:docs_path:output_name)
REPOS=(
  "PolicyEngine/spm-calculator:docs:spm-calculator"
  "PolicyEngine/microdf:docs:microdf"
  "PolicyEngine/policyengine-uk-data:docs:policyengine-uk-data"
)

# Clone and build each repo's docs
for entry in "${REPOS[@]}"; do
  IFS=':' read -r repo docs_path output_name <<< "$entry"
  echo "Building $repo..."

  # Clone repo (shallow)
  source_dir="$build_dir/sources/$output_name"
  git clone --depth 1 "https://github.com/$repo.git" "$source_dir"
  source_commit=$(git -C "$source_dir" rev-parse HEAD)
  printf '%s\t%s\t%s\t%s\n' "$repo" "$docs_path" "$output_name" "$source_commit" >> "$build_dir/sources.tsv"

  # Build docs
  (
    cd "$source_dir/$docs_path"
    BASE_URL="/$output_name" "$myst" build --html
  )

  # This destination is new for every run, so cp cannot nest stale output.
  cp -r "$source_dir/$docs_path/_build/html" "$build_dir/output/$output_name"
done

# Create index page
cat > "$build_dir/output/index.html" << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <title>PolicyEngine Documentation</title>
  <style>
    body { font-family: Inter, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
    h1 { color: #319795; }
    ul { list-style: none; padding: 0; }
    li { margin: 15px 0; }
    a { color: #319795; text-decoration: none; font-size: 18px; }
    a:hover { text-decoration: underline; }
    .desc { color: #666; font-size: 14px; margin-top: 5px; }
  </style>
</head>
<body>
  <h1>PolicyEngine Documentation</h1>
  <ul>
    <li>
      <a href="/spm-calculator/">SPM Calculator</a>
      <div class="desc">Calculate Supplemental Poverty Measure thresholds</div>
    </li>
    <li>
      <a href="/microdf/">microdf</a>
      <div class="desc">Weighted pandas DataFrames for survey microdata analysis</div>
    </li>
    <li>
      <a href="/policyengine-uk-data/">PolicyEngine UK Data</a>
      <div class="desc">UK microsimulation data documentation</div>
    </li>
  </ul>
</body>
</html>
EOF

node "$repo_root/scripts/write-source-manifest.mjs" "$repo_root" "$build_dir" "$myst_version"
node "$repo_root/scripts/check-spm-links.mjs" "$build_dir/output"

# Replace only generated site directories after every build and check succeeds.
mkdir -p "$repo_root/dist"
for entry in "${REPOS[@]}"; do
  IFS=':' read -r repo docs_path output_name <<< "$entry"
  rm -rf "$repo_root/dist/$output_name"
  mv "$build_dir/output/$output_name" "$repo_root/dist/$output_name"
done
mv "$build_dir/output/index.html" "$repo_root/dist/index.html"
mv "$build_dir/output/source-manifest.json" "$repo_root/dist/source-manifest.json"

echo "Build complete! Output in dist/"
