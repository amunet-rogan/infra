# Amunet-Rogan Tools Infrastructure Design

**Status**: v4 (final — nginx approach, multi-user URLs, validated routing)
**Date**: 2026-04-20
**Purpose**: Multi-user deployment pipeline for small web tools, hosted on Amunet, accessible over Tailscale at `http://amunet.tail49d1b.ts.net/<user>/<tool>/`.

Initial users: `sky_max` (Martin), `jenda` (future).

---

## 1. Decisions

| Decision | Value | Notes |
|---|---|---|
| GitHub org | `amunet-rogan` | Jenda owns; users are members with admin on their own repos |
| URL routing | Path-based: `/<user>/<tool>/` | nginx strips prefix via trailing-slash `proxy_pass` |
| Hostname | `amunet.tail49d1b.ts.net` | Tailscale MagicDNS; works from any tailnet device |
| Reverse proxy | DSM's built-in nginx | Validated to coexist with DSM default on :80 |
| Port 80 | Stays with DSM | `amunet.synology.me` cert auto-renewal unaffected |
| Runner | One org-level self-hosted runner on Amunet | Separate from Anubis runner |
| Image registry | `ghcr.io/amunet-rogan/<tool>` | |
| GHCR retention | Last 10 tagged + drop untagged after 7d | Configured at org level |
| Tool port range | 8001–8099, bound to `127.0.0.1` only | Not network-reachable |
| Jenda's local repos | `~/Projects/Amunet/` | `infra/`, `tool-template/` |
| Amunet host dir | `/volume1/docker/amunet-rogan/` | Avoids clash with `amunet` hostname |
| App secrets | GitHub Secrets on each tool repo | Injected as `.env` at deploy time |

---

## 2. Architecture

```
┌──────────────┐                                   ┌──────────────┐
│  User PC     │  git push                         │   GitHub     │
│  (Windows /  │──────────────────────────────────▶│   Actions    │
│   macOS) +   │                                   │              │
│   Tailscale  │                                   └──────┬───────┘
└──────────────┘                                          │
       │                                                  │
       │ browser:                                         │
       │ http://amunet.tail49d1b.ts.net/<user>/<tool>/    │
       │                                                  │
       ▼                                                  │ (1) build + push
┌────────────────────────────────────────┐                ▼
│       Amunet (Synology DS920+)         │        ┌──────────────────────┐
│                                        │        │  GHCR                │
│   ┌──────────────┐                     │◀──────│  ghcr.io/amunet-     │
│   │  DSM nginx   │                     │  (3)   │  rogan/<tool>           │
│   │     :80      │                     │        └──────────────────────┘
│   │  + custom    │                     │
│   │  conf        │                     │        ┌──────────────────────┐
│   └──────┬───────┘                     │        │  Org runner on       │
│          │ proxy_pass 127.0.0.1:PORT   │◀──────│  Amunet              │
│          ▼                             │ (2)    │  docker compose up   │
│   ┌──────────────┐  ┌──────────────┐  │        └──────────────────────┘
│   │  Martin's    │  │  Jenda's     │  │
│   │  hello-world │  │  dashboard   │  │
│   │  :8001       │  │  :8002       │  │
│   └──────────────┘  └──────────────┘  │
└────────────────────────────────────────┘
```

**Routing validated 2026-04-20**: empty-site server block with `server_name amunet.tail49d1b.ts.net` wins over DSM's default on :80 for MagicDNS hostname requests. DSM behavior for requests to `http://100.70.180.58/` (IP) and `http://amunet/` (short hostname) remains unchanged.

---

## 3. Repositories

### 3.1 `amunet-rogan/infra` (Jenda, private) — `~/Projects/Amunet/infra/`

Source of truth for `/volume1/docker/amunet-rogan/` and the custom nginx conf on Amunet. Contains the reusable workflow.

```
infra/
├── README.md
├── docs/
│   ├── design-v4.md                    ← this file
│   ├── onboarding-new-tool.md
│   ├── user-onboarding-windows.md      ← for new users like Martin
│   └── runbook.md
├── amunet/
│   ├── nginx/
│   │   └── http.amunet-rogan.conf      ← generated; deployed to /etc/nginx/conf.d/
│   ├── runner/
│   │   ├── docker-compose.yml          ← org-level self-hosted runner
│   │   └── .env.example
│   └── tools/                          ← per-tool config.env files, mirrored to NAS
│       └── .gitkeep
├── scripts/
│   ├── onboard-tool.sh                 ← (user, tool) → port alloc + nginx block
│   ├── regenerate-nginx-conf.sh        ← rebuilds http.amunet-rogan.conf from all tools
│   └── sync-to-amunet.sh               ← rsync amunet/ + reload nginx
├── templates/
│   ├── nginx-location.template
│   └── docker-compose.template.yml
└── .github/
    └── workflows/
        └── deploy.yml                  ← REUSABLE — called by tool repos
```

### 3.2 `amunet-rogan/tool-template` (Jenda, public, template flag on) — `~/Projects/Amunet/tool-template/`

Users click **Use this template**, create their own repo in the org.

```
tool-template/
├── README.md                           ← user-facing, plain language
├── app/
│   ├── app.py                          ← Flask hello-world
│   └── requirements.txt
├── Dockerfile                          ← minimal, rarely touched
├── .env.example                        ← user declares needed secrets
├── .gitignore
├── .dockerignore
└── .github/
    └── workflows/
        └── deploy.yml                  ← 5-liner
```

### 3.3 User tool repos — `amunet-rogan/<tool>`

Repo names are just the tool name, no user prefix. User identity comes from the template's hardcoded `user:` input in its workflow. Examples:
```
amunet-rogan/hello-world
amunet-rogan/insta-counter
amunet-rogan/lyrion-dashboard
```
Repo names must be unique within the org, which GitHub enforces automatically.

---

## 4. Amunet directory layout

```
/volume1/docker/amunet-rogan/
├── runner/
│   ├── docker-compose.yml
│   ├── .env                            ← ORG_RUNNER_TOKEN (chmod 600)
│   └── data/                           ← runner work directory
└── tools/
    ├── sky_max/
    │   ├── hello-world/
    │   │   ├── config.env              ← USER, TOOL, INTERNAL_PORT
    │   │   ├── docker-compose.yml      ← generated at deploy
    │   │   └── .env                    ← generated from GitHub Secrets
    │   └── insta-counter/
    └── jenda/
        └── lyrion-dashboard/
```

### Nginx config location

```
/etc/nginx/conf.d/
└── http.amunet-rogan.conf              ← sync'd from infra repo
```

This path survives DSM updates — unlike `/usr/syno/share/nginx/*.mustache`.

---

## 5. nginx configuration

### 5.1 The generated file

`/etc/nginx/conf.d/http.amunet-rogan.conf`:

```nginx
# Auto-generated by amunet-rogan/infra
# DO NOT EDIT BY HAND. Source: scripts/regenerate-nginx-conf.sh

server {
    listen 80;
    listen [::]:80;
    server_name amunet.tail49d1b.ts.net;

    # Friendly landing page for /
    location = / {
        default_type text/plain;
        return 200 "amunet-rogan tools\nSee GitHub: https://github.com/amunet-rogan\n";
    }

    # Unknown tool → 404 with helpful message
    location ~ ^/[^/]+/[^/]+/ {
        return 404 "Tool not found. Contact Jenda to onboard.\n";
    }

    # === sky_max/hello-world (port 8001) ===
    location /sky_max/hello-world/ {
        proxy_pass http://127.0.0.1:8001/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /sky_max/hello-world;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    # === jenda/lyrion-dashboard (port 8002) ===
    # ...
}
```

**Key details**:

- **`server_name amunet.tail49d1b.ts.net`** — narrow match, lets DSM keep everything else
- **`location = /`** — equality match for root only, so it doesn't capture tool paths
- **Unknown-tool location** — regex matches any `/foo/bar/` pattern, returns 404. Comes BEFORE the specific tool locations in nginx logic (nginx resolves specific prefixes first), acting as a fallthrough.
- **`proxy_pass http://127.0.0.1:<port>/`** — trailing slash strips `/sky_max/hello-world/` so apps see plain `/`
- **`X-Forwarded-Prefix`** — available to apps that need to generate absolute URLs
- **Upgrade/Connection headers** — WebSocket support for free

### 5.2 Per-tool template

`templates/nginx-location.template`:

```nginx
    # === ${USER}/${TOOL} (port ${INTERNAL_PORT}) ===
    location /${USER}/${TOOL}/ {
        proxy_pass http://127.0.0.1:${INTERNAL_PORT}/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /${USER}/${TOOL};
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
```

### 5.3 Validation and reload

After any change:

```bash
sudo nginx -t                          # validate first (non-destructive)
sudo synosystemctl reload nginx        # zero-downtime reload
```

If `nginx -t` fails, nothing gets reloaded and the live config stays intact.

---

## 6. Port allocation

Range 8001–8099, allocated sequentially, bound to `127.0.0.1` only.

**`onboard-tool.sh` algorithm**:
1. Validate user + tool names (lowercase + underscore + hyphen, match `[a-z_][a-z0-9_-]*`)
2. Check for collision (user/tool already exists in `amunet/tools/`)
3. Scan all `amunet/tools/*/*/config.env` → find max `INTERNAL_PORT` → assign next
4. Create `amunet/tools/<user>/<tool>/config.env`
5. Re-render `http.amunet-rogan.conf`
6. Commit to git, sync to Amunet, reload nginx

**Freed ports not recycled** — if a tool is deleted and a new one is created, it gets a fresh port. Keeps historical user/tool/port mapping stable in git history.

---

## 7. Deploy flow

Triggered on `git push origin main` in any tool repo.

1. **GitHub webhook** fires the tool repo's 5-line workflow.

2. **`build` job** (GitHub-hosted `ubuntu-latest`):
   - Checkout code
   - Log in to GHCR with `GITHUB_TOKEN`
   - `docker buildx build` → `ghcr.io/amunet-rogan/<tool>:sha-<commit>` + `:latest`
   - Push both tags

3. **`deploy` job** (`runs-on: [self-hosted, amunet, amunet-rogan]`):
   - Read `/volume1/docker/amunet-rogan/tools/<user>/<tool>/config.env` → `INTERNAL_PORT`
   - Write `.env` from inherited secrets
   - Render `docker-compose.yml` from template (image tag + port binding)
   - `docker compose pull && docker compose up -d --remove-orphans`

4. No nginx reload required — the location block and port don't change across deploys.

Wall time: ~1–2 min.

---

## 8. Reusable workflow contract

```yaml
# Caller workflow in any tool repo — the entire file
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    uses: amunet-rogan/infra/.github/workflows/deploy.yml@v1
    with:
      user: sky_max
      tool: hello-world
      python-version: '3.12'            # optional, default '3.12'
    secrets: inherit
```

Three inputs (two required), one secrets directive. Port is looked up on Amunet, not supplied here — users can't change their tool's port.

### 8.1 Generated `docker-compose.yml`

Rendered at deploy time from `templates/docker-compose.template.yml`:

```yaml
services:
  app:
    image: ghcr.io/amunet-rogan/${USER}-${TOOL}:sha-${COMMIT_SHA}
    container_name: amunet-rogan-${USER}-${TOOL}
    restart: unless-stopped
    env_file: .env
    ports:
      - "127.0.0.1:${INTERNAL_PORT}:8000"   # container always listens on :8000
```

Loopback binding — no network exposure outside DSM nginx proxying.

### 8.2 Workflow versioning

- `v1` tag = current stable
- Non-breaking improvements ship on `v1` continuously
- Breaking changes cut `v2` — callers migrate deliberately by changing `@v1` → `@v2`

---

## 9. Onboarding a new tool

Jenda, ~5 min per first tool by a new user, less for subsequent tools:

1. User clicks **Use this template** on `amunet-rogan/tool-template`, creates repo `amunet-rogan/<tool>          ` in the org.

2. On Jenda's Mac:
   ```bash
   cd ~/Projects/Amunet/infra
   ./scripts/onboard-tool.sh sky_max hello-world
   ```
   Script allocates port, writes nginx block, commits, syncs to Amunet, reloads nginx.

3. User edits `.env.example` in their repo, declares secrets needed. Adds values in GitHub UI → Settings → Secrets → Actions.

4. User pushes. Tool live at `http://amunet.tail49d1b.ts.net/<user>/<tool>/`.

Steps 3–4 are user-only from then on.

---

## 10. Secrets

| Secret | Location | Usage |
|---|---|---|
| User's app secrets | GitHub Secrets on tool repo | `secrets: inherit` → `.env` on Amunet |
| GHCR push token | Built-in `GITHUB_TOKEN` | Auto in workflow |
| Runner registration token | `/volume1/docker/amunet-rogan/runner/.env` (chmod 600) | Read at runner startup |
| Shared org secrets | Org-level GitHub Secrets | Available to all repos in org |

Flow: Martin pastes `META_ACCESS_TOKEN` value into GitHub UI → deploy writes `.env` on Amunet chmod 600 → container mounts via `env_file:`. Martin sees the token once; Jenda never sees it.

---

## 11. Security posture

- **No public exposure.** Tailscale tailnet only.
- **No SSH for users.** Deploys run through the runner.
- **Loopback-only tool binding.** `127.0.0.1:<port>` — no external network reach.
- **User-level namespacing.** User identity is encoded in each template's hardcoded `user:` workflow input. Martin can be granted admin only on the repos he creates (via GitHub Teams or direct repo access). Jenda owns the org.
- **Runner isolation.** Registered to org only; ephemeral mode (see §13); no cross-tool file access.
- **Image provenance.** Commit SHA in every tag; rollback = redeploy older tag.
- **2FA mandatory** for all org members.

Compromise analysis: if a user's GitHub account is taken over, attacker can deploy malicious code only to that user's tools (visible to Tailscale only). Cannot touch other users' tools, cannot modify pipeline, cannot reach other Amunet services.

---

## 12. Build order

1. **Configure `amunet-rogan` org settings** (Jenda, 15 min):
   - Require 2FA for members
   - Base permission: Read
   - Default branch name: `main`
   - Actions: allow all (trusted org)
2. **Generate org-level runner token** (Settings → Actions → Runners → New self-hosted → copy).
3. **Configure GHCR retention policy** at org level (10 tagged, 7d untagged).
4. **Scaffold `~/Projects/Amunet/infra/`** — dir structure per §3.1, README, this doc.
5. **Write `amunet/runner/docker-compose.yml`** — runner container, verify it registers.
6. **Write nginx templates + onboard/regenerate scripts.** Test with a dummy tool.
7. **Write `scripts/sync-to-amunet.sh`** — rsync + `nginx -t` + reload.
8. **Write reusable workflow** `.github/workflows/deploy.yml`. Tag `v1`.
9. **Scaffold `~/Projects/Amunet/tool-template/`** — Flask hello-world, Dockerfile, 5-line caller.
10. **End-to-end test** — onboard `sky_max/hello-world`, push, verify live.
11. **Write `docs/user-onboarding-windows.md`** — Martin's first-run guide.
12. **Team setup** — create `sky_max` team, invite Martin, grant admin on his repo(s).
13. **Hand-off** to Martin.

Steps 1–10 Jenda-only. Step 11 is Martin's first read.

Estimated focused work: 3–4 hours for steps 4–10.

---

## 13. Open items

- [ ] **Ephemeral vs persistent runner** — ephemeral = clean state per job, ~10s cold start. Recommended for this volume.
- [ ] **Auto-sync infra → Amunet** — v1 uses manual `scripts/sync-to-amunet.sh`. Adding a workflow that auto-syncs on push to `main` of `infra` is a natural v2.
- [ ] **Tool starter stack** — Flask first. Add Streamlit template on demand if user wants data dashboards.
- [ ] **Backup** — confirm `/volume1/docker/amunet-rogan/tools/*/*/.env` is in Synology's snapshot/backup routine.
- [ ] **Single-user initial rollout** — Martin (`sky_max`) first; Jenda's own `jenda` tools (using a forked template) come later as second-user validation of the multi-user model.

---

## 14. Relationship to Anubis

`amunet-rogan` is a sibling project to Anubis, not a successor or subsystem. They share:

- Amunet as the host
- Self-hosted runner pattern (separate runners, same Docker engine)
- Per-project `/volume1/docker/<project>/` directory convention

They don't share:

- Repos (Anubis is on GitHub + Forgejo dual-track; `amunet-rogan` is GitHub-only)
- Reverse proxy (Anubis has no web UI; `amunet-rogan` is all about web tools)
- Runners (registered to different scopes)
- Secrets (completely separate)

If patterns factor out naturally during build, fine. No premature abstraction.
