from __future__ import annotations

import json
import platform
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from config import Settings
from models import DownloadJob


class ApiError(RuntimeError):
    pass


class ApiClient:
    def __init__(self, settings: Settings, version: str):
        self.settings = settings
        self.version = version

    def _request(self, method: str, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = Request(
            self.settings.api_url + path,
            data=body,
            method=method,
            headers={
                "Authorization": f"Bearer {self.settings.agent_token}",
                "Content-Type": "application/json",
                "User-Agent": f"YDown-Agent/{self.version}",
            },
        )
        try:
            with urlopen(request, timeout=25) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")[:1000]
            raise ApiError(f"API returned HTTP {error.code}: {detail}") from error
        except (URLError, TimeoutError, json.JSONDecodeError) as error:
            raise ApiError(f"Cannot connect to YDown API: {error}") from error

    def claim(self) -> DownloadJob | None:
        result = self._request("POST", "/api/agent/claim", {
            "agent_id": self.settings.agent_id,
            "hostname": platform.node(),
            "version": self.version,
        })
        return DownloadJob.from_dict(result["job"]) if result.get("job") else None

    def update(self, job_id: str, action: str, **fields: Any) -> dict[str, Any]:
        return self._request("PATCH", f"/api/agent/jobs/{job_id}", {
            "agent_id": self.settings.agent_id,
            "action": action,
            **fields,
        })
