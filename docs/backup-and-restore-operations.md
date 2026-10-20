# Zero-budget database backup and recovery

## Current no-cost operating mode

The goal is to protect the production school database without paying for another service or creating another Supabase project.

- The encrypted database backup workflow runs daily at **02:17 UTC (05:17 East Africa Time)**.
- Each successful run stores an encrypted archive and SHA-256 checksum as a GitHub Actions artifact for **30 days**. Repository storage limits and retention policies still apply.
- The off-site-copy and cloud restore-test workflows are **manual only** until an external storage bucket and a separate disposable restore database are deliberately configured. This avoids scheduled failures while those dependencies are unavailable.
- GitHub artifacts are temporary and are not an independent off-site copy. Download them to a private computer folder when possible; if you already have an external drive, keep a second copy there.

## Daily backup check

1. Open [Encrypted database backup workflow](https://github.com/langattr-cloud/Phikila-School-Management-System/actions/workflows/encrypted-database-backup.yml).
2. Check the latest scheduled run. Confirm **Success** and that an artifact named like `phikila-encrypted-db-backup-...` exists.
3. If a run fails, open it and inspect the failed step. Never paste database URLs, passwords, access tokens, or age private keys into issues, logs, or chat.
4. At least weekly, download the artifact ZIP from a successful run. Store it privately. Do not commit backups or private keys to the repository.

## Download and validate a backup

You need the artifact ZIP and the matching **private age identity** created for this backup system. The identity is not inside the artifact. Keep a secure offline copy.

1. Download the artifact ZIP from a successful workflow run and extract the ZIP into a private folder.
2. In a terminal, enter the folder containing the `.tar.gz.age` and matching `.tar.gz.age.sha256` files. Install the `age` utility if needed.
3. Verify the encrypted archive's checksum, replacing the sample name with the actual filename:

   ```sh
   sha256sum --check phikila-YYYY-MM-DDTHH-MM-SSZ.tar.gz.age.sha256
   ```

4. Decrypt with your private identity file, using your actual local paths and filename:

   ```sh
   age --decrypt --identity /secure/location/age-identity.txt \
     --output backup.tar.gz phikila-YYYY-MM-DDTHH-MM-SSZ.tar.gz.age
   tar -tzf backup.tar.gz
   ```

5. Confirm the archive contains `phikila-backup/schema.sql`, `phikila-backup/data.sql`, and `phikila-backup/roles.sql`.

**Security:** the archive contains sensitive student and financial records. Keep it in a private, access-controlled location. Never upload decrypted backups to a public service. The private age identity is essential for recovery; store it separately from the backup files.

## Free restore practice

A restore must target a **local disposable PostgreSQL/Supabase development database**, never production. This can avoid the cost of a second hosted Supabase project but requires a computer with enough disk/RAM and free local tools such as Docker and the Supabase CLI, or a compatible PostgreSQL environment.

1. Complete checksum verification and decryption first.
2. Start a local disposable environment using the official local development instructions.
3. Verify the connection string points to localhost or the local development container. Stop if the hostname points to the hosted production project.
4. Restore schema and data into a fresh local database using `psql` with `ON_ERROR_STOP=1`, following the local environment's supported extensions and roles setup. Dumps may need environment-specific adjustments. Never experiment against production.
5. Compare counts and totals for students, invoices, invoice balances, payments, and receipts. Check posted positive payments have receipts, school/student/invoice relationships match, and posted journal entries balance.
6. Record the backup filename, date, whether decryption and restore succeeded, and any failed checks. Securely delete temporary decrypted files after the test.

The automated cloud restore workflow resets the target's `public` schema. **Do not configure or run it until a separate disposable target exists and its hostname is confirmed different from production.** It is manual-only for now.

## Current limitations

- Thirty-day GitHub artifact retention is a recovery buffer, not a permanent backup. GitHub storage quotas apply.
- The logical database dump does not automatically back up Supabase Storage objects, all Auth/platform configuration, Edge Functions, or project secrets.
- The restore workflow currently does not apply `roles.sql`; custom roles and permissions need separate review.
- A restore is not proven until a local or disposable-target restore succeeds and critical record checks pass.
- External object storage and hosted restore testing are optional future steps. Do not enable a paid plan for this zero-budget setup.
