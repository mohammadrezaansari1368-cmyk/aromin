"""Worker process entry point (``python -m app.workers``).

The background worker (claim loop, reaper, scheduler, outbox dispatcher) is part of the
Task Engine phase (blueprint §20 phase 4). It is intentionally not implemented in Phase 1:
this entry point exits with an error instead of pretending to process tasks.
"""

import sys

if __name__ == "__main__":
    sys.stderr.write("aromin-agent worker is not implemented yet (Task Engine phase). Exiting.\n")
    sys.exit(2)
