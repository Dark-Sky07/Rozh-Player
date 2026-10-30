# Signing and update migration

Status: **blocked on decisions and on a credential, not on code.** Nothing in
this document has been executed: no key was created, no secret was written, no
tag or release was produced, and no historical key was used.

## 1. What is true today

| Fact | Evidence |
|---|---|
| Releases up to `v1.1.0` are signed with a **different certificate every run** | `.github/workflows/release.yml` generated a keystore with `keytool -genkeypair` inside the runner, signed, then discarded it |
| That keystore used a hard-coded password and alias | `-storepass rozhplayer -keypass rozhplayer -alias rozh` (still true of the generated file, not a secret, but no longer acceptable) |
| Those APKs cannot update one another | Android refuses an update whose signing certificate differs: `INSTALL_FAILED_UPDATE_INCOMPATIBLE` |
| No Tauri updater exists in the shipped builds | no `tauri-plugin-updater` in `src-tauri/Cargo.toml`, no `plugins.updater` block in `src-tauri/tauri.conf.json` |
| The in-repo version is `1.0.4` while tags up to `v1.1.0` are published | `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` |
| No key material is committed in the two refs on the remote | full clone (27 commits) shows no `.jks`/`.p8`/PEM private-key block; only workflow text about the throwaway keystore |
| The six expected secret names are referenced by no workflow | only `secrets.GITHUB_TOKEN` was used |

Consequences, in order of importance:

1. **In-place Android updates are impossible for installations that already
   exist**, and no future action fixes that retroactively. The certificate of an
   installed app is fixed; a different key can only be installed by uninstalling
   first. Anyone claiming otherwise is describing a different package name.
2. Since **no shipped build implements a Tauri updater**, there is no old
   updater public key to stay compatible with. A new updater key can be
   introduced without a key-continuity constraint — the constraint is only that
   every *future* desktop release keeps signing with the same key.
3. The current pipeline is a footgun: any tag push silently produces another
   Android artifact with an unmatched signature. `release.yml` now **fails
   closed** instead — see §5.

## 2. Android: the compatible-signing decision

Two options, both honest; pick one before any release.

### Option A — stable key from now on, one-time reinstall (recommended)

- Create **one** keystore, keep the `.jks` outside the repository (password
  manager or encrypted storage), and register it as four repository secrets.
- Every future release signs with it, so `v1.2.0 → v1.3.0 → …` update in place.
- Users of `v1.0.x`/`v1.1.0` must uninstall once and install the new APK. Their
  app data (indexed library, settings in local storage) is lost unless exported
  first — announce this in the release notes.
- Keep validity long enough (25+ years) so the key does not expire mid-life, and
  use RSA 4096 or EC P-256, `SHA256withRSA`/`SHA256withECDSA`.

### Option B — new package name for the new key

- Ship `app.rozh.player2` (or similar) signed with the new key; old installs stay
  untouched and frozen. No data loss, but two packages in the wild, no migration
  path between them, and double maintenance. Only worth it if the user base of
  the old package must keep receiving updates signed with a key nobody has.

Either way the **first** artifact signed with the new key must be tested on a
device that has `v1.1.0` installed, to confirm the expected failure and the
expected clean install (see §6).

## 3. Creating the key (owner runs this, not CI, not an agent)

```bash
# on your own machine, outside any git checkout
keytool -genkeypair -v \
  -keystore rozh-release.jks -alias rozh \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=ROZH Player, O=ROZH, C=IR"

# what goes into the ANDROID_KEYSTORE_BASE64 secret
base64 -w0 rozh-release.jks > rozh-release.jks.b64

# what the certificate fingerprint is — record it, it is your reference
keytool -list -v -keystore rozh-release.jks -alias rozh | grep -A2 'Certificate fingerprints'
```

Store the `.jks`, its passwords and the printed SHA-256 fingerprint somewhere
offline. If this file is lost, no future release can update the installed base
again — that is the whole point.

If Play Store distribution ever happens, Play requires an **upload key** that is
separate from the app-signing key; do not reuse the same key for both.

## 4. Tauri updater: introduction plan

There is nothing to migrate *from*, so this is a clean introduction:

1. Add `tauri-plugin-updater = "2"` to `src-tauri/Cargo.toml`, register the
   plugin in `src-tauri/src/main.rs` (or `lib.rs`), and add the capability
   (`updater:default`) to the capability file used by the main window.
2. Generate the updater key pair **once**, offline:
   `npx tauri signer generate -w ~/.tauri/rozh-updater.key`.
   The **public** key goes into `tauri.conf.json` (`plugins.updater.pubkey`) and
   is committed — a public key is not a secret. The private key and its password
   become `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
3. Point `plugins.updater.endpoints` at the release asset that carries
   `latest.json` (the release workflow already uploads `out/*`; the updater
   manifest has to be generated and uploaded the same way).
4. Signing is fail-closed in the pipeline: `tauri build` only produces an update
   artifact when `TAURI_SIGNING_PRIVATE_KEY` is present, so a release without the
   key simply will not offer updates.
5. Rotation: the pubkey is baked into every installed client. Rotating requires
   shipping a release that trusts **both** keys (or trusting the old one until
   the installed base has moved), so plan one full release cycle per rotation.
   Never rotate just because a key is old.

Because no client currently verifies updates, the first updater-enabled release
must be installed manually once; updates work from the release after it.

## 5. What changed in the pipeline (and what it guarantees)

- `scripts/prepare-android-signing.sh` decodes `ANDROID_KEYSTORE_BASE64` into
  `src-tauri/keystore/release.jks` (mode 600), writes
  `src-tauri/gen/android/keystore.properties`, and **verifies that the alias
  opens with the given passwords** before a 20-minute build starts.
- When any of the four Android secrets is missing it exits non-zero with an
  explicit message. The old behaviour — silently generating a throwaway key —
  is gone, so no new release can repeat the `v1.1.0` mistake.
- `release.yml` signs APK and AAB with that keystore and the alias from
  `ANDROID_KEY_ALIAS`; the hard-coded `rozhplayer` password is gone.
- `.gitignore` now blocks `*.jks`, `*.keystore`, `*.p12`, `*.pfx`, `*.pem`,
  `*.key`, `src-tauri/keystore/` and `keystore.properties`.
- `.github/workflows/secret-scan.yml` fails a commit that adds a key file or a
  PEM private-key block, so a re-leak is caught at review time.

The pipeline was **not** exercised end to end: adding the secrets is the
precondition, and that is your call.

## 6. Test plan — what "tested" means before the first real release

Run on a throwaway bump (`v1.1.1-test`) that is deleted afterwards, or on a
`workflow_dispatch` build that uploads artifacts without publishing.

1. **Two builds, one certificate.** Build twice with the same keystore and
   compare:
   ```bash
   apksigner verify --print-certs ROZH-Player-TEST.apk | grep SHA-256
   ```
   The digest must be identical across runs and across phone/TV variants, and it
   must match the fingerprint recorded in §3.
2. **The expected failure is a pass.** On a device (or emulator image) with
   `v1.1.0` installed:
   ```bash
   adb install -r ROZH-Player-TEST.apk   # must fail: signature mismatch
   adb uninstall app.rozh.player
   adb install ROZH-Player-TEST.apk      # must succeed
   adb install -r ROZH-Player-TEST-2.apk # must succeed — this is the actual goal
   ```
3. **Same for TV**: `com.rozh.player.tv` / `app.rozh.player.tv` per the variant,
   same three commands.
4. **Updater (after §4)**: publish a staging `latest.json` pointing at a test
   artifact, install the previous version, let it update, then confirm a
   *deliberately corrupted* artifact is rejected — an updater that accepts a bad
   signature is worse than no updater.
5. **Version bump first**: `package.json`, `src-tauri/tauri.conf.json` and
   `src-tauri/Cargo.toml` still say `1.0.4` while tags reached `v1.1.0`. The
   updater compares versions, so this has to be consistent before the first
   updater release.

## 7. Secrets

| Name | Used by | Notes |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | `scripts/prepare-android-signing.sh` | `base64 -w0` of the `.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | idem | store password |
| `ANDROID_KEY_PASSWORD` | idem | key password |
| `ANDROID_KEY_ALIAS` | idem | alias inside the keystore |
| `TAURI_SIGNING_PRIVATE_KEY` | `tauri build` (desktop) | content of the updater private key |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | `tauri build` (desktop) | protects the key |

Rules: values never leave the secret store — not in a chat, not in an issue, not
in a commit, not in a shell history. Rotating a secret is `gh secret set NAME`
followed by a fresh release; **never** rotate the Android signing key (that
breaks updates) or the updater key without the dual-trust step in §4.

## 8. Hard stops

- Do not reuse anything that was ever committed to git: it is public, even after
  a force-push, and even if the commit is unreachable.
- Do not publish a release while `main` is unprotected *and* the signing secrets
  are missing — the pipeline fails closed now, keep it that way.
- Do not rewrite `main`'s history to hide the leak; rotate instead.
