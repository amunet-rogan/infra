# amunet-rogan / infra

Deploy pipeline for small web tools hosted on Amunet (Jenda's Synology NAS),
accessible over Tailscale at `http://amunet.tail49d1b.ts.net/<user>/<tool>/`.

See [`docs/design-v4.md`](docs/design-v4.md) for the full architecture.

## What lives here

- **`.github/workflows/deploy.yml`** — the reusable GitHub Actions workflow
  that every tool repo calls. Does `docker build + push` on GitHub-hosted
  runners, then `docker compose up` on the self-hosted Amunet runner.
- **`amunet/`** — everything that gets synced to `/volume1/docker/amunet-rogan/` on the NAS.
  - `nginx/http.amunet-rogan.conf` — routes `/<user>/<tool>/` via DSM's nginx (generated)
  - `runner/` — self-hosted GitHub Actions runner container config
  - `tools/` — per-tool `config.env` files (port assignments, onboarding timestamps)
- **`scripts/`** — onboarding and sync tooling (run locally on Jenda's Mac)
- **`templates/`** — nginx location template used by the regenerate script

## Onboarding a new tool

```bash
cd ~/Projects/Amunet/infra
./scripts/onboard-tool.sh <user> <tool>
# e.g. ./scripts/onboard-tool.sh sky_max instagram-stats

# Review what changed
git status
git diff

# Commit and push
git add amunet/
git commit -m "Onboard <user>/<tool>"
git push

# Sync to Amunet (reloads nginx)
./scripts/sync-to-amunet.sh
```

After this, the tool's owner can create a repo in `amunet-rogan/` from
`tool-template` (with the matching name), push code, and it deploys.

## First-time setup

One-time work to bring this infra to life:

1. **Create a GitHub PAT** for the runner
   - https://github.com/settings/tokens/new
   - Scope: `admin:org`, expiration 1 year
2. **Deploy the runner container on Amunet**
   ```bash
   # On your Mac
   cd ~/Projects/Amunet/infra
   # Populate .env file (NOT committed):
   cp amunet/runner/.env.example /tmp/runner.env
   # Edit /tmp/runner.env, put the PAT into ACCESS_TOKEN
   scp /tmp/runner.env amunet:/volume1/docker/amunet-rogan/runner/.env
   rm /tmp/runner.env
   # Sync runner compose to Amunet and start it
   ./scripts/sync-to-amunet.sh
   ssh amunet "cd /volume1/docker/amunet-rogan/runner && sudo docker compose up -d"
   ```
3. **Verify runner registration** — org settings → Actions → Runners should
   show `amunet-rogan-runner` as Idle.
4. **Configure GHCR retention** — org settings → Packages → pick your policy
   (recommend: keep last 10 tagged, drop untagged after 7d).
5. **Tag this repo** — `git tag v1 && git push origin v1` so tool repos can
   reference `@v1`.

## Versioning

Tool repos reference `amunet-rogan/infra/.github/workflows/deploy.yml@v1`.
The `v1` tag is updated as improvements ship on a rolling basis. Breaking
changes cut a `v2` tag; callers migrate deliberately.

## Security model

- Tools bind to `127.0.0.1:<port>` only — not network-reachable outside DSM nginx
- Nginx routes only explicitly-onboarded `<user>/<tool>` paths; everything else is 404 or DSM
- Tailscale-only access; no public internet exposure
- Runner registered at org scope only — a compromised tool repo can't target other orgs
- Per-tool `.env` files are chmod 600, separate per tool; tools can't read each others' secrets

## Related repos

- `amunet-rogan/tool-template` — template repo users copy to start a new tool
