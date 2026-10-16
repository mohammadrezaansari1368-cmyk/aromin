"""R01 on real MariaDB (the SQLite fake strips FOR UPDATE): server._domain_lock serializes writers per tenant+domain,
and several simultaneous waiters on an existing lock row all complete without deadlock (review R01-REV-01).
Usage (from deployment/): DB_HOST=127.0.0.1 DB_PORT=3307 DB_USER=aromin DB_PASS=local-test-only DB_NAME=aromin_dev \
    python tests/integration/concurrency_r01.py
Synthetic tenant only; never run against the production database."""
import os
import sys
import threading
import time
from pathlib import Path

import pymysql
from pymysql.cursors import DictCursor

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import server  # noqa: E402

TENANT = "r01-concurrency-test"
WAITERS = 4


def conn():
    return pymysql.connect(host=os.environ.get("DB_HOST", "127.0.0.1"), port=int(os.environ.get("DB_PORT", "3307")),
                           user=os.environ.get("DB_USER", "aromin"), password=os.environ.get("DB_PASS", ""),
                           database=os.environ.get("DB_NAME", "aromin_dev"), autocommit=False, cursorclass=DictCursor)


class Tx:
    """The same .x/.one surface as server._SaTx, on an explicit connection."""
    def __init__(self, c):
        self.c, self.cur = c, c.cursor()

    def x(self, sql, args=None):
        self.cur.execute(sql, args or ())
        return self.cur

    def one(self, sql, args=None):
        return self.x(sql, args).fetchone()


def main():
    assert os.environ.get("DB_NAME", "aromin_dev") != "aromin", "refusing to run on the main database"
    holder = conn()
    hold = Tx(holder)
    server._domain_lock(hold, TENANT, "calls")      # creates the lock row on first use
    holder.commit()
    server._domain_lock(hold, TENANT, "calls")      # existing row: the case that deadlocked with INSERT IGNORE

    order, errors = [], []

    def waiter(i):
        c = conn()
        try:
            server._domain_lock(Tx(c), TENANT, "calls")
            order.append(i)
            time.sleep(0.2)                         # hold briefly so the others queue behind
            c.commit()
        except Exception as e:                      # 1213 deadlock or 1205 timeout would land here
            errors.append((i, repr(e)))
            c.rollback()
        finally:
            c.close()

    threads = [threading.Thread(target=waiter, args=(i,)) for i in range(WAITERS)]
    for th in threads:
        th.start()
    time.sleep(1.0)
    blocked = not order                             # nobody may pass while the holder has the lock
    other = conn()
    server._domain_lock(Tx(other), TENANT, "tickets")   # another domain is independent
    other.rollback(); other.close()
    holder.commit(); holder.close()
    for th in threads:
        th.join(30)
    ok = blocked and not errors and sorted(order) == list(range(WAITERS))
    print(("OK" if ok else "FAIL") + ": blocked=%s order=%s errors=%s" % (blocked, order, errors))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
