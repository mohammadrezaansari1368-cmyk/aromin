"""Synthetic public-turn deadlines; no network or credentials."""
import contextlib
import io
import sys
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class SiteDeadline(unittest.TestCase):
    def setUp(self):
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        for name, value in [('agent_enabled', False), ('agent_model', 'synthetic'),
                            ('sa_prompt', 'persona'), ('assistant_grounding', ''),
                            ('sa_products_ctx', ('', ''))]:
            self.stack.enter_context(patch.object(server, name, return_value=value))
        self.stack.enter_context(patch.object(server, 'SA_TURN_BUDGET', .4))
        if hasattr(server, '_SA_READ_FAILURES'):
            server._SA_READ_FAILURES.clear()
        self.site = {'tenant': 'fixture', 'siteId': 'synthetic'}
        self.history = [{'role': 'user', 'content': 'synthetic-visitor-private'}]

    def test_hanging_knowledge_is_skipped_and_negative_cached(self):
        release = threading.Event()
        self.addCleanup(release.set)
        def hang(*args, **kwargs):
            release.wait(2)
            return 'late knowledge'
        with patch.object(server, 'assistant_system', side_effect=hang) as kb, patch.object(server, 'ai_chat', return_value={'ok': True, 'text': 'answer'}) as ai:
            start = time.monotonic()
            first = server.sa_reply(self.site, self.history, dry_run=True)
            second = server.sa_reply(self.site, self.history, dry_run=True)
        self.assertEqual(first.get('text'), 'answer')
        self.assertEqual(second.get('text'), 'answer')
        self.assertLess(time.monotonic() - start, .4)
        self.assertEqual(kb.call_count, 1)
        self.assertIn('persona', ai.call_args.args[0])
        self.assertIn(server.AROMIN_IDENTITY, ai.call_args.args[0])

    def test_hanging_model_reports_fixed_stage_without_private_text(self):
        release = threading.Event()
        self.addCleanup(release.set)
        def hang(*args, **kwargs):
            release.wait(2)
            return {'ok': False, 'error': 'synthetic-provider-private'}
        output = io.StringIO()
        with patch.object(server, 'assistant_system', return_value='identity'), patch.object(server, 'ai_chat', side_effect=hang), contextlib.redirect_stdout(output):
            start = time.monotonic()
            out = server.sa_reply(self.site, self.history, dry_run=True)
        self.assertEqual(out['code'], 'timeout')
        self.assertEqual(out.get('stage'), 'model')
        self.assertLess(time.monotonic() - start, .65)
        self.assertNotIn('private', str(out) + output.getvalue())
        self.assertIn('stage=model', output.getvalue())
        self.assertIn('knowledge=', output.getvalue())

    def test_model_timeout_is_bounded_and_default_stays_60(self):
        import inspect
        self.assertEqual(inspect.signature(server.ai_chat).parameters['timeout'].default, 60)
        with patch.object(server, 'assistant_system', return_value='identity'), patch.object(server, 'ai_chat', return_value={'ok': True, 'text': 'answer'}) as ai:
            server.sa_reply(self.site, self.history, dry_run=True)
        self.assertGreaterEqual(ai.call_args.kwargs['timeout'], 3)
        self.assertLessEqual(ai.call_args.kwargs['timeout'], 60)

    def test_hanging_catalog_reports_only_allowed_stage(self):
        release = threading.Event()
        self.addCleanup(release.set)
        with patch.object(server, 'assistant_system', return_value='identity'), patch.object(server, 'sa_products_ctx', side_effect=lambda *a, **kw: (release.wait(2), '')), patch.object(server, 'ai_chat', return_value={'ok': True, 'text': 'answer'}):
            out = server.sa_reply(self.site, self.history, dry_run=True)
        self.assertEqual(out.get('text'), 'answer')

    def test_public_s3_calls_use_short_timeout_and_cache_failure(self):
        server._kb_docs_cache.clear()
        server._sa_cache.pop(('catalog', 'fixture'), None)
        with patch.object(server, '_s3_ready', return_value=True), patch.object(server, '_s3', side_effect=TimeoutError('synthetic-private')) as s3, patch.object(server, 'kb_migrate') as migrate:
            self.assertEqual(server._sa_catalog('fixture', timeout=8), [])
            self.assertEqual(server._sa_catalog('fixture', timeout=8), [])
            self.assertEqual(server._kb_read_docs('fixture', True, timeout=8), [])
            self.assertEqual(server._kb_read_docs('fixture', True, timeout=8), [])
        self.assertEqual(s3.call_count, 2)
        self.assertTrue(all(c.kwargs['timeout'] <= 8 for c in s3.call_args_list))
        migrate.assert_not_called()
        server._kb_docs_cache.clear()
        server._sa_cache.pop(('catalog', 'fixture'), None)

    def test_zurvan_hanging_knowledge_stays_unavailable(self):
        release = threading.Event()
        self.addCleanup(release.set)
        with patch.object(server, 'assistant_system', side_effect=lambda *a, **kw: release.wait(2)), patch.object(server, 'ai_chat') as ai:
            out = server.sa_reply(self.site, self.history, dry_run=True, spec={'agent': 'zurvan', 'persona': 'persona', 'scope': ['zurvan_public']})
        self.assertEqual(out['code'], 'knowledge')
        ai.assert_not_called()

    def test_stage_vocabulary_and_untrusted_stage_are_fixed(self):
        self.assertEqual(set(server.SA_STAGES), {'catalog', 'knowledge', 'grounding', 'model', 'search'})
        from unittest.mock import Mock
        future = Mock()
        future.result.side_effect = TimeoutError()
        future.add_done_callback.side_effect = lambda callback: callback(future)
        def submit(*args):
            args[-1]['stage'] = 'synthetic-private'
            return future
        with patch.object(server._SA_POOL, 'submit', side_effect=submit):
            out = server.sa_reply(self.site, self.history)
        self.assertEqual(out['stage'], 'catalog')
        self.assertNotIn('private', str(out))

    def test_hanging_kb_reader_finishes_before_turn_budget(self):
        release = threading.Event()
        finished = threading.Event()
        def hang(*args, **kwargs):
            try:
                release.wait(2)
                return []
            finally:
                finished.set()
        try:
            with patch.object(server, '_kb_read_docs', side_effect=hang), patch.object(server, 'ai_chat', return_value={'ok': True, 'text': 'answer'}):
                start = time.monotonic()
                out = server.sa_reply(self.site, self.history, dry_run=True)
                self.assertEqual(out.get('text'), 'answer')
                self.assertNotIn('timeout', str(out))
                self.assertLess(time.monotonic() - start, .4)
        finally:
            release.set()
            finished.wait(1)
