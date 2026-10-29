"""Standalone durable-job worker; API startup hooks and messaging loops never run.

Each report runs in a spawned child with a hard deadline. The parent owns and
renews the lease; cancelled/reclaimed jobs cannot publish a stale result.
"""
import json
import multiprocessing
import os
import signal
import threading
import time

from aromin_jobs import Store, encode, MAX_RESULT
from aromin_security import PublicPermissionError, PublicValidationError, public_error


def _child(connection, job):
    try:
        from aromin_job_handlers import execute
        result = execute({**job, 'payload': json.loads(job['payload_json'])})
        # Bound output before sending it over IPC or storing it in MariaDB.
        encode(result, MAX_RESULT)
        connection.send(('ok', result))
    except (PublicPermissionError, PermissionError):
        connection.send(('fatal', 'permission_revoked'))
    except (PublicValidationError, ValueError):
        connection.send(('fatal', 'invalid_job'))
    except Exception as error:
        public_error(error)
        connection.send(('retry', 'processing_failed'))
    finally:
        connection.close()


def process(store, job, stop=None, timeout=300, lease_ms=60000):
    stop = stop or threading.Event()
    parent, child = multiprocessing.get_context('spawn').Pipe(duplex=False)
    proc = multiprocessing.get_context('spawn').Process(target=_child, args=(child, job))
    proc.start()
    child.close()
    deadline = time.monotonic() + timeout
    heartbeat = time.monotonic() + lease_ms / 3000
    outcome = None
    try:
        while time.monotonic() < deadline:
            if stop.is_set():
                outcome = ('retry', 'worker_shutdown')
                break
            if time.monotonic() >= heartbeat:
                if not store.renew(job['id'], job['lease_token'], lease_ms):
                    return False  # cancelled or lost ownership; never acknowledge another worker's job
                heartbeat = time.monotonic() + lease_ms / 3000
            if parent.poll(0.25):
                try:
                    outcome = parent.recv()
                except EOFError:
                    outcome = ('retry', 'worker_crashed')
                break
            if not proc.is_alive():
                outcome = ('retry', 'worker_crashed')
                break
        outcome = outcome or ('retry', 'execution_timeout')
        if outcome[0] == 'ok':
            return store.complete(job['id'], job['lease_token'], outcome[1])
        return store.fail(job['id'], job['lease_token'], outcome[1], retry=outcome[0] != 'fatal')
    finally:
        if proc.is_alive():
            proc.terminate()
        proc.join(timeout=5)
        if proc.is_alive():
            proc.kill()
            proc.join(timeout=5)
        parent.close()


def main():
    import server
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())
    store = Store(server.db_conn)
    timeout = min(1800, max(10, int(os.environ.get('JOB_TIMEOUT_SECONDS', '300'))))
    while not stop.is_set():
        try:
            job = store.claim()
            if job:
                process(store, job, stop, timeout)
            else:
                stop.wait(2)
        except Exception as error:
            public_error(error)
            stop.wait(5)


if __name__ == '__main__':
    main()
