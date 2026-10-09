from pathlib import Path
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
output = root / 'build' / 'CarterMedia-source.zip'
output.parent.mkdir(exist_ok=True)
files = subprocess.check_output(
    ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    cwd=root,
).decode('utf-8').split('\0')
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for relative in sorted(set(files)):
        if not relative:
            continue
        source = root / relative
        if source.is_file() and source.resolve().is_relative_to(root):
            archive.write(source, 'CarterMedia/' + relative)
with zipfile.ZipFile(output) as archive:
    failure = archive.testzip()
    if failure:
        raise RuntimeError('Source archive validation failed: ' + failure)
    if not any(name.endswith('/video_engine.rs') for name in archive.namelist()):
        raise RuntimeError('Source archive is missing the native integration')
    if not any(name.endswith('/embeddedHost.js') for name in archive.namelist()):
        raise RuntimeError('Source archive is missing the video integration')
print(str(output))
