"""Archive the corresponding source, excluding private QA and build output."""
from pathlib import Path
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
files = subprocess.check_output(
    ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=root
).decode("utf-8").split("\0")
destination = root / "build" / "CarterTube-source.zip"
destination.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
    for name in sorted(set(files)):
        if not name:
            continue
        source = root / name
        source.resolve().relative_to(root.resolve())
        if source.is_file() and not source.is_symlink():
            archive.write(source, "CarterTube/" + name)
with zipfile.ZipFile(destination) as archive:
    assert not any("/qa/" in name or "/node_modules/" in name for name in archive.namelist())
    assert archive.testzip() is None
print(f"Source archive created: {destination}")
