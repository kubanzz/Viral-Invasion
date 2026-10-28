import hashlib
import json
from pathlib import Path
import zipfile
import sys

root = Path.cwd()
archive = root / 'releases/Viral-Invasion-G4-v0.8.9.zip'
folder = root / 'artifacts/source-v089' / sys.argv[1]
folder.mkdir(exist_ok=False)
unpacked = folder / 'unpacked'
unpacked.mkdir()
package = json.loads((root / 'artifacts/source-v089/release-attempt-1/package-report.json').read_text(encoding='utf8'))
expected = {row['name']: row for row in package['files']}
files = []
with zipfile.ZipFile(archive) as reader:
    assert reader.testzip() is None
    assert len(reader.namelist()) == len(set(reader.namelist())) == 5
    assert set(reader.namelist()) == set(expected)
    for entry in reader.infolist():
        assert Path(entry.filename).name == entry.filename
        data = reader.read(entry)
        digest = hashlib.sha256(data).hexdigest()
        assert digest == expected[entry.filename]['sha256']
        assert len(data) == expected[entry.filename]['bytes']
        (unpacked / entry.filename).write_bytes(data)
        files.append({'name': entry.filename, 'bytes': len(data), 'sha256': digest})
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
assert digest == package['sha256']
report = {'pass': True, 'method': 'Independent Python standard-library ZIP CRC verification and exact five-entry size/hash check versus the package report; extracted bytes are used for subsequent offline smoke.', 'archive': str(archive), 'bytes': archive.stat().st_size, 'sha256': digest, 'files': files, 'unpacked': str(unpacked)}
(folder / 'inspection.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps({'pass': True, 'entries': len(files), 'sha256': digest}))
