"""Synthetic latency regressions; no external services."""
import contextlib
import sys
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class SiteLatency(unittest.TestCase):
    def setUp(self):
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        server._SA_READ_FAILURES.clear()
        for name, value in [('agent_enabled', False), ('agent_model', 'synthetic'),
                            ('sa_prompt', 'persona'), ('sa_products_ctx', ('', '')),
                            ('assistant_grounding', ''), ('kb_context', 'K' * 10000),
                            ('ai_chat', {'ok': True, 'text': 'answer'})]:
            setattr(self, name, self.stack.enter_context(patch.object(server, name, return_value=value)))
        self.site = {'tenant': 'fixture', 'siteId': 'synthetic'}

    def reply(self, text='سلام', history=None):
        return server.sa_reply(self.site, history or [{'role': 'user', 'content': text}], dry_run=True)

    def test_prompt_master_only_for_latest_prompt_message(self):
        for text in ['پرامپت بنویس', 'prompt please', 'ChatGPT', 'Claude', 'Gemini', 'Midjourney', 'چت جی پی تی']:
            self.reply(text)
            self.assertIn(server.SA_PROMPT_MASTER, self.ai_chat.call_args.args[0])
        for text in ['سلام', 'قیمت چاپگر؟']:
            self.reply(history=[{'role': 'user', 'content': 'prompt'}, {'role': 'user', 'content': text}])
            self.assertNotIn(server.SA_PROMPT_MASTER, self.ai_chat.call_args.args[0])

    def test_slow_grounding_degrades_to_unverified_notice_not_silence(self):
        def slow(*a, **k):
            time.sleep(1.5)
            return 'VERIFIED'
        with patch.object(server, 'assistant_grounding', side_effect=slow), patch.object(server, 'SA_TURN_BUDGET', 4):
            self.reply('قیمت صندوق چقدره؟')
        prompt = self.ai_chat.call_args.args[0]
        self.assertNotIn('VERIFIED', prompt)
        self.assertIn(server._grounding_unverified().strip(), prompt)
        server._SA_READ_FAILURES.clear()
        self.reply('سلام')
        self.assertNotIn(server._grounding_unverified().strip(), self.ai_chat.call_args.args[0])


    def test_widget_cap_leaves_dashboard_and_telegram_unchanged(self):
        with patch.object(server, 'SA_KB_MAX', 1234):
            self.reply()
            self.assertEqual(self.ai_chat.call_args.args[0].count('K'), 1234)
            for scope in ['dashboard', 'telegram']:
                system = server.assistant_system('fixture', scope=scope)
                self.assertEqual(system.count('K'), min(10000, max(server.KB_PROMPT_MAX, server.KB_RETRIEVE_MAX)))

    def test_knowledge_and_grounding_overlap(self):
        def slow(value):
            def call(*args, **kwargs):
                time.sleep(.2)
                return value
            return call
        with patch.object(server, 'assistant_system', side_effect=slow('identity')), patch.object(server, 'assistant_grounding', side_effect=slow('grounded')):
            start = time.monotonic()
            self.reply()
            elapsed = time.monotonic() - start
        self.assertLess(elapsed, .34)
        self.assertIn('grounded', self.ai_chat.call_args.args[0])

    def test_grounding_deadline_degrades_and_negative_caches(self):
        release = threading.Event()
        self.addCleanup(release.set)
        def hang(*args, **kwargs):
            release.wait(1)
            return 'late'
        with patch.object(server, 'SA_TURN_BUDGET', .4), patch.object(server, 'assistant_grounding', side_effect=hang) as grounding:
            start = time.monotonic()
            first, second = self.reply(), self.reply()
            elapsed = time.monotonic() - start
        self.assertEqual(first['text'], 'answer')
        self.assertEqual(second['text'], 'answer')
        self.assertEqual(grounding.call_count, 1)
        self.assertLess(elapsed, .3)
        self.assertNotIn('late', self.ai_chat.call_args.args[0])

    def test_header_fixed_vocabulary_success_and_timeout(self):
        def check(out):
            response = server._w_json(out, 'https://example.test')
            header = response.headers['x-sa-timing']
            parts = dict(piece.split('=') for piece in header.split(';'))
            self.assertEqual(set(parts), {'catalog', 'knowledge', 'grounding', 'llm', 'search', 'total'})
            for value in parts.values():
                self.assertGreaterEqual(float(value), 0)
            self.assertNotIn('_sa_timing', response.body.decode())
        check(self.reply())
        with patch.object(server, 'SA_TURN_BUDGET', .05), patch.object(server, 'ai_chat', side_effect=lambda *a, **kw: (time.sleep(.1) or {'ok': True, 'text': 'late'})):
            out = self.reply()
            self.assertEqual(out['stage'], 'model')
            check(out)
