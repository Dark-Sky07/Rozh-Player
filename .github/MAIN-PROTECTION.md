# Protecting `main`

Status: **not protected** — blocked on a credential, not on a decision.

## What the repository looks like right now

| probe | result |
|---|---|
| `GET /repos/Dark-Sky07/Rozh-Player` → `.permissions` | `admin: true, maintain: true, push: true, triage: true, pull: true` |
| `GET /branches/main` | `200` — `protected: false`, `protection.enabled: false` |
| `GET /rulesets` | `200` — `[]` (no ruleset exists) |
| `GET /branches/main/protection` | `403 Resource not accessible by integration` — `X-Accepted-Github-Permissions: administration=read` |
| `PUT /branches/main/protection` (dry attempt, rejected) | `403` — `administration=write` |
| `POST /rulesets` | `403` — `administration=write` |
| `GET /actions/secrets` (`gh secret list`) | `403` — `secrets=read` |

## Why `admin: true` and 403 at the same time

The automation credential is a **GitHub App installation token** (empty
`X-Oauth-Scopes`, `Github-Authentication-Token-Expiration` header, and
`X-Accepted-Github-Permissions` on the responses). The installation holds the
*admin role on the repository*, which is what `.permissions` reports, but each
endpoint is additionally checked against the **permissions the App itself
requested**. `Resource not accessible by integration` is the App-specific denial;
a personal access token would have said `Must have admin rights to Repository`.

So adding permissions on the GitHub side alone does not help — the App manifest
must request:

1. **Administration — Read and write** (branch protection and rulesets, and even
   *reading* the current protection)
2. **Secrets — Read and write** (listing and writing Actions secrets)

`Actions: read` is already sufficient: workflow, run and job listings all return
`200`.

There is no API-level workaround. GitHub evaluates protection before it looks at
any credential we can present, and protection is the only mechanism that can
refuse a force-push, a deletion or a direct push. Pushing to `main` anyway would
not create a rule, it would only make the history that the rule is supposed to
guard less trustworthy — so this repository does not do that.

## Two ways to finish the job

**A. Give the App the two permissions** (Arena GitHub connection → Administration
R/W and Secrets R/W → approve the installation), then run:

```bash
.github/scripts/apply-main-protection.sh
```

The script is idempotent, applies exactly the intended policy and reads it back.

**B. Run the script yourself, once, with a token that carries
`administration: write`** (fine-grained, this repository only, short expiry).
Never paste such a token into a chat — run it locally:

```bash
REPO=Dark-Sky07/Rozh-Player .github/scripts/apply-main-protection.sh
```

### Intended policy

- merging into `main` only through a pull request
- required checks: `Web · typecheck & build`, `Rust · cargo check`,
  `Android · bridge compile`
- force-push: blocked (`allow_force_pushes: false`)
- branch deletion: blocked (`allow_deletions: false`)
- administrators included by default (`ENFORCE_ADMINS=false` to opt out)

## Compensating control in the meantime

`.github/workflows/guard-main.yml` runs on pushes to `main` and on branch
deletion. It cannot prevent anything — nothing available to us can — but it:

- keeps the commit discarded by a force-push reachable as
  `main-rewound-<run_id>`,
- opens an issue for a force-push, a deletion, or a push whose head commit
  belongs to no pull request,
- fails the run so the event shows up in the Actions list.

Delete that workflow once real protection exists; it becomes noise.

## Secrets

`gh secret list` stays `403` until the App gets `Secrets: read`. Nobody needs the
*values*: only names matter for auditing, and values must never be read, printed
or pasted into a chat. The six names referenced in the release plan
(`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`,
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`,
`ANDROID_KEY_ALIAS`) are **not referenced by any workflow in this repository** —
the current release pipeline only uses `GITHUB_TOKEN` and generates a throwaway
keystore per run. No secret was created, replaced or deleted while writing this
document.
