# PolicyEngine Documentation

Central documentation hub for PolicyEngine projects, deployed to [docs.policyengine.org](https://docs.policyengine.org).

## Structure

This repo aggregates Jupyter Book 2 (MyST) documentation from multiple PolicyEngine repositories:

- `/spm-calculator/` - SPM Threshold Calculator
- `/microdf/` - Weighted DataFrames for survey microdata
- `/policyengine-uk-data/` - UK microsimulation data

## How it works

1. `build.sh` clones each source repo's docs folder
2. Builds each with `myst build --html`
3. Copies outputs to a unified `dist/` directory
4. Vercel deploys `dist/` to `docs.policyengine.org`

## Adding a new project

Edit `build.sh` and add the repo to the `REPOS` array:

```bash
REPOS=(
  ...
  "PolicyEngine/new-repo:docs:new-repo"
)
```

Then update the index.html in the build script.

## Local development

```bash
./build.sh
# Then serve dist/ with any static server
```

## Deployment

Deployed automatically via Vercel on push to main.
