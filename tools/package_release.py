"""Package the verified build without environment files, data, or credentials."""
from pathlib import Path
import hashlib
import re
import shutil
import zipfile
import tarfile
import io

root = Path(__file__).resolve().parents[1]
deploy = root / 'deployment'
dist = root / 'frontend/dist'
assert (dist / 'index.html').is_file(), 'Run npm run build in frontend first'
version = re.search(r'APP_VERSION\s*=\s*"([0-9.]+)"', (deploy / 'legacy.html').read_text())[1]
# This is the generated deployment output, not a source or customer-data directory.
shutil.rmtree(deploy / 'web')
shutil.copytree(dist, deploy / 'web')
files = [p for p in deploy.rglob('*') if p.is_file() and '__pycache__' not in p.parts and not {'tests', 'media'} & set(p.relative_to(deploy).parts) and (p.name == '.env.example' or not any(part.startswith('.') for part in p.relative_to(deploy).parts))]
for required in ('aromin_stage.py', 'fix_stage_dates.py', 'validate_ledger.py', 'aromin_publish.py', 'assets/aromin-logo.webp', 'assets/fonts/Vazirmatn-Regular.ttf',
                 'assets/fonts/Vazirmatn-Bold.ttf', 'assets/fonts/OFL.txt', 'migrations/005_publishing.sql',
                 'migrations/005_publishing.down.sql.txt'):
    assert deploy / required in files, 'Missing publishing package file: ' + required
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

# Preserve the deployment format used by WinSCP/SSH installations.
archive = output.with_suffix('.tgz')
with zipfile.ZipFile(output) as z, tarfile.open(archive, 'w:gz') as t:
    for name in z.namelist():
        data = z.read(name)
        info = tarfile.TarInfo(name)
        info.size = len(data)
        info.mode = 0o755 if name.endswith('.sh') else 0o644
        t.addfile(info, io.BytesIO(data))
with tarfile.open(archive, 'r:gz') as t, zipfile.ZipFile(output) as z:
    for name in z.namelist():
        assert t.extractfile(name).read() == z.read(name)
print(str(archive))
print('MD5: ' + hashlib.md5(archive.read_bytes()).hexdigest())
