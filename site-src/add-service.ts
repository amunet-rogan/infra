#!/usr/bin/env bun
// Prida amunet-rogan nastroj do data/services.json (a nic jineho).
// Vola ho scripts/onboard-tool.sh; jde spustit i rucne. Idempotentni.
//
//   bun run add-service.ts <user> <tool>
//
// Nazev a popis jsou jen odhad z nazvu nastroje — uprav je v services.json.

import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const [user, tool] = process.argv.slice(2);
const NAME_RE = /^[a-z_][a-z0-9_-]*$/;
if (!user || !tool || !NAME_RE.test(user) || !NAME_RE.test(tool)) {
  console.error("Usage: bun run add-service.ts <user> <tool>");
  process.exit(2);
}

const FILE = join(dirname(fileURLToPath(import.meta.url)), "data", "services.json");
const data = JSON.parse(await readFile(FILE, "utf8"));
const url = `/${user}/${tool}/`;

if (data.services.some((s: any) => s.url === url)) {
  console.log(`  · ${user}/${tool} uz v services.json je — beze zmeny`);
  process.exit(0);
}

// kategorie: sky_max ma "nastroj" (Martinovy nastroje), ostatni vlastni
const cat = user === "sky_max" ? "nastroj" : `nastroj-${user}`;
if (!data.categories[cat]) data.categories[cat] = `Nástroje ${user}`;

const name = tool.replace(/[-_]+/g, " ").replace(/^./, c => c.toUpperCase());
const rank = Math.max(0, ...data.services.map((s: any) => s.rank)) + 1;
data.services.push({ rank, name, cat, url, desc: `${user}/${tool}`, group: "amunet-rogan" });

// stejny format jako rucne: hlavicka odsazena, jedna sluzba na radek
const { services, ...head } = data;
const out = JSON.stringify(head, null, 2).slice(0, -2) + ',\n  "services": [\n' +
  services.map((s: any) => "    " + JSON.stringify(s)).join(",\n") + "\n  ]\n}\n";
JSON.parse(out);
await writeFile(FILE, out, "utf8");
console.log(`  ✓ services.json: "${name}" (rank ${rank}, skupina amunet-rogan) — uprav nazev a popis`);
