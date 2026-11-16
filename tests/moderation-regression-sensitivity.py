"""Run real regression tests against deliberately broken disposable copies only."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

repo = Path(__file__).resolve().parents[1]
mutations = [
    ('publication-bypass', 'server/validation.js', "if (body.published === true || (body.publication_status !== undefined && body.publication_status !== 'private'))", 'if (false)', 'tests/unit.test.js', 'catalog validates'),
    ('readiness-missing-006', 'server/readiness.js', ", '006_account_sessions.sql'", '', 'tests/api-boundaries.test.js', 'readiness rejects 005'),
    ('session-revocation-bypass', 'auth.js', "if (!Number.isSafeInteger(version) || version < 0 || version !== (result.rows[0].session_version ?? 0))", 'if (false)', 'tests/api-boundaries.test.js', 'password session versions'),
    ('admin-role-bypass', 'auth.js', "if (req.user?.role !== 'admin')", 'if (false)', 'tests/api-boundaries.test.js', 'current database role'),
]
with tempfile.TemporaryDirectory(prefix='fse-moderation-regressions-') as folder:
    copy = Path(folder)
    for name in ['coreFSE.js', 'auth.js', 'db.js', 'utils.js', 'package.json']:
        shutil.copy2(repo / name, copy / name)
    for name in ['server', 'tests']:
        shutil.copytree(repo / name, copy / name)
    (copy / 'node_modules').symlink_to(repo / 'node_modules', target_is_directory=True)
    env = {**os.environ, 'DOTENV_CONFIG_PATH': '/dev/null'}
    for label, file, before, after, test, pattern in mutations:
        path = copy / file
        original = path.read_text()
        assert before in original, f'Mutation target changed: {label}'
        args = ['node', '--test', '--test-name-pattern=' + pattern, test]
        baseline = subprocess.run(args, cwd=copy, env=env, capture_output=True, text=True)
        assert baseline.returncode == 0, baseline.stdout + baseline.stderr
        try:
            path.write_text(original.replace(before, after, 1))
            broken = subprocess.run(args, cwd=copy, env=env, capture_output=True, text=True)
            assert broken.returncode != 0, f'Undetected regression: {label}'
            assert 'AssertionError' in broken.stdout + broken.stderr, broken.stdout + broken.stderr
            print('DETECTED:', label)
        finally:
            path.write_text(original)
