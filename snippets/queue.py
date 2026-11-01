"""
EdgeKit Queue Client (Python Copy-Paste Snippet)

Drop this file directly into your Python application (e.g. `lib/queue.py`).
Works with Python 3.8+ using standard requests / urllib.
"""

import json
import time
import base64
import hmac
import hashlib
from typing import Any, Dict, List, Optional, Union
import requests


def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')


def _base64url_decode(data: str) -> bytes:
    rem = len(data) % 4
    if rem > 0:
        data += '=' * (4 - rem)
    return base64.urlsafe_b64decode(data.encode('utf-8'))


def verify_webhook_signature(
    signature: str,
    url: str,
    body: str,
    signing_key: str,
    clock_tolerance: int = 300
) -> bool:
    """
    Verifies an incoming Upstash-Signature against a secret signing key.
    Zero external dependencies: uses standard library (hmac, hashlib, base64).
    """
    if not signature or not signing_key:
        return False

    parts = signature.split('.')
    if len(parts) != 3:
        return False

    header_b64, payload_b64, sig_b64 = parts

    try:
        payload_bytes = _base64url_decode(payload_b64)
        payload = json.loads(payload_bytes.decode('utf-8'))

        now = int(time.time())

        # Validate claims
        if payload.get('iss') != 'Upstash':
            return False
        if payload.get('sub') and payload.get('sub') != url:
            return False
        if 'exp' in payload and now > payload['exp'] + clock_tolerance:
            return False
        if 'nbf' in payload and now < payload['nbf'] - clock_tolerance:
            return False

        # Validate body SHA-256 hash
        if 'body' in payload:
            body_hash = _base64url_encode(hashlib.sha256((body or '').encode('utf-8')).digest())
            if body_hash != payload['body']:
                return False

        # Verify HMAC-SHA256 signature
        signing_input = f"{header_b64}.{payload_b64}".encode('utf-8')
        expected_sig = hmac.new(signing_key.encode('utf-8'), signing_input, hashlib.sha256).digest()
        actual_sig = _base64url_decode(sig_b64)

        return hmac.compare_digest(expected_sig, actual_sig)
    except Exception:
        return False


class EdgeKitQueue:
    """
    EdgeKit Queue Python Client
    """

    def __init__(self, base_url: str, api_key: str, default_group_id: str = "default"):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.default_group_id = default_group_id
        self.session = requests.Session()
        self.session.headers.update({"X-API-Key": self.api_key})

    def _request(self, method: str, path: str, **kwargs) -> Any:
        url = f"{self.base_url}/{path.lstrip('/')}"
        res = self.session.request(method, url, **kwargs)
        if not res.ok:
            error_msg = f"HTTP {res.status_code}: {res.text}"
            try:
                data = res.json()
                if "error" in data:
                    error_msg = data["error"]
            except Exception:
                pass
            raise RuntimeError(error_msg)
        return res.json()

    def publish(
        self,
        url: str,
        payload: Any = None,
        delay: Optional[Union[str, int]] = None,
        retries: Optional[int] = None,
        group_id: Optional[str] = None,
        callback_url: Optional[str] = None,
        dedup_id: Optional[str] = None,
        dedup_window_seconds: Optional[int] = None,
        method: str = "POST",
        headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """
        Publishes a message to be asynchronously dispatched to the target webhook URL.
        """
        req_headers: Dict[str, str] = {
            "Content-Type": "application/json",
            "Upstash-Group-Id": group_id or self.default_group_id,
            "Upstash-Method": method.upper(),
        }

        if delay:
            req_headers["Upstash-Delay"] = str(delay)
        if retries is not None:
            req_headers["Upstash-Retries"] = str(retries)
        if callback_url:
            req_headers["Upstash-Callback"] = callback_url
        if dedup_id:
            req_headers["Upstash-Dedup-Id"] = dedup_id
        if dedup_window_seconds:
            req_headers["Upstash-Deduplication-Timeout"] = str(dedup_window_seconds)

        if headers:
            for k, v in headers.items():
                req_headers[f"Upstash-Forward-{k}"] = v

        body = {
            "url": url,
            "payload": payload,
        }

        return self._request("POST", "/publish", headers=req_headers, json=body)

    def verify_signature(self, signature: str, url: str, body: str, signing_key: Optional[str] = None) -> bool:
        """
        Verifies signature of an incoming webhook delivered by EdgeKit Queue.
        """
        return verify_webhook_signature(
            signature=signature,
            url=url,
            body=body,
            signing_key=signing_key or self.api_key,
        )

    # --------------------------------------------------------------------------
    # Queue Management
    # --------------------------------------------------------------------------

    def get_messages(self, group_id: Optional[str] = None, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        g = group_id or self.default_group_id
        data = self._request("GET", f"/messages?groupId={g}&limit={limit}&offset={offset}")
        return data.get("messages", [])

    def delete_message(self, message_id: str, group_id: Optional[str] = None) -> bool:
        g = group_id or self.default_group_id
        data = self._request("DELETE", f"/messages/{message_id}?groupId={g}")
        return data.get("success", False)

    # --------------------------------------------------------------------------
    # Dead Letter Queue (DLQ)
    # --------------------------------------------------------------------------

    def get_dlq(self, group_id: Optional[str] = None, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        g = group_id or self.default_group_id
        data = self._request("GET", f"/dlq?groupId={g}&limit={limit}&offset={offset}")
        return data.get("messages", [])

    def retry_dlq(self, message_id: str, group_id: Optional[str] = None) -> bool:
        g = group_id or self.default_group_id
        data = self._request("POST", f"/dlq/{message_id}/retry?groupId={g}")
        return data.get("success", False)

    def delete_dlq(self, message_id: str, group_id: Optional[str] = None) -> bool:
        g = group_id or self.default_group_id
        data = self._request("DELETE", f"/dlq/{message_id}?groupId={g}")
        return data.get("success", False)

    # --------------------------------------------------------------------------
    # Logs & Stats
    # --------------------------------------------------------------------------

    def get_logs(self, group_id: Optional[str] = None, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        g = group_id or self.default_group_id
        data = self._request("GET", f"/logs?groupId={g}&limit={limit}&offset={offset}")
        return data.get("logs", [])

    def get_stats(self, group_id: Optional[str] = None) -> Dict[str, Any]:
        g = group_id or self.default_group_id
        return self._request("GET", f"/stats?groupId={g}")

    # --------------------------------------------------------------------------
    # Embedded Redis REST
    # --------------------------------------------------------------------------

    def redis_get(self, key: str) -> Any:
        data = self._request("GET", f"/get/{key}")
        return data.get("result")

    def redis_set(self, key: str, value: Any, ex: Optional[int] = None) -> str:
        path = f"/set/{key}"
        if ex:
            path += f"?ex={ex}"
        data = self._request("POST", path, json=value)
        return data.get("result", "OK")

    def redis_del(self, key: str) -> int:
        data = self._request("DELETE", f"/del/{key}")
        return data.get("result", 0)

    def redis_command(self, *cmd_args: Any) -> Any:
        data = self._request("POST", "/", json=list(cmd_args))
        return data.get("result")
