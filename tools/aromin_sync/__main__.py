import argparse
import getpass
import json
from pathlib import Path
import shutil
import platform
import subprocess
import sys
import uuid
import unittest

from . import __version__
from .core import atomic_json
from .windows import secure_home, home, crypt, Lock, task, stop_task


def selftest():
    suite = unittest.defaultTestLoader.discover(str(Path(__file__).parent/'tests'))
    return unittest.TextTestRunner(verbosity=1).run(suite).wasSuccessful()


def update():
    repo = Path(__file__).resolve().parents[2]
    if subprocess.check_output(['git','status','--porcelain'],cwd=repo).strip():
        raise RuntimeError('پوشهٔ مخزن تغییر محلی دارد؛ به‌روزرسانی مجاز نیست.')
    # Keep an independent runnable previous folder under the owner-only ACL.
    backup_root = secure_home()/('previous-'+uuid.uuid4().hex)
    backup_root.mkdir()
    backup = backup_root/'previous'
    try:
        # Only Git-tracked source, never .env, databases, cookies or local backups.
        tracked = subprocess.check_output(['git','ls-files','-z'],cwd=repo).decode().split('\0')
        for name in filter(None,tracked):
            target = backup/name
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(repo/name,target)
        shutil.copytree(repo/'.git',backup/'.git')
        subprocess.run(['git','pull','--ff-only'],cwd=repo,check=True,capture_output=True)
        subprocess.run([sys.executable,'-m','tools.aromin_sync','selftest'],cwd=repo,check=True)
    except Exception:
        if (backup/'tools'/'aromin_sync'/'__main__.py').exists():
            task(install=True,repo=backup)
        else:
            raise RuntimeError('ساخت نسخهٔ پشتیبان ناموفق بود.') from None
        print('به‌روزرسانی ناموفق؛ وظیفه به پوشهٔ نسخهٔ قبلی بازگردانده شد.')
    else:
        shutil.rmtree(backup_root)
        task(install=True,repo=repo)


def main():
    parser = argparse.ArgumentParser(description='آرومین‌سینک؛ کنترل محلی مالک')
    parser.add_argument('command',choices=['status','run-once','login','install','uninstall','update','selftest','_serve'])
    parser.add_argument('source',nargs='?',choices=['calls','summary','deals','kpi','snapshot','conversion'])
    parser.add_argument('--dry-run',action='store_true')
    args = parser.parse_args()
    if args.command == 'selftest':
        return 0 if selftest() else 1
    if args.command == 'status':
        folder = home()
        print('آرومین‌سینک '+__version__)
        if (folder/'runtime.json').exists():
            print((folder/'runtime.json').read_text(encoding='utf-8'))
        return 0
    folder = secure_home()
    if args.command in ('login','update','uninstall'):
        stop_task()
    with Lock():
        if args.command == 'login':
            from .browser import Browser
            with Browser(folder,visible=True) as browser:
                browser.login()
                if not (folder/'secret.bin').exists():
                    tenant = input('شناسه تیم [team]: ').strip() or 'team'
                    password = getpass.getpass('رمزِ داشبورد برای ساختِ خودکارِ کلید (ذخیره نمی‌شود): ')
                    key = browser.mint_key(tenant, password, 'AROMINSync ' + platform.node()[:40])
                    del password
                    (folder/'secret.bin').write_bytes(crypt(key.encode()))
                    del key
                    atomic_json(folder/'config.json',dict(tenant=tenant,interval_minutes=5))
                    print('کلیدِ این دستگاه ساخته و رمزنگاری‌شده ذخیره شد.')
            atomic_json(folder/'runtime.json',{})
        elif args.command == 'install':
            task(install=True)
        elif args.command == 'uninstall':
            task(remove=True)
        elif args.command == 'update':
            update()
        else:
            from .service import Service
            service = Service(folder)
            if args.command == '_serve':
                service.serve()
            elif not args.source:
                parser.error('منبع لازم است.')
            else:
                service.once(args.source,dry_run=args.dry_run)
    if args.command in ('update','install'):
        task()
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        # Third-party exceptions can contain URLs, phone numbers or credentials.
        print('آرومین‌سینک انجام نشد؛ تنظیمات، نشست و وضعیت منبع را بررسی کنید.',file=sys.stderr)
        sys.exit(1)
