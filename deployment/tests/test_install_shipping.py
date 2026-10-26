"""WP-04: a past release auto-rolled back because install.sh/rollback.sh didn't ship a new module
or migration. Every migrations/*.sql and every aromin_*.py the server-side code imports must be
referenced in install.sh (and rollback.sh, which restores the same file set on revert)."""
import re
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
IMPORT_RE = re.compile(r'^(?:from|import)\s+(aromin_\w+)', re.MULTILINE)


def _imported_aromin_modules(*paths):
    mods = set()
    for path in paths:
        mods |= set(IMPORT_RE.findall(path.read_text(encoding='utf-8')))
    return mods


class InstallShipsEveryModuleAndMigration(unittest.TestCase):
    def test_migrations_are_shipped_by_install_and_rollback(self):
        install = (HERE / 'install.sh').read_text(encoding='utf-8')
        rollback = (HERE / 'rollback.sh').read_text(encoding='utf-8')
        # 001-004 predate the NNN_name.sql + NNN_name.down.sql.txt shipping convention and are not
        # part of the file lists below; every migration with a down file follows the convention.
        migrations = sorted(p.name.replace('.down.sql.txt', '.sql') for p in (HERE / 'migrations').glob('*.down.sql.txt'))
        self.assertTrue(migrations)
        for name in migrations:
            with self.subTest(migration=name):
                self.assertIn(name, install)
                self.assertIn(name, rollback)

    def test_server_side_aromin_modules_are_shipped_by_install_and_rollback(self):
        install = (HERE / 'install.sh').read_text(encoding='utf-8')
        rollback = (HERE / 'rollback.sh').read_text(encoding='utf-8')
        mods = _imported_aromin_modules(HERE / 'server.py', HERE / 'fix_stage_dates.py', HERE / 'validate_ledger.py')
        self.assertTrue(mods)
        for mod in mods:
            with self.subTest(module=mod):
                self.assertIn(mod + '.py', install)
                self.assertIn(mod + '.py', rollback)


if __name__ == '__main__':
    unittest.main()
