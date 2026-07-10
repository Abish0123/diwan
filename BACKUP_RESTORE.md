# Database Backup & Restore

Real, working backup/restore for the MySQL database — previously there was
no backup mechanism at all (no script, no cron, no docs), which meant a
dropped table or a bad migration had no recovery path.

## How it works

`scripts/backup-database.mjs` connects with the same `DB_HOST` / `DB_PORT` /
`DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` env vars `server.ts` already
uses, dumps every table to a single gzipped JSON file under `backups/`, and
prunes backups older than `BACKUP_KEEP_DAYS` (default 14). It's pure Node —
no `mysqldump` binary required, since shared cPanel hosting doesn't always
expose one.

`scripts/restore-database.mjs` reads a backup file back in. It defaults to a
**dry run** (prints what it would do) — pass `--yes` to actually write.
Restoring upserts every row from the backup; it does not delete rows created
after the backup was taken.

## Manual usage

```bash
# Back up now
npm run backup

# Preview a restore (no changes made)
npm run restore backups/backup-2026-07-10T18-13-25-854Z.json.gz

# Actually restore
npm run restore backups/backup-2026-07-10T18-13-25-854Z.json.gz -- --yes
```

## Scheduling a real daily backup (cPanel)

1. cPanel → **Cron Jobs**.
2. Add a new cron job, e.g. daily at 2:00 AM:
   ```
   0 2 * * * cd /home/<cpanel-user>/<app-dir> && /usr/bin/node scripts/backup-database.mjs >> backups/backup.log 2>&1
   ```
3. Confirm the app's `.env` (with `DB_HOST`/`DB_DATABASE`/`DB_USERNAME`/`DB_PASSWORD`) is present in `<app-dir>` — the cron job reads the same file `server.ts` does.
4. `backups/` lives outside `dist/` and is git-ignored (real student/staff PII — never commit it). Periodically copy it off-server (e.g. to S3, or download via cPanel File Manager) since a backup that only lives on the same disk as the database doesn't protect against a full server loss.

On a VPS/Docker deployment, add the same command to any cron daemon (`crontab -e`) or a scheduled task runner instead.

## Disaster recovery — what this does and doesn't cover

**Covered:**
- Accidental data loss/corruption in a specific table (bad bulk update, wrong migration) — restore from the most recent backup before the incident.
- Full database loss — restore into a freshly provisioned MySQL database, then point `DB_HOST`/`DB_DATABASE` at it.

**Not covered (deliberately out of scope here):**
- Point-in-time recovery to an arbitrary second — backups are only as fresh as the last cron run (default: once daily). For tighter RPO, enable MySQL binary logging on the host and use `mysqlbinlog` replay in addition to this.
- Off-server storage — this script writes locally; step 4 above is on you to automate (e.g. `aws s3 sync backups/ s3://your-bucket/` as a second cron line) once real cloud-storage credentials are available for this deployment.
- `uploads/` (admission documents, profile photos etc.) — these are real files on disk, not in MySQL, and aren't included in this backup. Back up that directory separately (e.g. `rsync`/`tar` on the same cron schedule).
