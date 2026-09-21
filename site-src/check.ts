#!/usr/bin/env bun
// Render-check webu. Pouziva podepsany systemovy browser, nestahuje zadny.
//
//   bun run check          # lokalni build (../amunet/site) pres mini server
//   bun run check <url>    # nasazeny web, napr. http://amunet.tail49d1b.ts.net/
//
// Screenshoty -> .screenshots/ (gitignored)

import { chromium, type Page } from "playwright-core";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, "..", "amunet", "site");
const SHOTS = join(HERE, ".screenshots");

// Brew chromium je nepodepsany a macOS ho zabije (SIGKILL / EPERM).
const EXECUTABLE = [
  process.env.CHROMIUM_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Vivaldi.app/Contents/MacOS/Vivaldi",
].find(p => p && existsSync(p));
if (!EXECUTABLE) { console.error("Zadny browser; nastav CHROMIUM_PATH."); process.exit(2); }

// Mini server se stejnou logikou jako nginx: /x -> 301 /x/, /x/ -> /x/index.html
let server: ReturnType<typeof Bun.serve> | null = null;
let BASE = process.argv[2];
if (!BASE) {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const path = decodeURIComponent(new URL(req.url).pathname);
      let file = join(SITE, path);
      if (!file.startsWith(SITE)) return new Response("no", { status: 403 });
      if (existsSync(file) && statSync(file).isDirectory()) {
        if (!path.endsWith("/")) return Response.redirect(path + "/", 301);
        file = join(file, "index.html");
      }
      return existsSync(file) ? new Response(Bun.file(file)) : new Response("404", { status: 404 });
    },
  });
  BASE = `http://localhost:${server.port}/`;
}
if (!BASE.endsWith("/")) BASE += "/";

const PAGES = [
  { key: "home", path: "" },
  { key: "sluzby", path: "sluzby/" },
  { key: "pro-martina", path: "pro-martina/" },
];
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844, scheme: "light" as const },
  { name: "mobile-dark", width: 390, height: 844, scheme: "dark" as const },
  { name: "desktop", width: 1280, height: 900, scheme: "light" as const },
];

let failures = 0;
const fail = (m: string) => { console.log(`  ✗ ${m}`); failures++; };
const pass = (m: string) => console.log(`  ✓ ${m}`);
const info = (m: string) => console.log(`  · ${m}`);
const check = (ok: boolean, good: string, bad: string) => ok ? pass(good) : fail(bad);

await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: EXECUTABLE });
const origin = new URL(BASE).origin;
console.log(`Kontroluji: ${BASE}\n`);

async function open(path: string, vp = VIEWPORTS[0]) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, colorScheme: vp.scheme, deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`JS: ${e}`));
  // Konzolove chyby z ciziho originu (sondy dostupnosti) nejsou chyby stranky
  page.on("console", m => {
    if (m.type() !== "error") return;
    const src = m.location()?.url ?? "";
    // Lokalni mini server neproxuje nastroje jako nginx -> /sky_max/* je tu 404
    if (server && new URL(src || origin).pathname.startsWith("/sky_max/")) return;
    if (!src || src.startsWith(origin)) errors.push(m.text());
  });
  const res = await page.goto(BASE + path, { waitUntil: "load" });
  return { ctx, page, errors, status: res?.status() ?? 0 };
}

async function layout(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const scrolls = (el: Element) => {
      for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === "auto" || ox === "scroll") return true;
      }
      return false;
    };
    return {
      overflow: document.documentElement.scrollWidth - vw,
      wide: [...document.querySelectorAll("body *")]
        .filter(el => el.getBoundingClientRect().right > vw + 1 && !scrolls(el))
        .map(el => el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : ""))
        .slice(0, 4),
    };
  });
}

// --- 1. vsechny stranky x vsechny viewporty -----------------------------
for (const pg of PAGES) {
  console.log(`── /${pg.path}`);
  for (const vp of VIEWPORTS) {
    const { ctx, page, errors, status } = await open(pg.path, vp);
    await page.waitForTimeout(300);
    const l = await layout(page);
    const probs = [
      status !== 200 && `HTTP ${status}`,
      errors.length && `chyby: ${errors.join(" | ")}`,
      l.overflow > 1 && `preteceni ${l.overflow}px`,
      l.wide.length && `mimo sirku: ${l.wide.join(", ")}`,
    ].filter(Boolean);
    check(!probs.length, `${vp.name}`, `${vp.name}: ${probs.join("; ")}`);
    await page.screenshot({ path: join(SHOTS, `${pg.key}-${vp.name}.png`), fullPage: vp.name === "desktop" });
    await ctx.close();
  }
}

// --- 2. rozcestnik -------------------------------------------------------
console.log("── rozcestník");
{
  const { ctx, page } = await open("");
  const links = await page.locator("nav a").evaluateAll(as => as.map(a => (a as HTMLAnchorElement).href));
  check(links.length === 2, "2 odkazy", `${links.length} odkazu`);
  for (const href of links) {
    const r = await page.request.get(href);
    check(r.status() === 200, `${new URL(href).pathname} → 200`, `${href} → ${r.status()}`);
  }
  const q1 = (await page.locator("#qt").textContent())?.trim() ?? "";
  check(q1.length > 10, "citat zobrazen", "citat prazdny");
  await page.locator("#q").click();
  await page.waitForTimeout(700);
  const q2 = (await page.locator("#qt").textContent())?.trim() ?? "";
  check(q2 !== q1 && q2.length > 10, "klepnuti vymeni citat", "citat se nezmenil");
  const tall = await page.locator("nav a").evaluateAll(as => as.every(a => a.getBoundingClientRect().height >= 44));
  check(tall, "odkazy >= 44px", "odkazy mensi nez 44px");
  await ctx.close();
}

// --- 3. sluzby -----------------------------------------------------------
console.log("── služby");
{
  const { ctx, page } = await open("sluzby/");
  const names = () => page.locator(".svc").evaluateAll(els => els.map(e => (e as HTMLElement).dataset.name!));
  const ranks = () => page.locator(".svc").evaluateAll(els => els.map(e => Number((e as HTMLElement).dataset.rank)));

  const r0 = await ranks();
  check(r0.length > 0 && r0.every((v, i) => i === 0 || r0[i - 1] < v),
        `${r0.length} sluzeb, vychozi razeni: skupiny`, `vychozi poradi nesedi: ${r0.join(",")}`);

  await page.locator('.sort button[data-sort="name"]').click();
  const n1 = await names();
  const expected = [...n1].sort((a, b) => a.localeCompare(b, "cs"));
  check(JSON.stringify(n1) === JSON.stringify(expected), "A–Z seradi abecedne", `A–Z: ${n1.join(", ")}`);

  await page.reload({ waitUntil: "load" });
  const n2 = await names();
  check(JSON.stringify(n2) === JSON.stringify(expected), "volba razeni prezije reload", "razeni se po reloadu ztratilo");

  check(await page.locator(".grp").count() === 0, "A–Z bez nadpisu skupin", "A–Z ma nadpisy skupin");
  await page.locator('.sort button[data-sort="group"]').click();
  const r3 = await ranks();
  check(JSON.stringify(r3) === JSON.stringify(r0), "prepnuti zpet na skupiny", "navrat na skupiny selhal");
  const heads = await page.locator(".grp").allTextContents();
  const rogan = await page.locator('.svc[data-group="amunet-rogan"]').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.name));
  const afterHead = await page.evaluate(() => {
    const h = [...document.querySelectorAll(".grp")].find(e => e.textContent!.startsWith("amunet-rogan"));
    const out: string[] = []; let n = h?.nextElementSibling;
    while (n && !n.classList.contains("grp")) { out.push((n as HTMLElement).dataset.name!); n = n.nextElementSibling; }
    return out;
  });
  check(heads.length === 2 && JSON.stringify(afterHead) === JSON.stringify(rogan) && rogan.length === 3,
        `skupina amunet-rogan (${rogan.length} nastroje) pod vlastnim nadpisem`, `skupiny: ${heads.join(" | ")} / ${afterHead.join(",")}`);

  const small = await page.evaluate(() =>
    [...document.querySelectorAll(".svc a, .sort button")].filter(e => e.getBoundingClientRect().height < 36).length);
  check(small === 0, "tap targety v poradku", `${small} malych tap targetu`);

  // Detekce cesty: pocka na vsechny sondy, pak porovna s tim, co je dnes
  // zmereno (curl matice 2026-09-21). Kdyz se neco presune za tailscale serve,
  // uprav EXPECT — a to je zamer: zmena infrastruktury ma byt videt.
  await page.waitForSelector("body[data-probed]", { timeout: 15000 }).catch(() => {});
  const got: Record<string, string> = Object.fromEntries(await page.locator(".svc").evaluateAll(els => els.map(e => [
    (e as HTMLElement).dataset.name!,
    `${(e.querySelector(".dot") as HTMLElement).dataset.state ?? "—"}:${e.querySelector(".via")!.textContent}`,
  ])));
  const EXPECT: Record<string, string> = {
    "Immich": "up:HTTP", "AdGuard Home": "up:HTTP", "Karakeep": "up:HTTP", "Forgejo": "up:HTTP",
    "Syncthing — jenda": "up:HTTP", "Syncthing — arunacala": "up:HTTP",
    "Paperless": "up:HTTPS", "Obsidian LiveSync": "up:HTTPS", "Anubis 2": "up:HTTPS",
    "Vaultwarden": "—:HTTPS", "Portainer": "—:HTTPS", "DSM": "up:HTTPS",
  };
  if (!process.argv[2] || new URL(BASE).protocol === "http:") {
    for (const [name, want] of Object.entries(EXPECT)) {
      check(got[name] === want, `${name.padEnd(22)} ${want}`, `${name}: cekano ${want}, je ${got[name]}`);
    }
  }
  info(Object.entries(got).filter(([n]) => !EXPECT[n]).map(([n, v]) => `${n}=${v}`).join("  "));
  const note = await page.locator("#n-http").textContent();
  check(!!note && note.includes("Immich") && !note.includes("Paperless"),
        "poznamka vyjmenuje HTTP-only sluzby", `poznamka: ${note}`);
  // Jedno "?" s poctem zprav; vse ostatni uvnitr balonku
  const infoBox = page.locator("#pop-info");
  const count = Number(await page.locator("#info-count").textContent());
  const shown = await page.locator("#pop-info .msg:not([hidden])").count();
  check(await infoBox.isVisible() && count === shown && count > 0, `"?" s poctem zprav (${count})`, `pocet ${count}, sekci ${shown}`);
  check(!(await infoBox.evaluate(e => (e as HTMLDetailsElement).open)), "balonek zavreny", "balonek otevreny hned");
  await page.locator("#pop-info summary").click();
  check(await page.locator("#sec-http").isVisible(), "klepnuti ukaze zpravy", "zpravy se neukazaly");
  const l = await layout(page);
  check(l.overflow <= 1, "otevreny balonek nepreteka", `balonek preteka o ${l.overflow}px`);
  await page.mouse.click(6, 700);   // prazdne misto u leveho okraje, mimo balonek
  check(!(await infoBox.evaluate(e => (e as HTMLDetailsElement).open)), "klepnuti mimo ho zavre", "balonek zustal otevreny");
  await ctx.close();
}

// --- 4. prirucka ---------------------------------------------------------
console.log("── příručka");
{
  const { ctx, page } = await open("pro-martina/");
  const topo = await page.locator(".topo .node").count();
  check(topo >= 5, `diagram (${topo} uzlu)`, `diagram: ${topo} uzlu`);
  const leaked = await page.evaluate(() => [...document.querySelectorAll("pre code")]
    .filter(c => /^\s*<(rect|text|line|svg|div)\b/.test(c.textContent ?? "")).length);
  check(leaked === 0, "zadny uniknuty raw HTML", `${leaked} code bloku s HTML`);
  const boxes = page.locator("li input[type=checkbox]");
  const n = await boxes.count();
  const dis = await page.evaluate(() => document.querySelectorAll("li input[type=checkbox][disabled]").length);
  check(n > 0 && dis === 0, `${n} aktivnich checkboxu`, `checkboxy ${n}, disabled ${dis}`);
  await boxes.first().check();
  const saved = await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith("amunet:ck:")));
  check(saved, "odskrtnuti se uklada", "odskrtnuti se neuklada");
  const back = await page.locator("a.back").getAttribute("href");
  check(back === "../", "odkaz zpet na rozcestnik", `odkaz zpet: ${back}`);
  await ctx.close();
}

// --- 5. simulace: bez Tailscale DNS / s HSTS --------------------------------
// Oba stavy vypadaji stejne (http://jmeno selze, IP jede), stranka je ale musi
// rozlisit, protoze rada je pokazde jina.
if (server) {
  const HOSTN = "amunet.tail49d1b.ts.net";
  const sims = [
    { name: "bez Tailscale DNS", cause: "dns", note: "#n-dns", other: "#n-hsts",
      args: [`--host-resolver-rules=MAP ${HOSTN} ~NOTFOUND`], hsts: false },
    { name: "HSTS (http://jmeno vynucene na https)", cause: "hsts", note: "#n-hsts", other: "#n-dns",
      args: [], hsts: true },
  ];
  for (const sim of sims) {
    console.log(`── simulace: ${sim.name}`);
    const b2 = await chromium.launch({ executablePath: EXECUTABLE, args: sim.args });
    const ctx = await b2.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    if (sim.hsts) await page.route(u => u.protocol === "http:" && u.hostname === HOSTN, r => r.abort());
    await page.goto(BASE + "sluzby/", { waitUntil: "load" });
    await page.waitForSelector("body[data-probed]", { timeout: 20000 }).catch(() => {});
    const probed = await page.locator("body").getAttribute("data-probed");
    const via = await page.locator('.svc[data-name="Immich"] .via').textContent();
    const href = await page.locator('.svc[data-name="Immich"] a').getAttribute("href");
    check(via === "HTTP · IP" && href === "http://100.70.180.58:2283/", "Immich → IP, odkaz prepsan", `Immich: ${via} ${href}`);
    check(probed === sim.cause, `diagnoza: ${sim.cause}`, `diagnoza: ${probed}, cekano ${sim.cause}`);
    check(!!(await page.locator(sim.note).textContent()), "spravna rada zobrazena", "rada chybi");
    check(!(await page.locator(sim.other).textContent()), "zadna matouci rada navic", "zobrazena i druha rada");
    const sec = sim.cause === "dns" ? "#sec-dns" : "#sec-hsts";
    const warn = await page.locator("#pop-info").evaluate(e => e.classList.contains("has-warn"));
    await page.locator("#pop-info summary").click();
    check(await page.locator(sec).isVisible() && warn, "rada v balonku, odznak cerveny", "rada chybi nebo odznak neni varovny");
    if (sim.cause === "dns") {
      const pp = await page.locator('.svc[data-name="Paperless"] .dot').getAttribute("data-state");
      check(pp === "down", "Paperless (jen https jmeno) = neodpovida", `Paperless: ${pp}`);
    }
    await page.screenshot({ path: join(SHOTS, `sluzby-sim-${sim.cause}.png`), fullPage: true });
    await b2.close();
  }
}

await browser.close();
server?.stop(true);
console.log(`\nScreenshoty: ${SHOTS}`);
console.log(failures === 0 ? "✓ Vse proslo" : `✗ ${failures} problemu`);
process.exit(failures === 0 ? 0 : 1);
