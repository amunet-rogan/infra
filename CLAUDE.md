# amunet-rogan/infra — pokyny pro agenty

Infrastruktura pro nástroje uživatelů (`sky_max`, …) na Amunetu a web
`http://amunet.tail49d1b.ts.net/` (rozcestník, `/sluzby/`, `/pro-martina/`).

## Nástroje: onboarding a popis

Jeden příkaz, běží jen na čistém `main`, stageuje explicitní cesty:

```bash
./scripts/tool.sh new sky_max/<tool> --name "…" --desc "…"   # port, config.env, nginx, web → commit → push → sync
./scripts/tool.sh describe sky_max/<tool> --desc "…"         # jen název/popis na /sluzby/ → commit → push → sync webu
./scripts/tool.sh list
./scripts/tool.sh                                            # interaktivně
```

`new` končí `sync-to-amunet.sh`, který chce sudo heslo na Amunetu → **spouští
uživatel**, ne agent. Agent může připravit commit: `--no-sync` (commit + push)
nebo `--no-push` (jen lokálně). `describe` synchronizuje jen web
(`sync-to-amunet.sh --site-only`, bez sudo).

Pod kapotou: `onboard-tool.sh` (port, config.env, nginx) a `site-src/add-service.ts`
(záznam v `services.json`). `bun run build` varuje (`⚠`), když se `amunet/tools`
a `services.json` rozejdou — `tool.sh` pak nekomitne. Offboarding: smaž `config.env`
i záznam v `services.json`.

Neupravuj skripty v checkoutu, ze kterého uživatel zrovna spouští sync — bash čte
skript z disku průběžně. Pracuj ve worktree.

## Web

Zdroj a detaily: `site-src/README.md`. Před nasazením `bun run check`,
po nasazení `bun run check http://amunet.tail49d1b.ts.net/`.

## Pravidla

- `git add` jen explicitní cesty, nikdy `git add .`.
- Nic neměň na Amunetu bez potvrzení uživatele.
- `amunet/nginx/http.amunet-rogan.conf` je generovaný — edituj `scripts/regenerate-nginx-conf.sh`.
