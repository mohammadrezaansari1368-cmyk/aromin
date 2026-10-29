"""Read mounted secret files, then exec; never print their contents."""
import os
from pathlib import Path
import sys


def main():
    for name in ('DB_PASS', 'AROMIN_SECRETS_KEY', 'AROMIN_SESSION_SECRET'):
        filename = os.environ.get(name + '_FILE')
        if filename:
            value = Path(filename).read_text(encoding='utf-8').rstrip('\r\n')
            if not value or len(value) > 4096:
                raise SystemExit('Invalid mounted secret: ' + name)
            if name != 'DB_PASS' and len(value.encode()) < 32:
                raise SystemExit('Mounted secret is too short: ' + name)
            os.environ[name] = value
    if not os.environ.get('DB_PASS') or os.environ['DB_PASS'] == 'change-me':
        raise SystemExit('A database password is required')
    # Queue children inherit the same persistent configuration. No credentials on argv.
    os.umask(0o077)
    os.execvp(sys.argv[1], sys.argv[1:])


if __name__ == '__main__':
    main()
