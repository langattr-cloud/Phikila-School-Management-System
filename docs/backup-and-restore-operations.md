# Database backup and restore operations

## What runs automatically

- `.github/workflows/encrypted-database-backup.yml` exports and age-encrypts the Supabase logical database backup daily at 02:17 UTC. Its GitHub Actions artifact remains available for 7 days.
- `.github/workflows/backup-offsite-retention.yml` runs daily at 04:17 UTC, locates the newest successful main-branch backup artifact, and copies the encrypted archive and checksum to independently managed S3-compatible object storage.
- `.github/workflows/restore-test-encrypted-database.yml` runs weekly on Sunday at 05:17 UTC. It downloads the newest off-site backup, verifies the checksum, decrypts it, restores it to a separate disposable Supabase project, and checks critical school/finance relationships and journal balance invariants.

Scheduled workflows are not considered fully operational until all required repository variables and secrets below are configured and a manual run succeeds.

## Required GitHub Actions repository variables

Configure these at **Settings → Secrets and variables → Actions → Variables**:

- `BACKUP_AGE_RECIPIENT`: the age public recipient only (starts with `age1`).
- `BACKUP_S3_BUCKET`: name of a bucket in storage independent of GitHub Actions.
- `BACKUP_S3_REGION`: bucket region, e.g. the region configured by your provider.
- `BACKUP_S3_PREFIX`: optional object prefix; defaults to `phikila/database`.
- `BACKUP_S3_ENDPOINT_URL`: optional S3-compatible endpoint URL; leave empty for AWS S3.
- `RESTORE_TEST_ALLOW_RESET`: set to `YES_DISPOSABLE_DATABASE` only after confirming that the restore target is disposable.

## Required GitHub Actions repository secrets

Configure these at **Settings → Secrets and variables → Actions → Secrets**:

- `SUPABASE_DB_URL`: production database URI used by the existing backup workflow.
- `BACKUP_S3_ACCESS_KEY_ID`: dedicated object-storage access key.
- `BACKUP_S3_SECRET_ACCESS_KEY`: secret for that access key.
- `RESTORE_TEST_DB_URL`: direct PostgreSQL URI for a separate disposable Supabase project/database. Its host must differ from production.
- `BACKUP_AGE_IDENTITY`: the private age identity line matching `BACKUP_AGE_RECIPIENT`. Store it as a GitHub Actions secret only if you accept that the restore workflow needs access to it; also retain a secure offline copy. Never print it in logs or share it in chat.

Use a dedicated object-storage credential restricted to listing the backup prefix and reading/writing objects under that prefix. Do not grant unrelated bucket or account access. Keep the age private identity separate from object-storage credentials.

## Storage retention

Create the bucket in a separate provider/account or administrative boundary from GitHub Actions. Enable bucket versioning if supported, restrict public access, require TLS, and configure a lifecycle policy that retains encrypted backups for your required recovery window (for example, 90 days). Consider object lock/immutability where available and operationally appropriate. The workflow does not create the bucket, enable versioning, or set its lifecycle policy for you.

The off-site workflow fails rather than silently skipping the upload if the bucket or credentials are missing. The restore test fails closed if its explicit reset opt-in is absent or the target host matches production.

## Restore test scope and limitations

The restore workflow resets the `public` schema of the configured disposable target before restoring. **Never point `RESTORE_TEST_DB_URL` at production or any database containing data you need.** A separate Supabase project is recommended; it may incur provider charges depending on your plan and usage.

After restoring schema and data, the test records aggregate counts/totals for students, invoices, invoice balances, payments, and receipts. It fails if it finds positive posted payments without receipts, student/school or payment/invoice mismatches, receipt/payment mismatches, or unbalanced posted journals.

This is a logical database restore test. It does not test recovery of Supabase Storage objects, Auth provider settings/users outside the dumped schemas, Edge Functions, secrets, or other Supabase platform configuration. Those require separate recovery procedures. The current restore workflow does not restore the roles dump; validate custom database roles separately if the application depends on roles beyond the standard roles in a fresh Supabase project.

## First-run checklist

1. Configure all variables and secrets above.
2. Create and verify the separate disposable restore target; confirm its hostname is different from production.
3. Manually run **Retain encrypted database backups off-site** and confirm encrypted archive and checksum objects appear in the bucket.
4. Manually run **Weekly encrypted database restore test** and inspect the summary metrics.
5. Confirm the bucket lifecycle/retention policy and periodically test that the private age identity can decrypt a downloaded backup.
