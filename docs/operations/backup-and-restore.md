# Database backups and recovery

## Current status

The scheduled backup workflow is not operational until the Cloudflare R2 bucket and all GitHub Actions secrets/variables are configured. Confirm a successful workflow run and a successful restore drill before treating backups as a working recovery control.

## Configure Cloudflare R2

1. Create a private R2 bucket dedicated to Phikila backups. Do not make it public.
2. Create an R2 access key restricted to this bucket with the minimum object read/write permissions needed. Store the key ID and secret as GitHub Actions secrets.
3. Configure an R2 lifecycle rule to expire objects under `daily/` after 90 days. Verify the rule in the R2 dashboard; the workflow cannot configure account-level lifecycle settings.
4. Enable available bucket deletion protections and restrict access to operators who need it.

## Configure GitHub Actions

Open repository **Settings → Secrets and variables → Actions**.

Add these **repository secrets**:
- `SUPABASE_DB_URL`: production PostgreSQL connection URI from Supabase, with SSL enabled. Prefer a direct database connection where network connectivity supports it.
- `R2_ACCOUNT_ID`: Cloudflare account ID.
- `R2_ACCESS_KEY_ID`: Cloudflare R2 access key ID.
- `R2_SECRET_ACCESS_KEY`: matching R2 secret access key.

Add these **repository variables**:
- `R2_BUCKET`: exact private bucket name.
- `BACKUP_AGE_RECIPIENT`: age public recipient beginning with `age1`.

## Encryption key handling

Generate an age key pair on a trusted workstation using `age-keygen`. Store only the public recipient in `BACKUP_AGE_RECIPIENT`. Keep the matching private identity offline or in a separate secrets vault. Never commit the private key or store it beside the backups. Losing this private key means the encrypted backups cannot be decrypted.

## Run and verify the first backup

1. Open **Actions → Encrypted database backup → Run workflow**.
2. Confirm the run completes successfully.
3. In R2, verify that the encrypted dump and its `.sha256` checksum file exist under `daily/`.
4. Confirm the object can be read back and its checksum matches.
5. Verify the 90-day lifecycle rule.
6. Record the latest successful backup time and arrange an alert for failed or missed daily runs. GitHub Actions history alone is not a reliable alerting system.

The workflow runs daily at 02:17 UTC and can also be triggered manually.

## Restore drill

At least quarterly, and after material schema changes:

1. Download the encrypted dump and checksum from R2.
2. Verify the checksum before decryption.
3. Decrypt in a controlled environment with the private age identity.
4. Restore to a separate non-production PostgreSQL/Supabase project; never test recovery by overwriting production.
5. Verify schema and representative records for the school registry, school profiles, memberships, and related academic tables. Test sign-in and tenant isolation with test accounts.
6. Record the restore result and recovery time.

## Security and limitations

- The workflow encrypts dumps before upload and removes temporary files from the GitHub runner at job completion.
- Use a database role with only the privileges required for backup where feasible. Do not substitute a Supabase service-role API key for a PostgreSQL connection URI.
- This workflow does not enable Supabase point-in-time recovery, configure R2 lifecycle rules, or automatically validate a restore.
- A successful upload is not proof of recoverability; a restore drill must succeed before the backup system is considered verified.
