import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { cors } from "hono/cors";

import {
  addAccessRights,
  appendEntries,
  getPlay,
  getUser,
  hasRight,
  putJournal,
  putPlay,
  putUser,
  readEntries,
} from "./db";
import { asciiPlus, newSecret, safePlus } from "./util";
import { renderIndex } from "./template";

// Same origin serves both the dynamic routes (this Lambda) and /hrf/* static
// assets (the StaticSite bucket), so cdn === server + "/hrf/" -- no separate
// CDN_URL/SITE_URL pair to keep in sync like the original CLI args required.
const SITE_URL = process.env.SITE_URL ?? "";
const CDN = `${SITE_URL}/hrf/`;

const app = new Hono();
app.use("*", cors());

function render(opts: { meta?: string; user?: string; secret?: string; lobby?: string }) {
  return renderIndex({ cdn: CDN, server: SITE_URL, ...opts });
}

app.get("/", (c) => c.redirect("/play", 303));
app.get("/play/", (c) => c.redirect("/play", 303));
app.get("/play", (c) => c.html(render({})));

app.get("/play/:meta/", (c) => c.redirect(`/play/${c.req.param("meta")}`, 303));
app.get("/play/:meta", (c) => c.html(render({ meta: c.req.param("meta") })));

// A magic link looks like /play/:meta/:secret, where :secret is the single
// 16-char Play secret minted by POST /new-play. Anything else after :meta
// (no extra segments, or not 16 chars) just renders the bare meta page, same
// as the Segments fallback case in GoodGame.scala.
app.get("/play/:meta/*", async (c) => {
  const meta = c.req.param("meta");
  const rest = c.req.path.split("/").slice(3);

  if (rest.length === 1 && rest[0].length === 16) {
    const play = await getPlay(rest[0]);
    const user = play && (await getUser(play.userId));

    if (play && user) {
      return c.html(render({ meta, user: user.id, secret: user.secret, lobby: play.journalId }));
    }
  }

  return c.html(render({ meta }));
});

app.post("/new-user", async (c) => {
  const body = await c.req.text();
  const name = safePlus(body.slice(0, 32).trim());
  const user = { name, secret: newSecret(16), id: newSecret(16) };
  await putUser(user);
  return c.text(`${user.id}\n${user.secret}`);
});

app.post("/new-journal/:userId/:userSecret", async (c) => {
  const { userId, userSecret } = c.req.param();
  const user = await getUser(userId);
  if (!user || user.secret !== userSecret) return c.text("", 403);

  const body = await c.req.text();
  const name = safePlus(body.slice(0, 128).trim());
  const id = newSecret(16);

  await putJournal({ id, name, public: false, status: "", message: "" });
  await addAccessRights(id, userId, ["full", "read", "append"]);

  return c.text(id);
});

app.post("/grant-read/:userId/:userSecret/:journalId/:anotherUser", async (c) => {
  const { userId, userSecret, journalId, anotherUser } = c.req.param();
  if (!(await hasRight(userId, userSecret, journalId, "full"))) return c.text("", 403);
  if (!(await getUser(anotherUser))) return c.text("", 404);

  await addAccessRights(journalId, anotherUser, ["read"]);
  return c.text("");
});

app.post("/grant-read-append/:userId/:userSecret/:journalId/:anotherUser", async (c) => {
  const { userId, userSecret, journalId, anotherUser } = c.req.param();
  if (!(await hasRight(userId, userSecret, journalId, "full"))) return c.text("", 403);
  if (!(await getUser(anotherUser))) return c.text("", 404);

  await addAccessRights(journalId, anotherUser, ["read", "append"]);
  return c.text("");
});

app.post("/new-play/:userId/:userSecret/:journalId", async (c) => {
  const { userId, userSecret, journalId } = c.req.param();
  if (!(await hasRight(userId, userSecret, journalId, "full"))) return c.text("", 403);

  const body = await c.req.text();
  const name = safePlus(body.slice(0, 32).trim());
  const secret = newSecret(16);
  const user = { name, secret: newSecret(16), id: newSecret(16) };

  await putUser(user);
  await addAccessRights(journalId, user.id, ["read", "append"]);
  await putPlay({ secret, journalId, userId: user.id });

  return c.text(`${user.id}\n${secret}`);
});

app.get("/read/:userId/:userSecret/:journalId/:from", async (c) => {
  const { userId, userSecret, journalId, from } = c.req.param();
  const fromN = Number.parseInt(from, 10);
  if (Number.isNaN(fromN)) return c.text("", 404);

  if (!(await hasRight(userId, userSecret, journalId, "read"))) return c.text("", 403);

  const log = await readEntries(journalId, fromN);
  return c.text(log.map((e) => e.text).join("\n"));
});

app.post("/append/:userId/:userSecret/:journalId/:from", async (c) => {
  const { userId, userSecret, journalId, from } = c.req.param();
  const fromN = Number.parseInt(from, 10);
  if (Number.isNaN(fromN)) return c.text("", 404);

  if (!(await hasRight(userId, userSecret, journalId, "append"))) return c.text("", 403);

  const body = await c.req.text();
  const lines = body.split("\n").map(asciiPlus);

  const ok = await appendEntries(journalId, fromN, userId, lines);
  return ok ? c.text("", 202) : c.text("", 409);
});

export const handler = handle(app);
