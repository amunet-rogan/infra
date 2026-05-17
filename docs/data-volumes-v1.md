# Data volumes for amunet-rogan tools — v1

**Status**: v1 (initial)
**Date**: 2026-05-17
**Purpose**: Give each tool persistent filesystem and SQLite storage with zero credential management. Isolation is per-user; tools owned by the same user share storage so they can interconnect.

---

## Goal

Two persistence affordances injected into every deployed tool:

1. A **filesystem data dir** for arbitrary files.
2. A **SQLite database file** for structured state.

Both are bind-mounted at deploy time. The tool author never thinks about credentials, connection strings, or volume creation — just opens the env-var paths and uses them.

---

## Isolation model

- **Across users**: hard. A `sky_max` tool's container only has `/volume1/docker/amunet-rogan/data/sky_max/` and `.../db/sky_max.db` bind-mounted. `jenda`'s tree is invisible.
- **Within a user**: shared. All `sky_max` tools see the same `/data` and the same `/db/app.db`. This is intentional — tools can read each other's files and query each other's tables to interconnect.
- **Same-user discipline**: enforced socially via the CLAUDE.md contract in the tool template. Tools put their files under `/data/<tool-name>/` and prefix their tables with `<tool_slug>_`. Drift is possible; the template instructions are the main mitigation.

---

## Host layout

```
/volume1/docker/amunet-rogan/
├── data/
│   ├── sky_max/          ← entire dir → /data in every sky_max tool
│   └── jenda/
└── db/
    ├── sky_max.db        ← one SQLite file → /db/app.db
    └── jenda.db
```

- Per-user data dirs: mode `0700`, owned `1026:100` (jendalen:users).
- Per-user `.db` files: mode `0600`, owned `1026:100`.
- Created idempotently by the deploy workflow on every run — first tool for a new user provisions them, subsequent tools reuse.

---

## Container contract

Two env vars are injected by the reusable workflow. Tools read them; they never hardcode paths.

| Env var     | Default          | Meaning                                  |
|-------------|------------------|------------------------------------------|
| `DATA_DIR`  | `/data`          | Shared filesystem dir for this user      |
| `DB_PATH`   | `/db/app.db`     | Shared SQLite file for this user         |
| `TOOL_NAME` | (already exists) | This tool's repo name, e.g. `smoke-test` |

**Tool author rules** (also written into `tool-template/CLAUDE.md`):

- Put your files under `$DATA_DIR/$TOOL_NAME/...`. Read siblings freely; write only your own subtree.
- Prefix your SQLite tables with `${TOOL_NAME//-/_}_`. So `smoke-test` → tables like `smoke_test_counter`, `smoke_test_events`. Read sibling tables freely; mutate them only by mutual agreement.
- On first connect, set:
  ```
  PRAGMA journal_mode=WAL;
  PRAGMA busy_timeout=5000;
  ```
- For Node 24 tools, use the built-in `node:sqlite` module — zero deps.

---

## Changes to the reusable workflow

`infra/.github/workflows/deploy.yml`, runner side:

1. **New step** before "Render docker-compose.yml":
   ```yaml
   - name: Prepare data volumes
     run: |
       user="${{ steps.paths.outputs.user }}"
       install -d -o 1026 -g 100 -m 0700 \
         "/volume1/docker/amunet-rogan/data/${user}" \
         "/volume1/docker/amunet-rogan/db"
       db_file="/volume1/docker/amunet-rogan/db/${user}.db"
       if [[ ! -f "$db_file" ]]; then
         touch "$db_file"
         chown 1026:100 "$db_file"
         chmod 0600 "$db_file"
       fi
   ```
   No `sudo`: the runner container runs as root with `/volume1/docker` bind-mounted rw.

2. **Compose heredoc** gains `volumes:` and two `environment:` entries:
   ```yaml
   environment:
     TOOL_NAME: <tool>
     DATA_DIR: /data
     DB_PATH: /db/app.db
   volumes:
     - /volume1/docker/amunet-rogan/data/<user>:/data
     - /volume1/docker/amunet-rogan/db/<user>.db:/db/app.db
   ```

Both changes are backward-compatible: tools that don't read `DATA_DIR`/`DB_PATH` simply gain mounts they ignore.

---

## Smoke-test verification

The smoke-test repo's `server.js` (a copy of `tool-template/server.js`) gains three endpoints exercising both stores:

- `POST /increment` — bumps a SQLite counter, returns the new value.
- `POST /touch` — writes a timestamped file under `$DATA_DIR/$TOOL_NAME/`.
- `GET /` — shows current counter, this tool's files, and sibling tools (dirs other than ours under `$DATA_DIR/..`).

Manual test sequence after deploy:

1. `curl -X POST http://amunet.tail49d1b.ts.net/sky_max/smoke-test/increment` ×2 → counter is `2`.
2. `gh workflow run deploy.yml --repo amunet-rogan/smoke-test` → forces a redeploy.
3. `curl http://amunet.tail49d1b.ts.net/sky_max/smoke-test/` → counter still `2` ✓ DB persisted.
4. `curl -X POST -d "hello" http://amunet.tail49d1b.ts.net/sky_max/smoke-test/touch` → file appears in `/volume1/docker/amunet-rogan/data/sky_max/smoke-test/`. Redeploy. File still there ✓ FS persisted.
5. `ssh amunet 'ls /volume1/docker/amunet-rogan/data/sky_max/ /volume1/docker/amunet-rogan/db/'` → shows the per-user dir and `.db` file.

Cross-tool interop is demonstrable by deploying a second sky_max tool that reads from `$DATA_DIR/smoke-test/` or queries `smoke_test_*` tables; not automated in CI.

---

## Trade-offs accepted

- **Blast radius**: a buggy sky_max tool can write garbage anywhere under `/data/sky_max/` and into any table in `sky_max.db`. Isolation within a user is social, not enforced.
- **Schema discipline**: relies on the table-prefix convention. The CLAUDE.md instruction is the main mitigation.
- **SQLite contention**: one writer at a time per user across all their tools. With WAL + a 5 s busy_timeout, invisible at marketing-tool traffic levels. If a user's tools ever go chatty, that user gets moved to Postgres — separate spec.

---

## Backups

Add to the infra runbook (separate doc):

- `/volume1/docker/amunet-rogan/data/` and `/volume1/docker/amunet-rogan/db/` belong in Synology Hyper Backup's selection for the `docker` volume.
- SQLite files are safe to back up while open via filesystem snapshots (Btrfs snapshot is atomic) or via `sqlite3 db.sqlite ".backup target.db"`. Hyper Backup's volume-level snapshot is sufficient.

---

## Open follow-ups (not v1)

- Postgres opt-in for users whose tools outgrow SQLite (would add a single shared `postgres` service with per-user role + database; each user's tools all use the same auto-injected DSN).
- A maintenance script that lists `du -sh /volume1/docker/amunet-rogan/data/*` and `.db` sizes, for capacity visibility.
- A `sqlite3 ... ".tables"` health-check endpoint to verify DB write access at deploy time.
