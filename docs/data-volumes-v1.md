# Data volumes for amunet-rogan tools — v1

**Status**: v1 — implemented, verified end-to-end on `sky_max/smoke-test`
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
    ├── sky_max/          ← directory → /db in every sky_max tool
    │   ├── app.db        ← main SQLite database
    │   ├── app.db-shm    ← (auto-created) shared memory
    │   └── app.db-wal    ← (auto-created) write-ahead log
    └── jenda/
```

- Per-user data dirs: mode `0700`, owned `1026:100` (jendalen:users).
- Per-user `db/<user>/` dirs: mode `0700`, owned `1026:100`. SQLite creates `app.db`/`-shm`/`-wal` inside, all owned `1026:100`.
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
     env:
       AR_USER: ${{ steps.paths.outputs.user }}
     run: |
       docker run --rm \
         -v /volume1/docker/amunet-rogan:/x \
         -e AR_USER \
         alpine:3 sh -ec '
           install -d -o 1026 -g 100 -m 0700 "/x/data/$AR_USER" "/x/db"
           db="/x/db/$AR_USER.db"
           if [ ! -f "$db" ]; then
             touch "$db"
             chown 1026:100 "$db"
             chmod 0600 "$db"
           fi
         '
   ```
   The prep runs in a **throwaway alpine container**, not directly in the runner.
   The runner's compose only bind-mounts `/volume1/docker/amunet-rogan/tools` — it
   does NOT see `data/` or `db/`. Running `install -d` directly in the runner
   would create those paths inside the runner's container filesystem, and the
   host Docker daemon (which mounts them into the tool container) would then
   fail with "Bind mount failed: '/volume1/docker/amunet-rogan/data/sky_max'
   does not exist". The throwaway container mounts the parent dir explicitly,
   so all writes land on host inodes. No `sudo` needed; the alpine container
   runs as root with the host bind.

2. **Compose heredoc** gains `volumes:` and two `environment:` entries:
   ```yaml
   environment:
     TOOL_NAME: <tool>
     DATA_DIR: /data
     DB_PATH: /db/app.db
   volumes:
     - /volume1/docker/amunet-rogan/data/<user>:/data
     - /volume1/docker/amunet-rogan/db/<user>:/db
   ```

Both changes are backward-compatible: tools that don't read `DATA_DIR`/`DB_PATH` simply gain mounts they ignore.

---

## Smoke-test verification (✅ passed 2026-05-17)

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

## Implementation notes (post-shipping)

What we hit and how it shook out, for future-me or anyone debugging this.

### Runner mount scope is the gotcha

The self-hosted runner only bind-mounts `/volume1/docker/amunet-rogan/tools`
(see `amunet/runner/docker-compose.yml`). Earlier drafts of this spec assumed
the runner could `install -d` against the host filesystem directly — it can't.
A workflow step that touches `data/` or `db/` paths must do it via a
throwaway container with the appropriate host bind (see "Changes to the
reusable workflow" above).

Alternative considered: broaden the runner's mount to all of
`/volume1/docker/amunet-rogan/`. Rejected because (a) it expands the runner's
blast radius unnecessarily, (b) it would require recreating the runner
container on Amunet, and (c) the throwaway-container pattern is self-contained
and works with no infrastructure change.

### File ownership inside the container

Files the tool container writes into `$DATA_DIR` land on the host as
`root:root` (the Node image runs as root by default). The **parent dirs**
we provision are `jendalen:users 0700`, so:

- Cross-user isolation: still enforced (only `jendalen` group can enter
  `data/<user>/` on the host).
- jendalen-side maintenance: requires `sudo` to delete or modify files the
  container wrote.

Acceptable for now. If it ever bites, the fix is `USER node` (or similar) in
the template Dockerfile — but that constrains tools that want to bind to
privileged ports inside the container, so deferred.

### Host-side SQLite reads see stale data when WAL is hot

When the tool container is actively writing, `/usr/bin/sqlite3` on the
Amunet host opening the same `.db` file may report "no such table" or
out-of-date rows. That's normal SQLite WAL behavior — committed data lives
in the `.db-wal` sidecar until the next checkpoint. Two ways to inspect:

1. Stop the container first: `docker stop amunet-rogan-<user>-<tool>` →
   SQLite checkpoints on close → host reader sees current state. Restart
   after with `docker compose up -d`.
2. Or use a sqlite3 build that reads WAL: `sqlite3` 3.7.0+ does this, but
   only if the WAL file is accessible and the lock isn't held. Easier path
   is just to query through the running tool's HTTP API.

This is a debugging note, not a bug.

### `v1` tag policy

We push to `main` and **move the `v1` tag forward** in place. Callers pin
`amunet-rogan/infra/.github/workflows/deploy.yml@v1`. This means every tool's
next deploy picks up workflow changes automatically. Acceptable because
v1-line changes are kept backward-compatible (a tool that doesn't read
`DATA_DIR`/`DB_PATH` just gains mounts it ignores). If we ever ship a
breaking workflow change, cut `v2` and let tools opt in.

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


---

## Changelog

### v1.1 — 2026-05-26: DB mount fix

The v1 implementation bind-mounted a single SQLite file (`db/<user>.db` → `/db/app.db`). SQLite in WAL mode (which the CLAUDE.md contract enables) writes three files: `app.db`, `app.db-shm`, `app.db-wal`. Only the first was persisted; the latter two lived inside the ephemeral container. On container recreate, uncommitted WAL data was lost — confirmed in the wild after `sky_max/losovani-soutezi` started losing rows between deploys.

Fix: bind-mount the directory (`db/<user>/`) instead of the file (`db/<user>.db`). SQLite's full three-file set now persists together. No application code changes needed; `DB_PATH=/db/app.db` is unchanged.

Migration: existing `db/<user>.db` files were moved to `db/<user>/app.db` after a manual `PRAGMA wal_checkpoint(TRUNCATE)` to flush in-flight WAL data into the main file. Old single-file mounts are gone.
