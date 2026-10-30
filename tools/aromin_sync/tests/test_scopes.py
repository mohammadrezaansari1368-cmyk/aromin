import importlib.util
from pathlib import Path

path = Path(__file__).resolve().parents[3]/'deployment'/'tests'/'test_api_key_scopes.py'
spec = importlib.util.spec_from_file_location('sync_scope_proof',path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
ScopeChecks = module.ScopeChecks
