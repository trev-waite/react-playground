# Deployment

Live deploys to [studio.trevorwaite.com](https://studio.trevorwaite.com) as a Cloudflare Worker that serves only static assets. The site is a subdomain of the `trevorwaite.com` zone, which the knight site owns, so zone settings (HTTPS redirect, HSTS) come from there.

## How it ships

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

1. **Verify** lints the workflows, typechecks, tests, builds Live with `SITE_URL` set to the production origin, checks the build against the deploy allowlist, and packages the Worker with `wrangler deploy --dry-run`.
2. **Deploy** (on `main` only) publishes the exact build that passed, if the commit is still the tip of `main`, then runs `bun run --cwd apps/web smoke <origin>`. A failed smoke test rolls the Worker back to the version that was live before.

| File | Owns |
| --- | --- |
| `apps/web/wrangler.json` | Worker name, custom domain, and 404 handling. The CI origin is read from its `custom_domain` route. |
| `apps/web/public/_headers` | Security headers for every response. |
| `apps/web/vite/assetHeadersPlugin.ts` | Adds an immutable cache rule for each hashed file the build emits, by name. Never `/assets/*`: a missing file gets the 404 page, and a blanket rule would let browsers keep that 404 for a year. |
| `apps/web/public/404.html` | The page, with a 404 status, for any path that isn't a component. |
| `apps/web/vite/liveRoutesPlugin.ts` | Writes the app page at `<slug>.html` for every component and family, so those are the only paths that serve the app. |
| `apps/web/scripts/checkDeploy.ts` | The deploy allowlist (`bun run --cwd apps/web check:deploy`). It refuses anything in `public/` or `dist/` it doesn't expect: hidden files such as `.env`, source maps, unhashed scripts, pages that aren't the app, a missing or extra component route page (it compares them with the previews and families in `src/live`), files over 3 MB, and bundles that contain local paths or the studio's API. CI runs it after the build and again before deploying. |
| `apps/web/scripts/smoke.ts` | Post-deploy checks against a live origin. |

`bun run build && bun run start` serves the build through `wrangler dev`, with the same headers and 404 handling as production. A new file in `public/` must be added to `PUBLIC_FILES` in `checkDeploy.ts`, or the deploy stops.

## Changing the domain

Edit the `pattern` of the `custom_domain` route in `apps/web/wrangler.json`. The next deploy attaches the new hostname, creating its DNS record and certificate; detach the old one in the dashboard under Workers → `react-playground` → Domains & Routes.

## Credentials

Set these as secrets of the `prod` environment (Settings → Environments), restricted to the `main` branch:

| Secret | Scope |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | The account that owns the `trevorwaite.com` zone. |
| `CLOUDFLARE_DEPLOY_TOKEN` | Account: Workers Admin, Account Settings Read. Zone `trevorwaite.com`: Workers Routes Edit. |

Workers Routes is zone-wide, so this token can also change the knight site's routes. Give it an expiry and renew it before then.

## Repository settings

Only collaborators can open pull requests, and `trev-waite` is the only one. The `main` ruleset blocks deletion and force pushes, keeps history linear, and requires a pull request whose "Typecheck, test, build" check passes on an up-to-date branch, with no bypass. Actions may run only GitHub-owned actions and `oven-sh/setup-bun`, pinned to full commit SHAs, with a read-only default token; workflows from outside contributors wait for approval. Secret scanning with push protection, Dependabot alerts and security updates, and private vulnerability reporting are on. `.github/dependabot.yml` opens monthly update PRs for actions and Bun packages.
