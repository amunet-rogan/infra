#!/usr/bin/env bash
# One command for amunet-rogan tools.
#
#   ./scripts/tool.sh                                         interactive
#   ./scripts/tool.sh new      <user>/<tool> [--name "…"] [--desc "…"]
#   ./scripts/tool.sh describe <user>/<tool> [--name "…"] [--desc "…"]
#   ./scripts/tool.sh list
#
#   new       onboard: port + config.env + nginx + services page → commit → push → sync (sudo)
#   describe  change the name/description on the services page → commit → push → sync (site only, no sudo)
#
# <user> defaults to sky_max, so `new virtualni-cesko` works too.
# Options:  --yes       don't ask for confirmation
#           --no-sync   commit + push, skip the sync to Amunet
#           --no-push   commit locally only (implies --no-sync) — for testing
#
# Runs only on a clean `main`; it stages explicit paths only.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_SRC="$REPO_ROOT/site-src"
SERVICES="$SITE_SRC/data/services.json"
HOST="amunet.tail49d1b.ts.net"
ORG="amunet-rogan"
NAME_RE='^[a-z_][a-z0-9_-]*$'
PLACEHOLDER_DESC="Nový nástroj — popis doplníme."

if [[ -t 1 ]]; then B=$'\e[1m'; D=$'\e[2m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; C=$'\e[36m'; N=$'\e[0m'
else B=; D=; G=; Y=; R=; C=; N=; fi
step() { echo "${C}→${N} $*"; }
ok()   { echo "${G}✓${N} $*"; }
warn() { echo "${Y}⚠${N} $*" >&2; }
die()  { echo "${R}✗${N} $*" >&2; exit 1; }

INTERACTIVE=0; [[ -t 0 && -t 1 ]] && INTERACTIVE=1

ask() {  # ask "Prompt" "default"  → answer on stdout (prompt goes to stderr)
    local prompt="$1" def="${2-}" ans=""
    if (( ! INTERACTIVE )); then printf '%s\n' "$def"; return; fi
    if [[ -n $def ]]; then read -r -p "  $prompt ${D}[$def]${N}: " ans </dev/tty
    else read -r -p "  $prompt: " ans </dev/tty; fi
    printf '%s\n' "${ans:-$def}"
}
confirm() {
    (( YES )) && return 0
    (( INTERACTIVE )) || die "Not interactive — pass --yes to proceed."
    local a; read -r -p "  $1 ${D}[Y/n]${N} " a </dev/tty || { echo >&2; die "No answer — cancelled."; }
    [[ -z $a || $a == [yY]* ]]
}

usage() { awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "${BASH_SOURCE[0]}"; }

# --- args -------------------------------------------------------------------
MODE=""; TARGET=""; NAME=""; DESC=""; NAME_SET=0; DESC_SET=0
YES=0; NO_SYNC=0; NO_PUSH=0; POS=()
while (( $# )); do
    case "$1" in
        --name) [[ $# -ge 2 ]] || die "--name needs a value"; NAME="$2"; NAME_SET=1; shift 2 ;;
        --desc) [[ $# -ge 2 ]] || die "--desc needs a value"; DESC="$2"; DESC_SET=1; shift 2 ;;
        --yes|-y) YES=1; shift ;;
        --no-sync) NO_SYNC=1; shift ;;
        --no-push) NO_PUSH=1; NO_SYNC=1; shift ;;
        -h|--help) usage; exit 0 ;;
        -*) die "Unknown option: $1" ;;
        *) POS+=("$1"); shift ;;
    esac
done
(( ${#POS[@]} >= 1 )) && MODE="${POS[0]}"
case "${#POS[@]}" in
    0|1) ;;
    2) TARGET="${POS[1]}" ;;
    3) TARGET="${POS[1]}/${POS[2]}" ;;
    *) die "Too many arguments. See --help." ;;
esac

# --- helpers ----------------------------------------------------------------
svc_field() {  # svc_field <user> <tool> <name|desc>  → value, or empty if not listed
    F="$SERVICES" U="/$1/$2/" K="$3" bun -e '
      const d = JSON.parse(await Bun.file(process.env.F).text());
      const s = d.services.find(x => x.url === process.env.U);
      if (s) console.log(s[process.env.K] ?? "");' </dev/null
}

list_tools() {
    echo "${B}Onboarded tools${N}"
    local f u t port name
    for f in "$REPO_ROOT"/amunet/tools/*/*/config.env; do
        [[ -f $f ]] || continue
        t="$(basename "$(dirname "$f")")"; u="$(basename "$(dirname "$(dirname "$f")")")"
        port="$(sed -n 's/^INTERNAL_PORT=//p' "$f")"
        name="$(svc_field "$u" "$t" name)"
        printf "  %-34s %s  %s\n" "$u/$t" "${D}:$port${N}" "${name:-${D}(not on services page)${N}}"
    done
}

parse_target() {  # sets U, T
    local x="$1"
    [[ -n $x ]] || die "Missing tool name."
    if [[ $x == */* ]]; then U="${x%%/*}"; T="${x#*/}"; else U="sky_max"; T="$x"; fi
    [[ $U =~ $NAME_RE ]] || die "Invalid user '$U' (lowercase, digits, - and _)."
    [[ $T =~ $NAME_RE ]] || die "Invalid tool name '$T' — lowercase letters, digits and dashes, no spaces or diacritics (e.g. virtualni-cesko)."
}

preflight() {
    cd "$REPO_ROOT"
    local br; br="$(git symbolic-ref --short -q HEAD || true)"
    [[ $br == main ]] || die "Checkout is on '${br:-detached HEAD}', not main.  git -C \"$REPO_ROOT\" switch main"
    if [[ -n "$(git status --porcelain)" ]]; then
        git status --short >&2
        die "Working tree is not clean — commit or stash the above first."
    fi
    command -v bun >/dev/null || die "bun not found."
    [[ -d $SITE_SRC/node_modules ]] || { step "Installing site dependencies"; (cd "$SITE_SRC" && bun install --frozen-lockfile >/dev/null); }
    if (( ! NO_PUSH )); then
        step "Updating main from origin"
        git fetch -q origin
        git merge -q --ff-only origin/main || die "main has diverged from origin/main — sort that out first."
    fi
}

build_site() {
    local out
    out="$(cd "$SITE_SRC" && bun run build.ts 2>&1)" || { echo "$out" >&2; die "Site build failed."; }
    if grep -q '⚠' <<<"$out"; then echo "$out" | grep '⚠' >&2; die "Site build reported warnings (above)."; fi
    ok "Site rebuilt"
}

only_expected_changes() {  # args: paths that may change
    local unexpected
    unexpected="$(git status --porcelain --untracked-files=all | cut -c4- | while IFS= read -r p; do
        keep=0; for a in "$@"; do [[ $p == "$a" || $p == "$a"/* ]] && keep=1; done
        (( keep )) || echo "$p"; done)"
    [[ -z $unexpected ]] || { echo "$unexpected" >&2; die "Unexpected changes (above) — not committing."; }
}

commit_push() {  # commit_push "<message>" <paths…>
    local msg="$1"; shift
    git add -- "$@"
    echo "${D}$(git diff --cached --stat | sed 's/^/  /')${N}"
    git commit -q -m "$msg"
    COMMIT="$(git rev-parse --short HEAD)"
    ok "Committed $COMMIT  $msg"
    if (( NO_PUSH )); then warn "--no-push: commit stays local"; return; fi
    git push -q origin main
    ok "Pushed to origin/main"
}

http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$1" || true; }

# --- new --------------------------------------------------------------------
cmd_new() {
    parse_target "$1"
    local tool_dir="amunet/tools/$U/$T"
    [[ ! -e $REPO_ROOT/$tool_dir ]] || die "$U/$T is already onboarded. To change its text: $0 describe $U/$T"

    local guess; guess="$(echo "$T" | sed 's/[-_][-_]*/ /g' | awk '{print toupper(substr($0,1,1)) substr($0,2)}')"
    (( NAME_SET )) || NAME="$(ask "Name on the services page" "$guess")"
    (( DESC_SET )) || DESC="$(ask "One-sentence description (can be changed later)" "$PLACEHOLDER_DESC")"
    [[ -n $NAME && -n $DESC ]] || die "Name and description must not be empty."

    echo
    echo "  ${B}$U/$T${N}  →  http://$HOST/$U/$T/"
    echo "  name: $NAME"
    echo "  desc: $DESC"
    (( NO_SYNC )) && echo "  ${Y}(no sync)${N}"
    confirm "Onboard?" || die "Cancelled."
    echo

    step "Onboarding"
    local out
    out="$(ONBOARD_QUIET=1 "$REPO_ROOT/scripts/onboard-tool.sh" "$U" "$T" 2>&1)" || { echo "$out" >&2; die "onboard-tool.sh failed."; }
    grep -E '✓|⚠' <<<"$out" | sed 's/^ *//; s/^/  /' || true
    [[ -f $REPO_ROOT/$tool_dir/config.env ]] || die "onboard-tool.sh did not create $tool_dir/config.env"
    PORT="$(sed -n 's/^INTERNAL_PORT=//p' "$REPO_ROOT/$tool_dir/config.env")"
    (cd "$SITE_SRC" && bun run add-service.ts "$U" "$T" --name "$NAME" --desc "$DESC" >/dev/null)
    build_site

    local paths=("$tool_dir/config.env" amunet/nginx/http.amunet-rogan.conf site-src/data/services.json amunet/site)
    only_expected_changes "${paths[@]}"
    commit_push "Onboard $U/$T (port $PORT)" "${paths[@]}"

    if (( ! NO_SYNC )); then
        step "Syncing to Amunet (asks for your sudo password there)"
        "$REPO_ROOT/scripts/sync-to-amunet.sh"
    fi
    summary_new
}

summary_new() {
    local url="http://$HOST/$U/$T/" code state
    if (( NO_SYNC )); then state="${Y}not synced${N} — run scripts/sync-to-amunet.sh"
    else
        code="$(http_code "$url")"
        case "$code" in
            502) state="${G}502 — route is live, nothing deployed yet (expected)${N}" ;;
            200) state="${G}200 — already running${N}" ;;
            404) state="${R}404 — nginx doesn't know the route; did the sync reload nginx?${N}" ;;
            000) state="${R}no answer — is Tailscale up?${N}" ;;
            *)   state="${Y}$code${N}" ;;
        esac
    fi
    echo
    echo "${B}━━━ $U/$T onboarded ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
    printf "  %-10s %s\n" "URL"      "${B}$url${N}"
    printf "  %-10s %s\n" "status"   "$state"
    printf "  %-10s %s\n" "port"     "$PORT"
    printf "  %-10s %s\n" "name"     "$NAME"
    printf "  %-10s %s\n" "desc"     "$DESC"
    printf "  %-10s %s\n" "services" "http://$HOST/sluzby/"
    printf "  %-10s %s\n" "commit"   "$COMMIT"
    printf "  %-10s %s\n" "repo"     "https://github.com/$ORG/$T  ← Martin creates it from tool-template"
    echo
    echo "  ${D}Message for Martin:${N}"
    echo "  Nástroj $T je zaregistrovaný. Založ repo z tool-template (owner $ORG, název přesně $T, Private)."
    echo "  Po prvním nasazení poběží na $url"
    [[ $DESC == "$PLACEHOLDER_DESC" ]] && echo && echo "  ${D}Later: $0 describe $U/$T${N}"
    return 0
}

# --- describe ---------------------------------------------------------------
cmd_describe() {
    parse_target "$1"
    local cur_name cur_desc
    cur_name="$(svc_field "$U" "$T" name)"; cur_desc="$(svc_field "$U" "$T" desc)"
    [[ -n $cur_name ]] || die "$U/$T is not on the services page. Onboard it first: $0 new $U/$T"

    (( NAME_SET )) || NAME="$(ask "Name" "$cur_name")"
    (( DESC_SET )) || DESC="$(ask "Description" "$cur_desc")"
    [[ -n $NAME && -n $DESC ]] || die "Name and description must not be empty."
    if [[ $NAME == "$cur_name" && $DESC == "$cur_desc" ]]; then ok "Nothing changed."; exit 0; fi

    echo
    [[ $NAME != "$cur_name" ]] && echo "  name: ${D}$cur_name${N} → $NAME"
    [[ $DESC != "$cur_desc" ]] && echo "  desc: ${D}$cur_desc${N} → $DESC"
    confirm "Update?" || die "Cancelled."
    echo

    (cd "$SITE_SRC" && bun run add-service.ts "$U" "$T" --name "$NAME" --desc "$DESC" >/dev/null)
    build_site
    local paths=(site-src/data/services.json amunet/site)
    only_expected_changes "${paths[@]}"
    commit_push "Describe $U/$T: $NAME" "${paths[@]}"

    local state="${Y}not synced${N}"
    if (( ! NO_SYNC )); then
        step "Syncing the site to Amunet (no sudo needed)"
        "$REPO_ROOT/scripts/sync-to-amunet.sh" --site-only | sed 's/^/  /'
        if curl -s --max-time 8 "http://$HOST/sluzby/" | grep -qF "$NAME"; then state="${G}live${N}"
        else state="${Y}synced, but the name isn't on the page yet — reload it${N}"; fi
    fi
    echo
    echo "${B}━━━ $U/$T updated ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
    printf "  %-10s %s\n" "name"     "$NAME"
    printf "  %-10s %s\n" "desc"     "$DESC"
    printf "  %-10s %s\n" "services" "${B}http://$HOST/sluzby/${N}  ($state)"
    printf "  %-10s %s\n" "tool"     "http://$HOST/$U/$T/"
    printf "  %-10s %s\n" "commit"   "$COMMIT"
}

# --- main -------------------------------------------------------------------
if [[ -z $MODE ]]; then
    (( INTERACTIVE )) || { usage; exit 2; }
    list_tools; echo
    case "$(ask "[n]ew tool or [d]escribe an existing one?" "n")" in
        n*|N*) MODE=new ;;
        d*|D*) MODE=describe ;;
        *) die "Pick n or d." ;;
    esac
fi
case "$MODE" in
    list) list_tools; exit 0 ;;
    new|describe) ;;
    *) die "Unknown command '$MODE'. See --help." ;;
esac
[[ -n $TARGET ]] || TARGET="$(ask "Tool (user/tool, user defaults to sky_max)" "")"

preflight
COMMIT=""; PORT=""
"cmd_$MODE" "$TARGET"
