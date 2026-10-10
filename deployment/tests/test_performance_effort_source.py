"""/api/performance/source projects the effort inputs (scoped), the cap/targets and hourly call stats; nothing else."""
import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1])); sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_performance_workspace import Performance


class EffortSource(Performance):
    def test_effort_fields_settings_and_scope(self):
        p = self.full['people'][0]['perf']
        p.update({'talkMin': 90, 'taskMins': [10, 50], 'activeDays': 2, 'callsIn': 3, 'callsOut': 4, 'tasks': 5, 'secret': 'x'})
        self.full['people'][0]['perfSet'] = {'taskTarget': 120, 'perfPct': 99}
        self.full['perf'] = {'taskCapMin': 30, 'taskTarget': 300, 'callTarget': 400, 'taskTiers': [1]}
        self.full['callstats'] = {'hours': {'10': 5}, 'n': 9}
        src = self.call('source')['full']
        me = src['people'][0]['perf']
        self.assertEqual((me['talkMin'], me['taskMins'], me['activeDays'], me['tasks']), (90, [10, 50], 2, 5))
        self.assertNotIn('secret', me)
        self.assertEqual(src['people'][0]['perfSet'], {'taskTarget': 120})   # perfPct (pay) is not exposed
        self.assertEqual(src['perfCfg'], {'taskCapMin': 30, 'taskTarget': 300, 'callTarget': 400})
        self.assertEqual(src['callHours'], {'10': 5})
        self.assertEqual(len(src['people']), 1)                                  # employee sees only themself


if __name__ == '__main__':
    unittest.main()
