"""Migration 006 loads into the SQLite fake, is idempotent, and its down file drops exactly its tables."""
import re
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db_fake import load_schema

MIG = Path(__file__).resolve().parents[1] / 'migrations'
TABLES = {'identity_aliases', 'attendance_batches', 'attendance_days', 'attendance_overrides', 'attendance_settings'}


class Migration006(unittest.TestCase):
    def test_loads_twice_and_keys_hold(self):
        sql = (MIG / '006_identity_attendance.sql').read_text(encoding='utf-8')
        creates = re.findall(r'CREATE TABLE[^(]*', sql)
        self.assertEqual(len(creates), 5)
        self.assertTrue(all('IF NOT EXISTS' in c for c in creates))
        code = re.sub(r'--[^\n]*', '', sql).upper()   # the SQLite fake cannot load these MariaDB-only forms
        for banned in ('ON DUPLICATE KEY', 'ENUM(', ' JSON', 'COLLATE'):
            self.assertNotIn(banned, code)
        with tempfile.TemporaryDirectory() as tmp:
            db = str(Path(tmp) / 'm.sqlite')
            load_schema(MIG / '006_identity_attendance.sql', db)
            load_schema(MIG / '006_identity_attendance.sql', db)
            cx = sqlite3.connect(db)
            try:
                names = {r[0] for r in cx.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                self.assertTrue(TABLES <= names)
                row = ('t', '1', '1405/06/01', 's', '[]', '{}', 'x' * 64, 1, '2026-01-01')
                ins = 'INSERT INTO attendance_days (tenant,card_no,date_j,sheet_name,punches,raw_json,row_sha256,batch_id,updated_at) VALUES (?,?,?,?,?,?,?,?,?)'
                cx.execute(ins, row)
                with self.assertRaises(sqlite3.IntegrityError):
                    cx.execute(ins, row)
                cx.execute(ins, ('t2',) + row[1:])
                alias = 'INSERT INTO identity_aliases (tenant,kind,alias_key,raw_value,source,status,confidence,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)'
                cx.execute(alias, ('t', 'card', '9', 'x', 'attendance', 'review', 'weak', 'n', 'n'))
                with self.assertRaises(sqlite3.IntegrityError):
                    cx.execute(alias, ('t', 'card', '9', 'y', 'attendance', 'review', 'weak', 'n', 'n'))
                cx.executescript((MIG / '006_identity_attendance.down.sql.txt').read_text(encoding='utf-8'))
                self.assertFalse(TABLES & {r[0] for r in cx.execute("SELECT name FROM sqlite_master WHERE type='table'")})
            finally:
                cx.close()


if __name__ == '__main__':
    unittest.main()
