import { randomInt } from "node:crypto";

// Ports of the `Ascii`/`safe`/`safeplus` implicit class in good-game/GoodGame.scala.

function codePoints(s: string): string[] {
  return Array.from(s);
}

export function ascii(s: string): string {
  return codePoints(s)
    .filter((c) => {
      const code = c.codePointAt(0)!;
      return code >= 32 && code < 128;
    })
    .join("");
}

export function asciiPlus(s: string): string {
  return codePoints(s)
    .filter((c) => {
      const code = c.codePointAt(0)!;
      if (code >= 32 && code < 128) return true;
      return code > 158 && code < 256 && /\p{L}/u.test(c);
    })
    .join("");
}

function stripUnsafe(s: string): string {
  return codePoints(s)
    .filter((c) => c !== "<" && c !== ">" && c !== '"' && c !== "\\")
    .join("");
}

export function safe(s: string): string {
  return stripUnsafe(ascii(s));
}

export function safePlus(s: string): string {
  return stripUnsafe(asciiPlus(s));
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

// The original used scala.util.Random for these secrets, which are the
// entire auth model here (bearer tokens in the URL) -- worth the small
// upgrade to a CSPRNG.
export function newSecret(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}
