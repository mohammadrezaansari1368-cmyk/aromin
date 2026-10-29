"""Create local Compose secrets once. Never print values or replace existing keys.

Existing installation: --app-key-file /root/existing-aromin-app-key
New disposable installation: --fresh (never use it for encrypted production data).
"""
import argparse
import os
from pathlib import Path
import secrets


def create(directory, name, value):
    path = directory / name
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        if path.is_symlink() or not path.is_file() or not path.stat().st_size:
            raise SystemExit('Unsafe existing secret file: ' + str(path))
        return
    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
        stream.write(value + '\n')
        stream.flush()
        os.fsync(stream.fileno())


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    choice = parser.add_mutually_exclusive_group(required=True)
    choice.add_argument('--app-key-file', type=Path)
    choice.add_argument('--fresh', action='store_true')
    args = parser.parse_args(argv)
    directory = Path(__file__).resolve().parent / 'secrets'
    if directory.is_symlink():
        raise SystemExit('Secret directory must not be a symlink')
    directory.mkdir(mode=0o700, exist_ok=True)
    key = args.app_key_file.read_text(encoding='utf-8').rstrip('\r\n') if args.app_key_file else secrets.token_hex(32)
    if len(key.encode()) < 32 or '\n' in key or '\r' in key:
        raise SystemExit('Existing application encryption key is invalid')
    current = directory / 'app_secrets_key'
    if current.exists() and args.app_key_file and current.read_text(encoding='utf-8').rstrip('\r\n') != key:
        raise SystemExit('Existing secret differs; no files changed. Do not rotate encryption keys during migration.')
    create(directory, 'app_secrets_key', key)
    create(directory, 'db_password', secrets.token_hex(32))
    create(directory, 'db_root_password', secrets.token_hex(32))
    print('Secret files are ready. Values were not printed; existing files were preserved.')


if __name__ == '__main__':
    main()
