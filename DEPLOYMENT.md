# Deploying Khonshu

The production Worker is `projectkhonshu`, at
[projectkhonshu.eliasedwin7.workers.dev](https://projectkhonshu.eliasedwin7.workers.dev/).
The production branch is **main**. Cloudflare's connected GitHub Builds publishes production.
GitHub Actions runs validation only; it does not publish or need Cloudflare secrets.

## Build and check locally

Use Node.js 24 and pnpm 11.25.0 (the version is recorded in `package.json`):

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm run check
pnpm run build
pnpm test
pnpm exec wrangler deploy --dry-run
```

On Windows with Edge already installed, the browser checks can use it:

```powershell
$env:KHONSHU_BROWSER_CHANNEL = 'msedge'
pnpm test
```

`public/` is generated from an explicit asset list. It contains the website, icons, offline worker
and version metadata; Git history, Python server, batch files, dependencies and credentials are
excluded. The build refuses to replace an unrelated `public` directory.

The menu footer shows the package version, source commit and build date (in its tooltip).
Uncommitted local builds include `-dirty`, so they cannot be mistaken for a clean release.

## Automatic deployment through Cloudflare Builds

The Worker is already connected to GitHub. In Cloudflare, open **Workers & Pages → projectkhonshu
→ Settings → Build** and check the following settings once:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Root directory | Repository root (`/`) |
| Build command | `pnpm run check && pnpm run build` |
| Deploy command | `pnpm exec wrangler deploy` |
| Build variable | `PNPM_VERSION` = `11.25.0` |
| Node.js version | `24` (recorded in `.node-version`) |

Let Cloudflare install dependencies from `pnpm-lock.yaml`. The explicit build command matters:
Workers Builds does not use Wrangler's custom `build.command`. Cloudflare's existing build token
handles deployment authentication, so no GitHub Actions deployment token is required.

The included `.github/workflows/site.yml` checks every push and pull request, including browser
tests. Cloudflare and GitHub checks run independently. Merge feature branches only after the
**Check Khonshu** workflow passes; repository branch protection can enforce this check before
merging to main. A push to the configured production branch triggers Cloudflare's build and deploy.

Keep preview builds off unless you want branch previews. If enabled, use
`pnpm exec wrangler preview` as the preview command; it creates a preview without replacing the
live deployment. Only the production branch should use `wrangler deploy`.

After a production push, confirm success under the Worker's **Deployments** tab. Open the site
and compare its footer's commit to the pushed commit. The build uses Cloudflare's
`WORKERS_CI_COMMIT_SHA` for this identification. If an installed app has an older release, use
**Update ready** after waking from Sleep lock.

For a deliberate manual deployment from an authenticated local CLI, run `pnpm deploy`.
The configuration only uploads `public/` and uses the existing Worker name.

These dashboard settings have not been changed by the local code build. The generated deployment
was verified with Wrangler's local runtime and a dry run.

References: [Build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/),
[build image and versions](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/),
[branch control](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/),
[static assets](https://developers.cloudflare.com/workers/static-assets/get-started/), and
[API tokens](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/).

## Offline releases

Each deployment precaches a complete, versioned app shell. Imported audio stays in the browser's
IndexedDB, separate from release caches. API calls and third-party radio are never cached.
An update downloads in the background and waits for **Update ready** to be pressed. Updates are
disabled during Sleep lock, and other open nights are not force-reloaded.
