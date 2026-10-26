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
            with self.assertRaises(OSError): setup.save_config(self.path, self.raw, self.raw)
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

if __name__ == '__main__': unittest.main()
