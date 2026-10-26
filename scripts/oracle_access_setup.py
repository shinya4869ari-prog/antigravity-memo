#!/usr/bin/env python3
"""Interactive-only Access setup; never accepts credentials as arguments or env."""
import getpass
import json
import os
from pathlib import Path
import re
import resource
import stat
import sys
import tempfile
import urllib.error
import urllib.request
import warnings

AUTH_PATH = Path.home() / '.config/antigravity-memo/auth.json'
ENDPOINT = 'https://anti-memo.seronworks.dev/api/memos'
FIELDS = ('cf_access_client_id', 'cf_access_client_secret')


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate JSON key')
        result[key] = value
    return result


def read_config(path):
    for target, mode in ((path.parent, 0o700), (path, 0o600)):
        info = target.lstat()
        if stat.S_ISLNK(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != mode:
            raise ValueError('Unsafe owner, permissions or symbolic link')
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, 'r', encoding='utf-8') as handle:
        raw = handle.read()
    config = json.loads(raw, object_pairs_hook=unique_object)
    if not isinstance(config, dict) or any(not isinstance(config.get(k), str) for k in (*FIELDS, 'memo_api_url', 'memo_api_token')):
        raise ValueError('Unexpected config schema')
    if config['memo_api_url'] != ENDPOINT or not config['memo_api_token']:
        raise ValueError('Unexpected endpoint or missing existing API token')
    return raw, config


def updated_document(raw, config, client_id, secret):
    if any(config[k] for k in FIELDS):
        raise ValueError('Existing Access credentials are not empty; refusing overwrite')
    updated = raw
    for field, value in zip(FIELDS, (client_id, secret)):
        if not value or not value.isascii() or any(ord(c) < 33 or ord(c) > 126 for c in value):
            raise ValueError('Empty or invalid credential')
        pattern = r'("' + field + r'"\s*:\s*)""'
        updated, count = re.subn(pattern, lambda match: match[1] + json.dumps(value), updated)
        if count != 1:
            raise ValueError('Unexpected JSON layout')
    expected = {**config, FIELDS[0]: client_id, FIELDS[1]: secret}
    if json.loads(updated, object_pairs_hook=unique_object) != expected:
        raise ValueError('Unexpected config mutation')
    return updated


def save_config(path, original, updated):
    temporary = None
    try:
        descriptor, temporary = tempfile.mkstemp(prefix='.auth-', dir=path.parent)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
            os.fchmod(handle.fileno(), 0o600)
            handle.write(updated)
            handle.flush()
            os.fsync(handle.fileno())
        current, _ = read_config(path)
        if current != original:
            raise ValueError('Configuration changed during input')
        os.replace(temporary, path)
        temporary = None
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
        actual, _ = read_config(path)
        if actual != updated:
            raise ValueError('Read-back verification failed')
    finally:
        if temporary is not None:
            os.unlink(temporary)


def configure():
    original, config = read_config(AUTH_PATH)
    if any(config[k] for k in FIELDS):
        raise ValueError('Existing Access credentials are not empty')
    # No stdin fallback: refuses redirected input and missing echo-control support.
    warnings.simplefilter('error', getpass.GetPassWarning)
    with open('/dev/tty', 'w') as terminal:
        if not terminal.isatty():
            raise ValueError('Interactive terminal required')
        client_id = getpass.getpass('Client ID（非表示）: ', stream=terminal)
        secret = getpass.getpass('Client Secret（非表示）: ', stream=terminal)
        repeated = getpass.getpass('Client Secret再入力（非表示）: ', stream=terminal)
    if secret != repeated:
        raise ValueError('Secret confirmation mismatch')
    updated = updated_document(original, config, client_id, secret)
    save_config(AUTH_PATH, original, updated)
    print('保存・再読込検証成功。既存形式と他の設定値を保持。親0700／ファイル0600。')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def http_probe(config, with_access):
    headers = {'Accept': 'application/json', 'Authorization': 'Bearer ' + config['memo_api_token'],
               'X-Memo-Token': config['memo_api_token']}
    if with_access:
        headers.update({'CF-Access-Client-Id': config[FIELDS[0]], 'CF-Access-Client-Secret': config[FIELDS[1]]})
    # No redirects, cookies, cache fallback or environment proxy forwarding.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    request = urllib.request.Request(ENDPOINT, headers=headers, method='GET')
    try:
        with opener.open(request, timeout=25) as response:
            if response.status != 200:
                return response.status, False
            if response.headers.get_content_type() != 'application/json':
                return 200, False
            body = response.read(32 * 1024 * 1024 + 1)
            if len(body) > 32 * 1024 * 1024:
                return 200, False
            try:
                valid = isinstance(json.loads(body), list)
            except (ValueError, UnicodeError):
                valid = False
            return 200, valid
    except urllib.error.HTTPError as error:
        status = error.code
        error.close()
        return status, False


def verify():
    _, config = read_config(AUTH_PATH)
    if not all(config[k] for k in FIELDS):
        raise ValueError('Access credentials are not configured')
    baseline, _ = http_probe(config, False)
    print('Service Tokenなし: HTTP ' + str(baseline))
    authenticated, valid = http_probe(config, True)
    print('Service Tokenあり: HTTP ' + str(authenticated) + ' / メモ配列JSON=' + ('確認済み' if valid else '未確認'))
    if baseline not in (301, 302, 303, 307, 308, 401, 403) or authenticated != 200 or not valid:
        raise ValueError('Authentication verification did not meet success criteria')
    print('認証付き実通信の検証成功。GETのみ使用。メモ本文・画像・トークンは出力していません。')


if __name__ == '__main__':
    try:
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        if len(sys.argv) != 2 or sys.argv[1] not in ('configure', 'verify'):
            print('Usage: python3 scripts/oracle_access_setup.py configure|verify', file=sys.stderr)
            sys.exit(2)
        configure() if sys.argv[1] == 'configure' else verify()
    except (Exception, KeyboardInterrupt):
        # Do not expose exception messages, request headers, response bodies or locals.
        print('処理は成功扱いしていません。入力・権限・設定・HTTP状態を確認してください（秘密値は表示しません）。', file=sys.stderr)
        sys.exit(1)
