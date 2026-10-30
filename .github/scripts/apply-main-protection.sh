#!/usr/bin/env bash
# Apply the intended protection rules to `main`.
#
# WHY THIS IS A SCRIPT AND NOT PART OF CI
# ---------------------------------------
# The automation credential is a GitHub App installation token without the
# `Administration: write` permission, so it gets
#   403 Resource not accessible by integration
# from PUT /repos/{owner}/{repo}/branches/main/protection and from
# POST /repos/{owner}/{repo}/rulesets, with
#   X-Accepted-Github-Permissions: administration=write
# GitHub checks protection *before* consulting the credential, so this cannot be
# worked around from inside the repository. A human (or a token that carries
# `administration: write`, plus `secrets: read` for listing secret names) has to
# run it once.
#
# USAGE
#   GH_TOKEN=<token with administration:write> .github/scripts/apply-main-protection.sh
#   # or, if `gh` is already signed in with such a token:
#   .github/scripts/apply-main-protection.sh
#
# Optional environment:
#   REPO=<owner/name>          default: Dark-Sky07/Rozh-Player
#   BRANCH=<branch>            default: main
#   ENFORCE_ADMINS=true|false  default: true (admins cannot force-push either)
#   STRICT_CHECKS=true|false   default: false (PR branch need not be up to date)
#   ALLOW_MISSING_CHECKS=true|false
#       A required check that no workflow on the protected branch produces can
#       never go green, which permanently blocks every pull request. By default
#       (false) such checks are dropped and reported, so the rule can be enabled
#       safely at any time. Set to true to require them anyway.
#
# The script is idempotent: run it as often as you like.

set -euo pipefail

REPO="${REPO:-Dark-Sky07/Rozh-Player}"
ENFORCE_ADMINS="${ENFORCE_ADMINS:-true}"
STRICT_CHECKS="${STRICT_CHECKS:-false}"
BRANCH="${BRANCH:-main}"

command -v gh >/dev/null || { echo "gh CLI is required" >&2; exit 1; }

echo "==> current protection on $BRANCH"
if gh api "repos/$REPO/branches/$BRANCH/protection" >/tmp/current-protection.json 2>/tmp/current-protection.err; then
  jq . /tmp/current-protection.json
else
  echo "    (not readable / not set: $(head -1 /tmp/current-protection.err))"
fi

echo "==> applying protection"

WANTED_CHECKS=(
  "Web · typecheck & build"
  "Rust · cargo check"
  "Android · bridge compile"
)

# A required status check only exists if some workflow *on the protected branch*
# produces it. Requiring a check that never appears would leave every pull
# request pending forever, so verify before writing.
echo "==> checking which required checks exist on $BRANCH"
ci_yml=$(gh api "repos/$REPO/contents/.github/workflows/ci.yml?ref=$BRANCH" --jq '.content' 2>/dev/null | base64 -d 2>/dev/null || true)
if [ -z "$ci_yml" ]; then
  echo "    ::warning:: could not read .github/workflows/ci.yml@$BRANCH"
fi

checks=()
dropped=()
for c in "${WANTED_CHECKS[@]}"; do
  if [ -z "$ci_yml" ] || grep -qF "$c" <<<"$ci_yml"; then
    checks+=("$c")
  elif [ "${ALLOW_MISSING_CHECKS:-false}" = "true" ]; then
    echo "    !! '$c' is not produced on $BRANCH — required anyway (ALLOW_MISSING_CHECKS=true)"
    checks+=("$c")
  else
    echo "    ?? '$c' is not produced on $BRANCH — dropped, otherwise every PR would hang"
    dropped+=("$c")
  fi
done
printf '    requiring: %s\n' "$(IFS=' | '; echo "${checks[*]}")"
if [ "${#dropped[@]}" -gt 0 ]; then
  printf '    dropped:   %s\n' "$(IFS=' | '; echo "${dropped[*]}")"
  echo "    Re-run after those jobs land on $BRANCH to require them too."
fi

checks_json=$(if [ "${#checks[@]}" -eq 0 ]; then echo '[]'; else printf '%s\n' "${checks[@]}" | jq -R . | jq -s .; fi)

payload=$(jq -n \
  --argjson enforce "$ENFORCE_ADMINS" \
  --argjson strict "$STRICT_CHECKS" \
  --argjson checks "$checks_json" \
  '{
    required_status_checks: {
      strict: $strict,
      contexts: $checks
    },
    enforce_admins: $enforce,
    required_pull_request_reviews: {
      required_approving_review_count: 0,
      dismiss_stale_reviews: false,
      require_code_owner_reviews: false,
      require_last_push_approval: false
    },
    restrictions: null,
    required_linear_history: false,
    allow_force_pushes: false,
    allow_deletions: false,
    block_creations: false,
    required_conversation_resolution: false
  }')

if [ "${DRY_RUN:-false}" = "true" ]; then
  echo "==> DRY RUN — payload that would be written to PUT /branches/$BRANCH/protection:"
  jq . <<<"$payload"
  exit 0
fi

gh api -X PUT "repos/$REPO/branches/$BRANCH/protection" \
  -H "Accept: application/vnd.github+json" \
  --input - <<<"$payload" >/dev/null

echo "==> reading it back"
gh api "repos/$REPO/branches/$BRANCH/protection" \
  --jq '{
    required_status_checks: (.required_status_checks.contexts // []),
    strict: .required_status_checks.strict,
    pull_request_required: (.required_pull_request_reviews != null),
    approvals_required: .required_pull_request_reviews.required_approving_review_count,
    enforce_admins: .enforce_admins.enabled,
    force_pushes_allowed: .allow_force_pushes.enabled,
    deletions_allowed: .allow_deletions.enabled
  }'

echo
echo "==> done. Expected: force_pushes_allowed=false, deletions_allowed=false,"
echo "    pull_request_required=true, and exactly the contexts printed above."
echo
echo "NOTE: secret names are listed separately and never read:"
echo "      gh secret list -R $REPO   (needs secrets: read)"
