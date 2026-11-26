#!/usr/bin/env bun
// Prida nebo upravi amunet-rogan nastroj v data/services.json (a nic jineho).
// Vola ho scripts/tool.sh (pres onboard-tool.sh); jde spustit i rucne.
//
//   bun run add-service.ts <user> <tool>                         pridat (nazev odhadne z nazvu)
//   bun run add-service.ts <user> <tool> --name "…" --desc "…"   pridat / upravit
//
// Bez --name/--desc je idempotentni: existujici zaznam nechá byt.

import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (flag: string) => {
  const i = args.indexOf(flag);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith("--")) { console.error(`${flag} potrebuje hodnotu`); process.exit(2); }
  args.splice(i, 2);
  return v.trim();
};
const newName = opt("--name");
const newDesc = opt("--desc");
const [user, tool] = args;
const NAME_RE = /^[a-z_][a-z0-9_-]*$/;
if (!user || !tool || args.length !== 2 || !NAME_RE.test(user) || !NAME_RE.test(tool)) {
  console.error('Usage: bun run add-service.ts <user> <tool> [--name "…"] [--desc "…"]');
  process.exit(2);
}
if (newName === "" || newDesc === "") { console.error("--name / --desc nesmi byt prazdne"); process.exit(2); }

const FILE = join(dirname(fileURLToPath(import.meta.url)), "data", "services.json");
const data = JSON.parse(await readFile(FILE, "utf8"));
const url = `/${user}/${tool}/`;
const existing = data.services.find((s: any) => s.url === url);

if (existing) {
  if (newName === undefined && newDesc === undefined) {
    console.log(`  · ${user}/${tool} uz v services.json je — beze zmeny`);
    process.exit(0);
  }
  if (newName !== undefined) existing.name = newName;
  if (newDesc !== undefined) existing.desc = newDesc;
  console.log(`  ✓ services.json: ${user}/${tool} → "${existing.name}" — ${existing.desc}`);
} else {
  // kategorie: sky_max ma "nastroj" (Martinovy nastroje), ostatni vlastni
  const cat = user === "sky_max" ? "nastroj" : `nastroj-${user}`;
  if (!data.categories[cat]) data.categories[cat] = `Nástroje ${user}`;
  const name = newName ?? tool.replace(/[-_]+/g, " ").replace(/^./, c => c.toUpperCase());
  const desc = newDesc ?? `${user}/${tool}`;
  const rank = Math.max(0, ...data.services.map((s: any) => s.rank)) + 1;
  data.services.push({ rank, name, cat, url, desc, group: "amunet-rogan" });
  console.log(`  ✓ services.json: "${name}" (rank ${rank}, skupina amunet-rogan)`);
}

// stejny format jako rucne: hlavicka odsazena, jedna sluzba na radek
const { services, ...head } = data;
const out = JSON.stringify(head, null, 2).slice(0, -2) + ',\n  "services": [\n' +
  services.map((s: any) => "    " + JSON.stringify(s)).join(",\n") + "\n  ]\n}\n";
JSON.parse(out);
await writeFile(FILE, out, "utf8");
