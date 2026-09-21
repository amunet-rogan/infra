# amunet-rogan/infra — pokyny pro agenty

Infrastruktura pro nástroje uživatelů (`sky_max`, …) na Amunetu a web
`http://amunet.tail49d1b.ts.net/` (rozcestník, `/sluzby/`, `/pro-martina/`).

## Onboarding nového nástroje

```bash
./scripts/onboard-tool.sh <user> <tool>
```

Skript přidělí port, zapíše `amunet/tools/<user>/<tool>/config.env`, přegeneruje
nginx conf, **přidá nástroj do `site-src/data/services.json` a přebuilduje web**.
Potom vždy:

1. V `site-src/data/services.json` nahraď odhadnutý `name` a `desc` skutečnými
   (zeptej se, co nástroj dělá) a spusť `cd site-src && bun run build`.
2. Commitni **i** `amunet/site/` a `site-src/data/services.json`, ne jen `amunet/tools`.
3. `./scripts/sync-to-amunet.sh` (potřebuje sudo heslo na Amunetu → spouští uživatel).

`bun run build` varuje (`⚠`), když se `amunet/tools` a `services.json` rozejdou —
varování neignoruj. Offboarding: smaž `config.env` i záznam v `services.json`.

## Web

Zdroj a detaily: `site-src/README.md`. Před nasazením `bun run check`,
po nasazení `bun run check http://amunet.tail49d1b.ts.net/`.

## Pravidla

- `git add` jen explicitní cesty, nikdy `git add .`.
- Nic neměň na Amunetu bez potvrzení uživatele.
- `amunet/nginx/http.amunet-rogan.conf` je generovaný — edituj `scripts/regenerate-nginx-conf.sh`.
