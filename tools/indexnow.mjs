// Tells Bing (and Yandex, Seznam, Naver: everyone on IndexNow) that pages changed, so they recrawl
// within hours instead of weeks. Google doesn't take IndexNow: use Search Console for Google.
//
//   node tools/indexnow.mjs            every URL in sitemap.xml
//   node tools/indexnow.mjs a.html b   just those pages
//
// The key is the <32 hex>.txt file in the repo root (it must be live on sortafun.org first,
// so run this after the push has deployed). One key for the site, don't rotate it casually.
import { readFileSync, readdirSync } from "node:fs";

const key = readdirSync(".").find((f) => /^[0-9a-f]{32}\.txt$/.test(f)).slice(0, 32);
const args = process.argv.slice(2);
const urls = args.length
  ? args.map((p) => "https://sortafun.org/" + p.replace(/^\/|^index\.html$/g, ""))
  : [...readFileSync("sitemap.xml", "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: "sortafun.org", key, keyLocation: "https://sortafun.org/" + key + ".txt", urlList: urls }),
});
console.log("indexnow:", res.status, res.statusText, urls.length + " urls", (await res.text()).slice(0, 200));
