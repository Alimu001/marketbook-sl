# MarketBook SL backup and recovery

## What is protected

The PostgreSQL backup is the authoritative full backup. It includes users,
businesses, products, inventory, sales, purchases, debts, expenses, payments,
memberships, and activity records. CSV report exports are useful for reporting,
but they are not a substitute for a database backup.

Mobile offline data is a temporary synchronized copy and must not be treated as
the only backup.

## Create and verify a backup

Install PostgreSQL client tools matching the production PostgreSQL major version.
Configure `DATABASE_URL` securely in the environment or `server/.env`, then run:

```powershell
npm run db:backup
```

The command creates a timestamped custom-format dump in `backups/` (or the
absolute directory configured by `BACKUP_DIRECTORY`) and immediately checks that
`pg_restore` can read its structure. Credentials are not printed or embedded in
the command line. The `backups/` directory is ignored by Git.

On Windows, the script discovers standard PostgreSQL installations automatically.
For a custom installation, set `POSTGRES_BIN` to the directory containing
`pg_dump` and `pg_restore`.

Verify an existing backup again with:

```powershell
npm run db:backup:verify -- C:\secure-backups\marketbook-YYYY-MM-DD.dump
```

A structural check does not replace a restore drill. Copy verified backups to
encrypted storage on a different device or managed backup service, restrict
access to authorized operators, and monitor failed backup jobs.

## Production schedule and retention

- Create an automated daily database backup.
- Keep at least 7 daily, 4 weekly, and 12 monthly recovery points initially.
- Use encryption at rest and in transit.
- Keep at least one copy outside the database host.
- Record backup time, result, file size, and verification result without logging
  database credentials.
- Review retention against Sierra Leone legal, tax, privacy, and contractual
  requirements before production launch.

The included script does not automatically delete old backups. Retention deletion
must be configured in the selected managed storage service after its recovery and
legal requirements are approved.

## Recovery procedure

Restoration is intentionally not exposed as an application or npm command because
it can overwrite or duplicate production data.

1. Declare an incident owner and stop application writes if production recovery is
   required.
2. Preserve the damaged database and logs for investigation.
3. Select the newest verified backup from before the incident.
4. Create a new, empty staging database. Never test a restore over production.
5. Restore into staging using the provider's documented PostgreSQL restore process
   or `pg_restore` with credentials supplied through secure environment variables.
6. Run `npm run db:migrate:deploy -w server` against the restored staging database.
7. Validate record counts and sample businesses, users, products, inventory,
   sales, debts, purchases, expenses, and audit history.
8. Start the API against staging and verify `/health`, login, dashboard access, and
   representative read-only workflows.
9. Obtain explicit approval from the incident owner before switching production
   to the recovered database.
10. Rotate database credentials if compromise is suspected and document the
    recovery-point and recovery-time results.

Perform a staging restore drill at least quarterly and after major database
changes. A backup is not considered operationally proven until a restore drill
succeeds.
