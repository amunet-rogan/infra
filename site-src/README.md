# site-src

Zdroj webu na `http://amunet.tail49d1b.ts.net/` (jen v tailnetu).

| URL | Výstup | Zdroj |
|---|---|---|
| `/` | `index.html` | `templates/home.html` + `data/quotes.json` |
| `/sluzby/` | `sluzby/index.html` | `templates/services.html` + `data/services.json` |
| `/pro-martina/` | `pro-martina/index.html` | `templates/handbook.html` + `content/handbook/*.md` |

Sdílené styly: `base.css` (vkládá se jako `{{BASE_CSS}}`).

## Běžné úpravy

- **Nová služba / pořadí** — `data/services.json`. `rank` = výchozí řazení (1 = nahoře),
  musí být unikátní. `"probe": false` pro služby, které browser nedokáže ověřit
  (self-signed cert, nebo `Cross-Origin-Resource-Policy: same-origin` — Vaultwarden).
- **Nový amunet-rogan nástroj** — přidá ho `scripts/onboard-tool.sh` sám (přes
  `add-service.ts`); pak jen oprav `name`/`desc`. Ručně: `bun run add-service.ts <user> <tool>`.
  `bun run build` varuje, když nasazené nástroje (`amunet/tools`) a JSON nesedí;
  záměrně skryté nástroje patří do `ignoreTools`.
- **Cesty ke službám** — služba s `port` (místo `url`) dostane kandidáty
  `https://jméno:port` → `http://jméno:port` → `http://100.70.180.58:port` → `http://LAN:port`;
  stránka je za běhu vyzkouší a použije první, co odpoví. Přesun služby za
  `tailscale serve` se tak projeví sám. `tls: true` = dnes za serve: http přes
  jméno/IP se vynechá, protože serve na plain http vrací 400 a no-cors sonda
  to nerozezná od živé služby.
- **Citáty** — `data/quotes.json`. Jen kanonické texty s odkazem na zdroj;
  většina „Buddhových citátů" na internetu je podvržená.
- **Příručka** — `content/handbook/NN-nazev.md`, první řádek `# Nadpis`.
  Raw HTML nepatří do .md (marked ho rozbije na prvním prázdném řádku) —
  dej ho do `partials/x.html` a do .md napiš `{{PARTIAL:x}}` na samostatný řádek.

## Build, kontrola, nasazení

```bash
bun install          # jen poprvé
bun run build        # → ../amunet/site/ (celý strom se přegeneruje)
bun run check        # Playwright nad lokálním buildem
../scripts/sync-to-amunet.sh
bun run check http://amunet.tail49d1b.ts.net/   # po nasazení
```

`amunet/site/` je commitnutý — nasazení nezávisí na funkčním toolchainu.

## Proč self-contained stránky

nginx catchall nástrojů `location ~ ^/[^/]+/[^/]+/` je regex; stránky jsou proto
pod `^~` prefixy a nemají žádné assety v podadresářích. Nic se nenačítá zvenku.
