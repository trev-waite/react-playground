# Deployment

Live deploys to [studio.trevorwaite.com](https://studio.trevorwaite.com) as a Cloudflare Worker that serves only static assets. The site is a subdomain of the `trevorwaite.com` zone, which the knight site owns, so zone settings (HTTPS redirect, HSTS) come from there.

## How it ships

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

1. **Verify** lints the workflows, typechecks, tests, builds Live with `SITE_URL` set to the production origin, checks the build against the deploy allowlist, packages the Worker with `wrangler deploy --dry-run`, then smoke tests the build before anything deploys: `smoke:local --no-build` serves `dist` with `wrangler dev --local` on a free `127.0.0.1` port and runs the smoke checks against it. Last, two checks drive the build in headless Chromium: `check:phone` opens every card's page on a phone-sized screen, fails if a preview had to shrink to fit, and checks that a finger drags a Spacing Tidy square; and `check:routes` holds the routing to what real URLs promise (a tile is a link, Back returns from a card to the grid, paging adds no history, every card's path opens that card, and a page chosen mid-flight lands whole).
2. **Deploy** (on `main` only) publishes the exact build that passed, if the commit is still the tip of `main`, then runs `bun run --cwd apps/web smoke <origin>`. A failed smoke test rolls the Worker back to the version that was live before.

The pre-deploy smoke runs locally on the runner with no credentials: the Verify job has no environment or secrets, and Wrangler runs in local mode with no bindings.

## Smoke tests

The same checks run in three places:

| Where | Command | Against |
| --- | --- | --- |
| Laptop | `bun run smoke:local` | A fresh build, made with the production `SITE_URL`, served by `wrangler dev`. It stops the server when it's done. |
| Pull requests and `main` | `bun run --cwd apps/web smoke:local --no-build` | The build CI just made, served by `wrangler dev`. |
| After a deploy | `bun run --cwd apps/web smoke https://studio.trevorwaite.com` | Production, retrying for 25 seconds while the edge catches up. |

`wrangler dev` applies `_headers` and the 404 handling the same way production does, so the local run checks the Content-Security-Policy, immutable caching, and 404 page for real. Each check prints `ok`, `skip`, or `fail`, and only a `fail` fails the run. A local run skips the HTTP-to-HTTPS redirect check, since that comes from the zone. The checks expect `og:url` to name the origin the build was made for, which is production even when the request goes to `127.0.0.1`.

The `trevorwaite.com` zone keeps Bot Fight Mode on, and Cloudflare answers page requests from GitHub's datacenter IPs with a challenge that never reaches the Worker. The post-deploy smoke skips a check when a response is a 403 page carrying `cf-mitigated: challenge`, with no retries, and adds a warning to the run. Any other 403 or 5xx still fails and rolls back, and the local run fails on a challenge, since no Cloudflare sits in front of `wrangler dev`. The script check requests every script `dist/index.html` names, so it doesn't depend on a page that might be challenged. In practice, production checks from CI cover the scripts, `og.png`, the missing-script 404, and the HTTPS redirect, and the pre-deploy run covers the pages. To check every page in production, build the deployed commit with `SITE_URL=https://studio.trevorwaite.com bun run build`, then run `bun run --cwd apps/web smoke https://studio.trevorwaite.com` from a laptop; the script and route checks request what that `dist` names.

| File | Owns |
| --- | --- |
| `apps/web/wrangler.json` | Worker name, custom domain, and 404 handling. The CI origin is read from its `custom_domain` route. |
| `apps/web/public/_headers` | Security headers for every response. |
| `apps/web/vite/assetHeadersPlugin.ts` | Adds an immutable cache rule for each hashed file the build emits, by name. Never `/assets/*`: a missing file gets the 404 page, and a blanket rule would let browsers keep that 404 for a year. |
| `apps/web/public/404.html`, `404.js` | The page, with a 404 status, for any path that isn't a component. `404.js` lights the dots near the pointer or finger and sends a ripple on tap; the page reads fine without it. |
| `apps/web/vite/liveRoutesPlugin.ts` | Gives every route a real page: `index.html` for the grid and `<slug>.html` for each card and each component on a family card, so those are the only paths that serve the app. Each page is the same app with its own title, description, canonical URL, and link preview, read from the card's `meta` in source (`vite/liveCards.ts`, `vite/routeHead.ts`). It also writes `sitemap.xml` and `robots.txt` when `SITE_URL` is set. |
| `apps/web/scripts/checkDeploy.ts` | The deploy allowlist (`bun run --cwd apps/web check:deploy`). It refuses anything in `public/` or `dist/` it doesn't expect: hidden files such as `.env`, source maps, unhashed scripts, a missing or extra route page (it reads the catalog from `src/live`), a route page that is anything but the app with that route's own title and link preview, a link-preview image with no card, files over 3 MB, and bundles that contain local paths or the studio's API. CI runs it after the build and again before deploying. |
| `apps/web/public/og/` | One 1200×630 link-preview image per card, drawn by `bun run --cwd apps/web og:cards` (macOS and Google Chrome). A card without one shares `og.png`, and the build says so. |
| `apps/web/scripts/smoke/` | The smoke checks (`checks.ts`), the runner for a deployed origin (`run.ts`), and the runner that serves the build with `wrangler dev` (`local.ts`). |

`bun run build && bun run start` serves the build through `wrangler dev`, with the same headers and 404 handling as production. A new file in `public/` must be added to `PUBLIC_FILES` in `checkDeploy.ts`, or the deploy stops.

## Changing the domain

Edit the `pattern` of the `custom_domain` route in `apps/web/wrangler.json`. The next deploy attaches the new hostname, creating its DNS record and certificate; detach the old one in the dashboard under Workers → `react-playground` → Domains & Routes.

## Credentials

Set these as secrets of the `prod` environment (Settings → Environments), restricted to the `main` branch:

| Secret | Scope |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | The account that owns the `trevorwaite.com` zone. |
| `CLOUDFLARE_DEPLOY_TOKEN` | Account: Workers Admin, Account Settings Read. Zone `trevorwaite.com`: Workers Routes Edit. |

The deploy job passes both only to the steps that call Cloudflare, plus the first step's check that they're set.

Workers Routes is zone-wide, so this token can also change the knight site's routes. Give it an expiry and renew it before then.

## Repository settings

Only collaborators can open pull requests, and `trev-waite` is the only one. The `main` ruleset blocks deletion and force pushes, keeps history linear, and requires a pull request whose "Typecheck, test, build" check passes on an up-to-date branch, with no bypass. Actions may run only GitHub-owned actions and `oven-sh/setup-bun`, pinned to full commit SHAs, with a read-only default token; workflows from outside contributors wait for approval. Secret scanning with push protection, Dependabot alerts and security updates, and private vulnerability reporting are on. `.github/dependabot.yml` opens monthly update PRs for actions and Bun packages.
