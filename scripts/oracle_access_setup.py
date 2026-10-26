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
import unicodedata
import urllib.error
import urllib.request
import warnings

AUTH_PATH = Path.home() / '.config/antigravity-memo/auth.json'
ENDPOINT = 'https://anti-memo.seronworks.dev/api/memos'
FIELDS = ('cf_access_client_id', 'cf_access_client_secret')


ERROR_MESSAGES = {
    'CLIENT_ID_EMPTY': 'Client IDが空です。',
    'CLIENT_ID_WHITESPACE': 'Client IDに空白が含まれています。入力は補正していません。',
    'CLIENT_ID_CONTROL': 'Client IDに制御文字が含まれています。入力は補正していません。',
    'CLIENT_ID_NON_ASCII': 'Client IDにASCII以外の文字が含まれています。',
    'CLIENT_SECRET_EMPTY': 'Client Secretが空です。',
    'CLIENT_SECRET_WHITESPACE': 'Client Secretに空白が含まれています。入力は補正していません。',
    'CLIENT_SECRET_CONTROL': 'Client Secretに制御文字が含まれています。入力は補正していません。',
    'CLIENT_SECRET_NON_ASCII': 'Client SecretにASCII以外の文字が含まれています。',
    'SECRET_CONFIRM_MISMATCH': 'Client Secretと再確認の入力が一致しません。',
    'TERMINAL_INPUT_ERROR': '端末の非表示入力に失敗、または入力が中断されました。',
    'CONFIG_READ_FAILED': '既存設定の読込・形式・権限の確認に失敗しました。',
    'ALREADY_CONFIGURED': '既存のClient IDまたはSecretがあるため上書きしません。',
    'CONFIG_FORMAT_ERROR': '既存JSONの書式保持検査に失敗しました。',
    'WRITE_FAILED': '設定ファイルの書込に失敗しました。保存完了にはなっていません。',
    'SAVE_CONFIRM_FAILED': '置換後の保存確認に失敗しました。ファイルは更新済みの可能性があります。',
    'UNEXPECTED_ERROR': '処理が完了しませんでした。秘密値や例外の詳細は表示しません。',
}


class SetupError(ValueError):
    def __init__(self, code):
        # Only fixed, allowlisted diagnostics can reach user-visible output.
        self.code = code if code in ERROR_MESSAGES else 'UNEXPECTED_ERROR'
        super().__init__(self.code)


def validate_credential(value, field):
    prefix = 'CLIENT_ID' if field == FIELDS[0] else 'CLIENT_SECRET'
    if not value:
        raise SetupError(prefix + '_EMPTY')
    if any(unicodedata.category(char) in ('Cc', 'Cf', 'Cs') for char in value):
        raise SetupError(prefix + '_CONTROL')
    if any(char.isspace() for char in value):
        raise SetupError(prefix + '_WHITESPACE')
    if not value.isascii():
        raise SetupError(prefix + '_NON_ASCII')


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
        validate_credential(value, field)
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
    replaced = False
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
        replaced = True
        temporary = None
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
        actual, _ = read_config(path)
        if actual != updated:
            raise ValueError('Read-back verification failed')
    except (Exception, KeyboardInterrupt):
        raise SetupError('SAVE_CONFIRM_FAILED' if replaced else 'WRITE_FAILED') from None
    finally:
        if temporary is not None:
            try:
                os.unlink(temporary)
            except OSError:
                pass


def configure():
    try:
        original, config = read_config(AUTH_PATH)
    except Exception:
        raise SetupError('CONFIG_READ_FAILED') from None
    if any(config[k] for k in FIELDS):
        raise SetupError('ALREADY_CONFIGURED')
    print('各入力欄に1項目ずつ貼り付け、Enterを押してください。入力は非表示で、補正はしません。')
    try:
        # Never fall back to echoed input. Limit warning policy to this operation.
        with warnings.catch_warnings():
            warnings.simplefilter('error', getpass.GetPassWarning)
            with open('/dev/tty', 'w') as terminal:
                if not terminal.isatty():
                    raise SetupError('TERMINAL_INPUT_ERROR')
                client_id = getpass.getpass('Client ID（非表示）: ', stream=terminal)
                validate_credential(client_id, FIELDS[0])
                secret = getpass.getpass('Client Secret（非表示）: ', stream=terminal)
                validate_credential(secret, FIELDS[1])
                repeated = getpass.getpass('Client Secret再入力（非表示）: ', stream=terminal)
    except SetupError:
        raise
    except (Exception, KeyboardInterrupt):
        raise SetupError('TERMINAL_INPUT_ERROR') from None
    if secret != repeated:
        raise SetupError('SECRET_CONFIRM_MISMATCH')
    try:
        updated = updated_document(original, config, client_id, secret)
    except SetupError:
        raise
    except Exception:
        raise SetupError('CONFIG_FORMAT_ERROR') from None
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


def main(arguments=None):
    arguments = sys.argv[1:] if arguments is None else arguments
    configuring = bool(arguments and arguments[0] == 'configure')
    try:
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        if len(arguments) != 1 or arguments[0] not in ('configure', 'verify'):
            print('未保存：実行引数を確認してください。Usage: python3 scripts/oracle_access_setup.py configure|verify', file=sys.stderr)
            return 2
        configure() if configuring else verify()
        return 0
    except (Exception, KeyboardInterrupt) as error:
        code = error.code if isinstance(error, SetupError) and error.code in ERROR_MESSAGES else 'UNEXPECTED_ERROR'
        prefix = '未保存（保存完了未確認）' if configuring else '検証失敗（保存処理なし）'
        print(f'{prefix}：[{code}] {ERROR_MESSAGES[code]}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
