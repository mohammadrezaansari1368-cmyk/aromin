"""Package the verified build without environment files, data, or credentials."""
from pathlib import Path
import hashlib
import re
import shutil
import zipfile

root = Path(__file__).resolve().parents[1]
deploy = root / 'deployment'
dist = root / 'frontend/dist'
assert (dist / 'index.html').is_file(), 'Run npm run build in frontend first'
version = re.search(r'APP_VERSION\s*=\s*"([0-9.]+)"', (deploy / 'legacy.html').read_text())[1]
# This is the generated deployment output, not a source or customer-data directory.
shutil.rmtree(deploy / 'web')
shutil.copytree(dist, deploy / 'web')
files = [p for p in deploy.rglob('*') if p.is_file() and '__pycache__' not in p.parts and 'tests' not in p.relative_to(deploy).parts and not p.name.startswith('.')]
manifest = '\n'.join(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.relative_to(deploy).as_posix() for p in sorted(files)) + '\n'
output = root / 'releases' / f'aromin-deploy-{version}.zip'
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in files: z.write(p, 'aromin-deploy/' + p.relative_to(deploy).as_posix())
    z.writestr('aromin-deploy/SHA256SUMS', manifest)
with zipfile.ZipFile(output) as z:
    assert z.testzip() is None
    for line in manifest.splitlines():
        digest, name = line.split('  ', 1)
        assert hashlib.sha256(z.read('aromin-deploy/' + name)).hexdigest() == digest
output.with_suffix('.zip.sha256').write_text(hashlib.sha256(output.read_bytes()).hexdigest() + '  ' + output.name + '\n')
print(str(output))
print(f'{len(files)} files; {output.stat().st_size} bytes; ZIP CRC and SHA-256 entries verified')
