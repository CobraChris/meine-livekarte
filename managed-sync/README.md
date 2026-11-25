# Managed synchronization — staging only

Do not merge or deploy until acceptance. Existing PAT-based sync remains active.
Target: one-time device approval, automatic GitHub installation-token minting, no PAT input.

## Provisioning gate
- Register a dedicated private GitHub App owned by the repository owner; no webhook needed, no user OAuth needed; repository Contents read/write and Metadata read-only only. Install only on CobraChris/meine-livekarte-private-sync (ID 1439289912).
- Use a free Cloudflare Workers + D1 account (no paid upgrade); create D1 database, apply schema.sql, copy wrangler.toml.example to wrangler.toml locally and insert app/installation/database IDs. Never commit the GitHub private key. Store it as GITHUB_APP_PRIVATE_KEY using the hosting secret facility. Keep deployment credentials out of the browser and repository.
- Deploy worker.mjs with nodejs_compat; verify the deployment hostname and lock down the endpoint configuration. No real credentials in test fixtures.
- Add the actual HTTPS worker root URL to the client release configuration only after deployment. The endpoint must be the root (challenge and snapshot routes). The existing sync-out.js remains the fallback until live acceptance.
- Enroll each existing paired browser once. The public enrollment JSON contains the existing 24-hex device ID and a base64url SPKI P-256 public key. Verify the device ID belongs to the owner, convert public key to PEM (Node createPublicKey with format der/type spki), then insert the device row using a parameterized statement or safely escaped SQL. Never expose a public enrollment route. Do not request a private key.
- Revocation: set enabled=0 in the devices table. Re-enrollment requires explicit owner approval. Clear expired challenges. Apply edge rate limiting if available; application limits alone do not fully protect hosting quotas from abuse.

## Acceptance
Run node --test managed-sync/*.test.mjs. Verify actual D1 atomic consumption, Worker bundling and deployment using a test device, a real installation token, successful private write and readback, denial of replay/tampering/other devices, renewal after expiration, browser restart, offline behavior and PWA update. Do not send personal ticket data during staging. Confirm incoming encrypted mailbox remains unchanged. Only then remove legacy PAT controls and revoke old PAT after owner release approval.
