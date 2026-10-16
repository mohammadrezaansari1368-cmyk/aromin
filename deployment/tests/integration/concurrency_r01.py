"""R01-01 on real MariaDB (the SQLite fake strips FOR UPDATE): a writer holding the domain lock blocks a second writer.
Usage: DB_HOST=127.0.0.1 DB_PORT=3307 DB_USER=aromin DB_PASS=local-test-only DB_NAME=aromin_dev python tests/integration/concurrency_r01.py
Synthetic tenant only; never run against the production database."""
import os
import sys

import pymysql

TENANT = "r01-concurrency-test"


def conn():
    return pymysql.connect(host=os.environ.get("DB_HOST", "127.0.0.1"), port=int(os.environ.get("DB_PORT", "3307")),
                           user=os.environ.get("DB_USER", "aromin"), password=os.environ.get("DB_PASS", ""),
                           database=os.environ.get("DB_NAME", "aromin_dev"), autocommit=False)


def take(c, domain):
    with c.cursor() as cur:
        cur.execute("INSERT IGNORE INTO import_locks (tenant,domain) VALUES (%s,%s)", (TENANT, domain))
        cur.execute("SELECT tenant FROM import_locks WHERE tenant=%s AND domain=%s FOR UPDATE", (TENANT, domain))


def main():
    assert os.environ.get("DB_NAME", "aromin_dev") != "aromin", "refusing to run on the main database"
    a, b = conn(), conn()
    try:
        with b.cursor() as cur:
            cur.execute("SET SESSION innodb_lock_wait_timeout=2")
        take(a, "calls")              # writer A holds the calls lock (an upload or a batch delete in progress)
        try:
            take(b, "calls")          # writer B must wait, then time out
            print("FAIL: second writer was not blocked"); return 1
        except pymysql.err.OperationalError as e:
            assert e.args[0] == 1205, e
            b.rollback()
        take(b, "tickets")            # another domain is independent
        b.rollback()
        a.commit()
        take(b, "calls")              # free again once A commits
        b.commit()
        print("OK: domain lock serializes writers per tenant+domain")
        return 0
    finally:
        for c in (a, b):
            c.close()


if __name__ == "__main__":
    sys.exit(main())
