#!/bin/bash
# Build script for policyengine-docs
# Clones JB2 docs from multiple repos and builds them into a unified site

set -e

# Install mystmd and ensure it's in PATH
pip install mystmd
export PATH="$HOME/.local/bin:$PATH"

# Create output directory
mkdir -p dist

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
  git clone --depth 1 "https://github.com/$repo.git" "tmp_$output_name"

  # Build docs
  cd "tmp_$output_name/$docs_path"
  python -m mystmd build --html

  # Copy to output
  cp -r _build/html "../../dist/$output_name"
  cd ../..

  # Cleanup
  rm -rf "tmp_$output_name"
done

# Create index page
cat > dist/index.html << 'EOF'
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

echo "Build complete! Output in dist/"
