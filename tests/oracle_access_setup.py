import contextlib
import io
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('setup', Path(__file__).resolve().parents[1] / 'scripts/oracle_access_setup.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)

class SetupTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.parent = Path(self.directory.name)
        os.chmod(self.parent, 0o700)
        self.path = self.parent / 'auth.json'
        self.raw = '{\n    "memo_api_token": "dummy-api-token",\n    "cf_access_client_id": "",\n    "cf_access_client_secret": "",\n    "memo_api_url": "' + setup.ENDPOINT + '",\n    "extra": {"unchanged": true}\n}\n'
        self.path.write_text(self.raw)
        os.chmod(self.path, 0o600)

    def test_preserve_format_other_values_and_permissions(self):
        raw, config = setup.read_config(self.path)
        updated = setup.updated_document(raw, config, 'dummy-id', 'dummy-secret')
        self.assertEqual(updated, raw.replace('"cf_access_client_id": ""', '"cf_access_client_id": "dummy-id"').replace('"cf_access_client_secret": ""', '"cf_access_client_secret": "dummy-secret"'))
        setup.save_config(self.path, raw, updated)
        self.assertEqual(self.path.read_text(), updated)
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.parent.stat().st_mode), 0o700)

    def test_reject_unsafe_permissions_and_symlink(self):
        os.chmod(self.path, 0o644)
        with self.assertRaises(ValueError): setup.read_config(self.path)
        os.chmod(self.path, 0o600)
        link = self.parent / 'link.json'
        link.symlink_to(self.path)
        with self.assertRaises(ValueError): setup.read_config(link)

    def test_replace_failure_leaves_existing_file_and_no_temporary(self):
        with patch.object(setup.os, 'replace', side_effect=OSError('simulated')):
            with self.assertRaises(setup.SetupError) as caught: setup.save_config(self.path, self.raw, self.raw)
            self.assertEqual(caught.exception.code, 'WRITE_FAILED')
        self.assertEqual(self.path.read_text(), self.raw)
        self.assertEqual(list(self.parent.glob('.auth-*')), [])

    def test_refuse_concurrent_change(self):
        self.path.write_text(self.raw + ' ')
        with self.assertRaises(ValueError): setup.save_config(self.path, self.raw, self.raw)
        self.assertEqual(self.path.read_text(), self.raw + ' ')

    def test_no_credential_overwrite_or_invalid_values(self):
        raw, config = setup.read_config(self.path)
        for value in ('', 'bad\nheader'):
            with self.assertRaises(ValueError): setup.updated_document(raw, config, value, 'dummy')
        config['cf_access_client_id'] = 'already-present'
        with self.assertRaises(ValueError): setup.updated_document(raw, config, 'new', 'new')

    def test_http_redirects_are_not_followed(self):
        self.assertIsNone(setup.NoRedirect().redirect_request(None, None, 302, None, None, 'https://other.test'))



class ConfigureDiagnosticsTests(unittest.TestCase):
    setUp = SetupTests.setUp
    client_id = 'dummy-ID-A9'
    secret = 'dummy-SECRET-k8'

    def run_configure(self, inputs=None, terminal_error=None, write_error=None):
        output, errors = io.StringIO(), io.StringIO()
        terminal = io.StringIO()
        terminal.isatty = lambda: True
        supplied = inputs if inputs is not None else [self.client_id, self.secret, self.secret]
        with contextlib.ExitStack() as stack:
            stack.enter_context(patch.object(setup, 'AUTH_PATH', self.path))
            stack.enter_context(patch.object(setup.resource, 'setrlimit'))
            stack.enter_context(patch('builtins.open', side_effect=terminal_error) if terminal_error else patch('builtins.open', return_value=terminal))
            reader = stack.enter_context(patch.object(setup.getpass, 'getpass', side_effect=supplied))
            if write_error:
                stack.enter_context(patch.object(setup.os, 'replace', side_effect=write_error))
            stack.enter_context(contextlib.redirect_stdout(output))
            stack.enter_context(contextlib.redirect_stderr(errors))
            result = setup.main(['configure'])
        printed = output.getvalue() + errors.getvalue()
        for value in (self.client_id, self.secret, 'dummy-api-token'):
            self.assertNotIn(value, printed)
        return result, printed, reader.call_count

    def assert_failure(self, inputs, code, calls):
        result, output, count = self.run_configure(inputs)
        self.assertEqual(result, 1)
        self.assertIn('未保存', output)
        self.assertIn('[' + code + ']', output)
        self.assertNotIn('保存・再読込検証成功', output)
        self.assertEqual(count, calls)
        self.assertEqual(self.path.read_text(), self.raw)

    def test_normal_configure_saves_exact_values(self):
        # Leading/trailing punctuation must remain unmodified.
        self.secret = '\"dummy-SECRET-k8\\'
        result, output, count = self.run_configure()
        self.assertEqual(result, 0)
        self.assertIn('保存・再読込検証成功', output)
        saved = json.loads(self.path.read_text())
        self.assertEqual(saved['cf_access_client_id'], self.client_id)
        self.assertEqual(saved['cf_access_client_secret'], self.secret)
        self.assertEqual(saved['memo_api_token'], 'dummy-api-token')
        self.assertEqual(saved['extra'], {'unchanged': True})
        self.assertEqual(self.path.read_text(), self.raw.replace('"cf_access_client_id": ""', '"cf_access_client_id": ' + json.dumps(self.client_id)).replace('"cf_access_client_secret": ""', '"cf_access_client_secret": ' + json.dumps(self.secret)))
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.parent.stat().st_mode), 0o700)

    def test_client_id_errors_are_immediate(self):
        for value, suffix in [('', 'EMPTY'), (' ' + self.client_id, 'WHITESPACE'),
                              (self.client_id + ' ', 'WHITESPACE'),
                              (self.client_id + '\t', 'CONTROL'),
                              ('\x1b[200~' + self.client_id + '\x1b[201~', 'CONTROL'),
                              (self.client_id + '\u200b', 'CONTROL'),
                              (self.client_id + 'あ', 'NON_ASCII')]:
            with self.subTest(reason=suffix): self.assert_failure([value], 'CLIENT_ID_' + suffix, 1)

    def test_client_secret_errors_are_immediate(self):
        for value, suffix in [('', 'EMPTY'), (' ' + self.secret, 'WHITESPACE'),
                              (self.secret + ' ', 'WHITESPACE'),
                              (self.secret + '\n', 'CONTROL'),
                              (self.secret + '\x7f', 'CONTROL'),
                              (self.secret + '\u200b', 'CONTROL'),
                              (self.secret + 'あ', 'NON_ASCII')]:
            with self.subTest(reason=suffix): self.assert_failure([self.client_id, value], 'CLIENT_SECRET_' + suffix, 2)

    def test_confirmation_mismatch(self):
        self.assert_failure([self.client_id, self.secret, self.secret + ' '], 'SECRET_CONFIRM_MISMATCH', 3)

    def test_terminal_failures(self):
        for failure in [OSError(self.secret), EOFError(self.secret), KeyboardInterrupt(), setup.getpass.GetPassWarning(self.secret)]:
            with self.subTest(kind=type(failure).__name__):
                inputs = [self.client_id, failure]
                self.assert_failure(inputs, 'TERMINAL_INPUT_ERROR', 2)
        result, output, count = self.run_configure(terminal_error=OSError(self.secret))
        self.assertEqual(result, 1)
        self.assertIn('[TERMINAL_INPUT_ERROR]', output)
        self.assertIn('未保存', output)
        self.assertEqual(count, 0)

    def test_write_failure_is_redacted_and_keeps_original(self):
        result, output, _ = self.run_configure(write_error=OSError(self.secret))
        self.assertEqual(result, 1)
        self.assertIn('[WRITE_FAILED]', output)
        self.assertIn('未保存', output)
        self.assertEqual(self.path.read_text(), self.raw)
        self.assertEqual(list(self.parent.glob('.auth-*')), [])

    def test_post_replace_failure_does_not_claim_success_or_unchanged(self):
        original_read = setup.read_config
        count = 0
        def read(path):
            nonlocal count
            count += 1
            if count == 3: raise OSError(self.secret)
            return original_read(path)
        with patch.object(setup, 'read_config', side_effect=read):
            result, output, _ = self.run_configure()
        self.assertEqual(result, 1)
        self.assertIn('[SAVE_CONFIRM_FAILED]', output)
        self.assertIn('未保存', output)
        self.assertIn('更新済みの可能性', output)
        self.assertEqual(json.loads(self.path.read_text())['cf_access_client_secret'], self.secret)

    def test_config_read_failure_is_redacted(self):
        with patch.object(setup, 'read_config', side_effect=OSError(self.secret)):
            result, output, _ = self.run_configure()
        self.assertEqual(result, 1)
        self.assertIn('[CONFIG_READ_FAILED]', output)
        self.assertIn('未保存', output)

    def test_real_getpass_in_dummy_pty(self):
        import pty
        import select
        import signal
        import time
        code = """
import importlib.util,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('setup',sys.argv[1])
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.AUTH_PATH=Path(sys.argv[2])
sys.exit(m.main(['configure']))
"""
        cases = [
            ('normal', [self.client_id, self.secret, self.secret], None),
            ('id_space', [' ' + self.client_id], 'CLIENT_ID_WHITESPACE'),
            ('id_control', ['\x1b[200~' + self.client_id + '\x1b[201~'], 'CLIENT_ID_CONTROL'),
            ('secret_space', [self.client_id, self.secret + ' '], 'CLIENT_SECRET_WHITESPACE'),
            ('secret_control', [self.client_id, self.secret + '\x1b'], 'CLIENT_SECRET_CONTROL'),
            ('mismatch', [self.client_id, self.secret, self.secret + ' '], 'SECRET_CONFIRM_MISMATCH'),
        ]
        prompts = ['Client ID（非表示）: ', 'Client Secret（非表示）: ', 'Client Secret再入力（非表示）: ']
        script = str(Path(__file__).resolve().parents[1] / 'scripts/oracle_access_setup.py')
        for name, inputs, reason in cases:
            with self.subTest(case=name):
                self.path.write_text(self.raw)
                pid, terminal = pty.fork()
                if pid == 0:
                    os.execlp('python3', 'python3', '-B', '-c', code, script, str(self.path))
                output = b''
                sent = 0
                finished = False
                try:
                    deadline = time.monotonic() + 5
                    while time.monotonic() < deadline:
                        if select.select([terminal], [], [], .05)[0]:
                            try: chunk = os.read(terminal, 65536)
                            except OSError:
                                finished = True
                                break
                            if not chunk:
                                finished = True
                                break
                            output += chunk
                        if sent < len(inputs) and prompts[sent].encode() in output:
                            os.write(terminal, (inputs[sent] + '\n').encode())
                            sent += 1
                    if not finished: os.kill(pid, signal.SIGTERM)
                    _, status = os.waitpid(pid, 0)
                finally:
                    os.close(terminal)
                self.assertTrue(finished, 'Dummy terminal did not finish')
                text = output.decode(errors='replace')
                self.assertNotIn(self.client_id, text)
                self.assertNotIn(self.secret, text)
                if reason:
                    self.assertEqual(os.waitstatus_to_exitcode(status), 1)
                    self.assertIn('[' + reason + ']', text)
                    self.assertIn('未保存', text)
                    self.assertEqual(self.path.read_text(), self.raw)
                else:
                    self.assertEqual(os.waitstatus_to_exitcode(status), 0)
                    self.assertIn('保存・再読込検証成功', text)
                    self.assertEqual(json.loads(self.path.read_text())['cf_access_client_secret'], self.secret)

if __name__ == '__main__': unittest.main()
