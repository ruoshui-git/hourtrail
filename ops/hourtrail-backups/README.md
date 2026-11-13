# Hourtrail encrypted backups

This private repository stores nightly encrypted exports of the Hourtrail production D1 database. The workflow uses a D1-only Cloudflare token and encrypts every dump to the configured `age` recipient before committing it.

Run it by opening **Actions → Nightly D1 backup → Run workflow**. Scheduled runs always export production. Manual runs can select production or staging.

To decrypt a dump locally, use the private key from your password manager:

```sh
age -d -i <key> dumps/YYYY/hourtrail-YYYY-MM-DD.sql.age > dump.sql
```

Run the local restore verification with `scripts/restore-drill <dump.sql.age> --identity <key file>`. The drill decrypts into a protected temporary file, loads a fresh local D1, and compares database record counts with the dump.
