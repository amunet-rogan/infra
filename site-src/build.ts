#!/usr/bin/env bun
// Build the Amunet site into ../amunet/site/:
//
//   /               index.html               rozcestnik + citat (templates/home.html)
//   /sluzby/        sluzby/index.html         seznam sluzeb (data/services.json)
//   /pro-martina/   pro-martina/index.html    prirucka (content/handbook/*.md)
//
// Kazda stranka je self-contained (inline CSS + JS, zadne externi assety).
// nginx servisuje jen tyhle tri cesty — viz scripts/regenerate-nginx-conf.sh.

import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "amunet", "site");
const read = (p: string) => readFile(join(HERE, p), "utf8");

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// JSON do <script>: "</" by predcasne ukoncilo tag
const scriptJson = (v: unknown) => JSON.stringify(v).replace(/<\//g, "<\\/");

const BASE_CSS = await read("base.css");
const built = new Date().toLocaleString("cs-CZ", {
  timeZone: "Europe/Prague", dateStyle: "medium", timeStyle: "short",
});

function fill(tpl: string, vars: Record<string, string>) {
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{{${k}}}`).join(v);
  const left = out.match(/\{\{[A-Z_]+\}\}/);
  if (left) throw new Error(`Nenahrazeny placeholder ${left[0]}`);
  return out;
}

async function emit(rel: string, html: string) {
  const path = join(OUT, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, html, "utf8");
  console.log(`  ✓ ${rel.padEnd(24)} ${(Buffer.byteLength(html) / 1024).toFixed(1)} kB`);
}

// --- clean output --------------------------------------------------------
await rm(OUT, { recursive: true, force: true });

// --- home ----------------------------------------------------------------
type Quote = { text: string; source: string };
const quotes: Quote[] = JSON.parse(await read("data/quotes.json"));
if (!quotes.length) throw new Error("data/quotes.json je prazdny");
const first = quotes[Math.floor(Math.random() * quotes.length)];
await emit("index.html", fill(await read("templates/home.html"), {
  BASE_CSS,
  QUOTE_TEXT: esc(first.text),
  QUOTE_SOURCE: esc(first.source),
  QUOTES_JSON: scriptJson(quotes),
}));

// --- services ------------------------------------------------------------
// Sluzba s "port" dostane seznam kandidatnich cest; stranka je za behu
// vyzkousi v poradi a pouzije prvni, ktera odpovi. Tim pozna, co je za
// tailscale serve (https) a co je zatim holy port (http pres jmeno / IP / LAN).
type Svc = {
  rank: number; name: string; cat: string; desc: string;
  url?: string; port?: number; path?: string;
  tls?: boolean; only?: "https"; probe?: boolean; group?: string;
};
type Route = { url: string; kind: "tls" | "name" | "ip" | "lan" | "fixed" };
const sdata: { host: string; tsip: string; lan: string; categories: Record<string, string>;
  groups: Record<string, string>; services: Svc[] } =
  JSON.parse(await read("data/services.json"));

const ranks = new Set<number>();
for (const s of sdata.services) {
  if (!sdata.categories[s.cat]) throw new Error(`${s.name}: neznama kategorie "${s.cat}"`);
  if (s.group && !sdata.groups[s.group]) throw new Error(`${s.name}: neznama skupina "${s.group}"`);
  if (ranks.has(s.rank)) throw new Error(`${s.name}: duplicitni rank ${s.rank}`);
  if (!!s.url === !!s.port) throw new Error(`${s.name}: potrebuje presne jedno z "url" / "port"`);
  ranks.add(s.rank);
}

function routes(s: Svc): Route[] {
  if (s.url) return [{ url: s.url, kind: "fixed" }];
  const path = s.path ?? "/";
  const r: Route[] = [{ url: `https://${sdata.host}:${s.port}${path}`, kind: "tls" }];
  if (s.only === "https") return r;
  // Za tailscale serve patri port na tailnet IP serve-u: holy http tam vrati
  // 400, coz no-cors sonda nerozezna od zive sluzby (falesne "up"). Proto
  // tls sluzby nedostanou http pres jmeno/IP — jen LAN, kde se jde primo
  // na kontejner.
  if (!s.tls) r.push(
    { url: `http://${sdata.host}:${s.port}${path}`, kind: "name" },
    { url: `http://${sdata.tsip}:${s.port}${path}`, kind: "ip" },
  );
  r.push({ url: `http://${sdata.lan}:${s.port}${path}`, kind: "lan" });
  return r;
}

const addr = (url: string) => {
  if (url.startsWith("/")) return sdata.host + url;
  const u = new URL(url);
  return u.host + (u.pathname === "/" ? "" : u.pathname);
};

const cards = [...sdata.services].sort((a, b) => a.rank - b.rank).map(s => {
  const rs = routes(s);
  const def = s.tls ? rs[0] : (rs.find(r => r.kind === "name") ?? rs[0]);
  const scheme = def.url.startsWith("https:") ? "https" : def.kind === "fixed" && def.url.startsWith("/") ? "" : "http";
  return `    <li class="svc" data-rank="${s.rank}" data-name="${esc(s.name)}" data-group="${esc(s.group ?? Object.keys(sdata.groups)[0])}">
      <a href="${esc(def.url)}">
        <span class="dot" data-probe="${s.probe === false ? "0" : "1"}" data-routes="${esc(JSON.stringify(rs))}"></span>
        <span class="body"><b>${esc(s.name)}</b><span class="desc">${esc(s.desc)}</span>
          <span class="meta"><code class="addr">${esc(addr(def.url))}</code><span class="via" data-kind="${scheme}">${scheme.toUpperCase()}</span></span></span>
        <span class="cat">${esc(sdata.categories[s.cat])}</span>
      </a>
    </li>`;
}).join("\n");

await emit("sluzby/index.html", fill(await read("templates/services.html"), {
  BASE_CSS, SERVICES: cards, HOST: sdata.host, GROUPS_JSON: scriptJson(sdata.groups),
}));

// --- handbook ------------------------------------------------------------
const HB = join(HERE, "content", "handbook");
const files = (await readdir(HB)).filter(f => f.endsWith(".md")).sort();
if (!files.length) throw new Error(`Zadny markdown v ${HB}`);

const nav: string[] = [];
const sections: string[] = [];
for (const file of files) {
  const raw = await readFile(join(HB, file), "utf8");
  const m = raw.match(/^#\s+(.+)$/m);
  if (!m) throw new Error(`${file}: chybi nadpis "# ..."`);
  const title = m[1].trim(), id = slug(title);
  nav.push(`<a href="#${id}">${esc(title)}</a>`);

  // Partialy AZ PO marked.parse — marked ukonci raw HTML blok na prvnim
  // prazdnem radku a zbytek zparsuje jako markdown. To rozbilo prvni diagram.
  let body = await marked.parse(raw);
  for (const pm of [...body.matchAll(/<p>\{\{PARTIAL:([a-z0-9-]+)\}\}<\/p>/g)]) {
    body = body.replace(pm[0], await read(`partials/${pm[1]}.html`));
  }
  if (body.includes("{{PARTIAL:")) throw new Error(`${file}: PARTIAL marker musi byt na vlastnim radku`);
  sections.push(`<section id="${id}">\n${body}</section>`);
}

await emit("pro-martina/index.html", fill(await read("templates/handbook.html"), {
  BASE_CSS, NAV: nav.join("\n"), CONTENT: sections.join("\n"), BUILT: built,
}));

console.log(`sestaveno ${built} → ${OUT}`);
