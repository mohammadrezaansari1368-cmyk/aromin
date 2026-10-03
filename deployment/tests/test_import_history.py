import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server

class ImportHistoryTests(unittest.TestCase):
    def test_ordinary_save_cannot_delete_or_rewrite_history(self):
        entry = dict(ts=1, name='file.xlsx', type='deal', sig='a', rows=5)
        old = {'importLog': [entry]}
        new = {'importLog': [dict(entry, rows=0)], '_importDeleted': [server._import_key(entry)]}
        server._preserve_import_history(old, new)
        self.assertEqual(new['importLog'], [entry])
        self.assertEqual(new['_importDeleted'], [])

    def test_stale_save_cannot_resurrect_deleted_history(self):
        entry = dict(ts=1, name='file.xlsx', type='deal')
        old = {'_importDeleted': [server._import_key(entry)], 'importLog': []}
        new = {'importLog': [entry]}
        server._preserve_import_history(old, new)
        self.assertEqual(new['importLog'], [])

    def test_delete_requires_server_verified_admin(self):
        for ident, status in [(None, 401), ({'user':'f','role':'finance'},403), ({'user':'s','role':'sales'},403)]:
            with self.subTest(ident=ident), patch.object(server, 'kb_identity', return_value=ident), patch.object(server, 'db_conn') as db:
                result = server.import_history_delete(None, {'tenant':'test','entry':{}})
                self.assertEqual(result.status_code, status)
                db.assert_not_called()

if __name__ == '__main__': unittest.main()
