### HRF Serverless Host

A from-scratch reimplementation of `good-game/GoodGame.scala` on AWS via
[SST](https://sst.dev), so the existing `haunt-roll-fail` Scala.js client can
keep working unmodified after the original host goes away. No code in
`haunt-roll-fail/` changes — this only replaces the backend it talks to.

#### Why this works

The client only ever does plain polling HTTP (XHR), never WebSockets — see
`journal.scala`'s `ServerJournal` (`GET /read/...` every ~500ms while
waiting on an opponent, `POST /append/...` to submit a move). That maps
cleanly onto Lambda + API Gateway/Function URLs with no persistent
connections to manage.

#### Architecture

| Original (good-game) | Here |
|---|---|
| Akka HTTP server | One `sst.aws.Function` (Node/TS, Hono) — [src/api.ts](src/api.ts) |
| `getFromDirectory` under `/hrf/*` | `sst.aws.StaticSite` + CloudFront, same `Router` |
| HSQLDB: `Users`, `Journals`, `Entries`, `AccessRights`, `Plays` | 5 `sst.aws.Dynamo` tables, same shape — [src/db.ts](src/db.ts) |
| `index.html` templated per-request | Same 5 string substitutions, ported to [src/template.ts](src/template.ts) |
| `id`/`secret` bearer tokens in the URL | Unchanged — same auth model, same routes/payloads |

Both the static assets (`/hrf/*`) and the API/dynamic HTML live behind one
`sst.aws.Router`, so there's a single domain and no CORS/cross-origin
script-loading concerns to work around.

#### ⚠️ Missing assets — read this first

This git repo has **no card/board art, fonts, or images** in it (checked:
zero PNGs/JPEGs/WOFFs in the history). The live site's operator must be
supplying those separately. Before you can deploy a usable game, you need to
get hold of them yourself — e.g. ask the maintainer for an archive, or, since
you already have legitimate access to the live site, mirror what your
browser loads from `/hrf/*` before it goes offline. Whatever you get, drop
it into `serverless/assets/` with paths relative to `/hrf/`, e.g.:

```
serverless/assets/omen.png
serverless/assets/background.png
serverless/assets/fonts/luminari.woff2
```

`scripts/build-client.sh` copies anything in `assets/` straight into the
deployed bucket alongside the compiled JS. `assets/` is gitignored by
default since this is almost certainly copyrighted material.

#### Prerequisites

- Node 18+ and `sbt` (same toolchain the existing README already needs)
- An AWS account with credentials configured (`aws configure`, or env vars
  `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_SESSION_TOKEN`) that
  `sst` can pick up — **not currently set up in this environment**, you'll
  need to do this before `sst dev`/`sst deploy` will work
- `npm install` in this directory

#### Local dev

```
npm install
npx sst dev
```

This deploys real (but stage-isolated) AWS resources and live-reloads the
Lambda on save. `sst dev` will also run `scripts/build-client.sh` once to
seed the static assets.

#### Deploy

```
npx sst deploy --stage production
```

Prints the Router's CloudFront URL — that's your new site. (`removal` is
set to `retain` for the `production` stage, so tearing down the stage won't
delete the DynamoDB tables/data by accident; every other stage tears down
cleanly with `sst remove`.)

#### Custom domain

Add a `domain` to the `Router` in [sst.config.ts](sst.config.ts) if you own
one and want it instead of the default CloudFront URL — see the
[Router docs](https://sst.dev/docs/component/aws/router/).

#### What's intentionally different from the original

- Secrets (`newSecret`) now use `node:crypto.randomInt` instead of
  `scala.util.Random` — these are the entire auth model (bearer tokens), so
  it's worth the CSPRNG.
- A handful of auth failures that the original left as uncaught exceptions
  (→ Akka's default 500) now return 403/404 instead. The client doesn't
  branch on the exact status code for these paths, so this is a strict
  improvement, not a compatibility risk.
- No data migration from the existing HSQLDB — this is a clean-start
  backend. Existing magic links / in-progress games on the old host won't
  resolve here.
