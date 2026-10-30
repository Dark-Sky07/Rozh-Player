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
#   REPO=<owner/name>        default: Dark-Sky07/Rozh-Player
#   ENFORCE_ADMINS=true|false  default: true (admins cannot force-push either)
#   STRICT_CHECKS=true|false   default: false (PR branch need not be up to date)
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
payload=$(jq -n \
  --argjson enforce "$ENFORCE_ADMINS" \
  --argjson strict "$STRICT_CHECKS" \
  '{
    required_status_checks: {
      strict: $strict,
      contexts: [
        "Web · typecheck & build",
        "Rust · cargo check",
        "Android · bridge compile"
      ]
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
echo "    pull_request_required=true and the three CI contexts listed above."
echo
echo "NOTE: secret names are listed separately and never read:"
echo "      gh secret list -R $REPO   (needs secrets: read)"
