import { indexHtml } from "./template.generated";

// Mirrors the string substitutions GoodGame.scala performs on index.html for
// every /play* request: <base href> points at the CDN (here, the /hrf/*
// route on the same Router/domain), data-server is the API origin the client
// will poll/append against, and the data-user/secret/lobby attributes are
// only filled in for a valid magic-link visit (/play/:meta/:secret).
export interface RenderOptions {
  cdn: string;
  server: string;
  meta?: string;
  user?: string;
  secret?: string;
  lobby?: string;
}

export function renderIndex(opts: RenderOptions): string {
  let html = indexHtml;
  html = html.replaceAll('<base href="" />', `<base href="${opts.cdn}"/>`);
  html = html.replaceAll('data-server=""', `data-server="${opts.server}"`);
  html = html.replaceAll('data-meta=""', `data-meta="${opts.meta ?? ""}"`);
  if (opts.user) html = html.replaceAll('data-user=""', `data-user="${opts.user}"`);
  if (opts.secret) html = html.replaceAll('data-secret=""', `data-secret="${opts.secret}"`);
  if (opts.lobby) html = html.replaceAll('data-lobby=""', `data-lobby="${opts.lobby}"`);
  return html;
}
