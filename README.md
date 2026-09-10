# PolicyEngine Documentation

Central documentation hub for PolicyEngine projects, deployed to [policyengine-docs.vercel.app](https://policyengine-docs.vercel.app).

## Structure

This repo aggregates Jupyter Book 2 (MyST) documentation from multiple PolicyEngine repositories:

- `/spm-calculator/` - SPM Threshold Calculator
- `/microdf/` - Weighted DataFrames for survey microdata
- `/policyengine-uk-data/` - UK microsimulation data

## How it works

1. `build.sh` clones each source repo's docs folder
2. Builds each with `myst build --html`
3. Copies outputs to a unified `dist/` directory
4. Vercel deploys `dist/` to `policyengine-docs.vercel.app`

Each MyST build receives its own `BASE_URL` (for example,
`/spm-calculator`) so navigation and assets resolve under that site's mount.
The build checks SPM page links and assets before completing.
It installs MyST 1.7.1 in a temporary local directory, builds all sites into
fresh output, and replaces generated site directories only after validation.
`dist/source-manifest.json` records the actual cloned commit for each site,
the MyST and Node versions, and hashes of the aggregator build sources.

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
node scripts/check-spm-links.mjs dist
# Then serve dist/ with any static server
```

Run the isolated, network-free build lifecycle regression with
`node --test tests/build.test.mjs`. It checks replacement of stale pages and
assets, preservation of existing output on a build failure, source manifest
identities, and preservation of unrelated files.

## Deployment

Deployed automatically via Vercel on push to main.
