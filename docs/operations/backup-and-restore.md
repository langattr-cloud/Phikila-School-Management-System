# Database backups and recovery

## Current status

The repository contains a scheduled backup workflow, but backups are **not active until the required GitHub Actions secrets/variables and Cloudflare R2 bucket are configured**. A green workflow run and a successful restore drill are required before calling this protection operational.

## Configure Cloudflare R2

1. Create a private R2 bucket dedicated to Phikila backups. Do not use a public bucket.
2. Create an R2 access key scoped to that bucket, with only the object read/write permissions needed for backup and recovery. Store the key ID and secret in GitHub Actions secrets.
3. Configure an R2 lifecycle rule to expire objects under `postgres/daily/` after 90 days. If longer-term monthly retention is needed, create a separate policy and prefix. Verify the lifecycle rule in the R2 dashboard; the workflow cannot configure or verify account-level lifecycle settings.
4. Enable any available bucket-level safeguards against accidental deletion. Limit access to the bucket and credentials to operators who need it.

## Configure GitHub Actions

Open repository **Settings → Secrets and variables → Actions**.

Add these **repository secrets**:
- `SUPABASE_DB_URL`: production PostgreSQL connection URI. Use the database connection string from Supabase, with SSL enabled. Prefer the direct database connection where network connectivity supports it.
- `R2_ACCESS_KEY_ID`: Cloudflare R2 access key ID.
- `R2_SECRET_ACCESS_KEY`: matching R2 secret access key.

Add these **repository variables**:
- `R2_ACCOUNT_ID`: Cloudflare account ID.
- `R2_BUCKET`: exact private bucket name.
- `BACKUP_AGE_RECIPIENT`: age public recipient (starts with `age1`).

## Encryption key handling

Generate an age key pair on a trusted workstation with `age-keygen`. Put only the public recipient (the `age1...` value) in `BACKUP_AGE_RECIPIENT`. Keep the private identity file offline or in an independently managed secrets vault with restricted access. Do not commit the private key or place it in the same R2 bucket as the backups. Losing the private key means the encrypted backups cannot be decrypted.

## Run and verify the first backup

1. Open **Actions → Encrypted Supabase database backup → Run workflow**.
2. Confirm the run completes successfully and reports that the uploaded encrypted object was verified.
3. In the R2 dashboard, confirm the encrypted dump and checksum exist under `postgres/daily/YYYY/MM/DD/`.
4. Confirm the bucket lifecycle rule is set for 90-day expiration.
5. Record the latest successful backup timestamp and alert an operator if a daily run fails or is missed. GitHub Actions run history is not, by itself, an alerting system.

## Restore drill

At least quarterly, and after material schema changes:

1. Download the encrypted dump and its `.sha256` file from R2.
2. Verify the checksum before decryption.
3. Decrypt on a controlled workstation using the private age identity.
4. Restore into a separate non-production PostgreSQL/Supabase project; never restore over production as a test.
5. Verify the schema and representative row counts for the school registry, school profiles, memberships, and related academic records. Test sign-in and tenant isolation with test accounts.
6. Document the restore result and any time taken to recover.

## Security and limitations

- Dumps are encrypted before upload; the unencrypted dump is removed from the ephemeral runner after the job.
- Use a database role with only the privileges required for backup where feasible; do not substitute a Supabase service-role API key for a PostgreSQL connection URI.
- This workflow does not create Supabase point-in-time recovery, configure R2 lifecycle rules, or automatically validate restoration.
- A backup is not proven recoverable until a restore drill succeeds. Keep production data unchanged while testing recovery.
