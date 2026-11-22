"""Minimal LLM client for the seed scripts: Anthropic or DeepSeek, as WS_LLM_PROVIDER says.

Reads the same settings as the app from the repo's .env: WS_LLM_PROVIDER (anthropic or deepseek, default
deepseek), WS_ANTHROPIC_API_KEY and optional WS_ANTHROPIC_WORKSPACE_ID, or WS_DEEPSEEK_API_KEY and optional
WS_DEEPSEEK_BASE_URL.
Every call appends its token usage to seed/work/usage.jsonl so spend can be reported.
Standard library only.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "seed" / "work"
WORK.mkdir(parents=True, exist_ok=True)
USAGE = WORK / "usage.jsonl"
_lock = Lock()



def _env() -> dict[str, str]:
    env = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


_E = _env()


def _get(name: str, default: str = "") -> str:
    return os.environ.get(name) or _E.get(name) or default


PROVIDER = _get("WS_LLM_PROVIDER", "deepseek")
if PROVIDER == "anthropic":
    FAST, PRO = "claude-haiku-5-5", "claude-opus-5-5"
    KEY = _get("WS_ANTHROPIC_API_KEY")
    URL = "https://api.anthropic.com/v1/messages"
    HEADERS = {"x-api-key": KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json"}
    if _get("WS_ANTHROPIC_WORKSPACE_ID"):
        HEADERS["anthropic-workspace-id"] = _get("WS_ANTHROPIC_WORKSPACE_ID")
elif PROVIDER == "deepseek":
    FAST, PRO = "deepseek-flash", "deepseek-v4-pro"
    KEY = _get("WS_DEEPSEEK_API_KEY")
    URL = _get("WS_DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/") + "/chat/completions"
    HEADERS = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
else:
    raise SystemExit(f"WS_LLM_PROVIDER={PROVIDER!r}: the seed scripts call anthropic or deepseek")
if not KEY:
    raise SystemExit(f"No API key for {PROVIDER} in the environment or .env")

JSON_ONLY = "\n\nAnswer with one JSON object and nothing else: no prose, no code fence."


def _anthropic_body(system: str, user: str, model: str, effort: str, temperature: float | None) -> dict:
    # Claude 5 models reject sampling settings. "none" and "low" answer without thinking; higher efforts
    # think adaptively at that effort. Only Haiku can turn thinking off; the others think at low effort.
    think = effort not in ("none", "low")
    body = {"model": model, "system": system + JSON_ONLY, "messages": [{"role": "user", "content": user}],
            "max_tokens": 32000 if think else 16000, "output_config": {"effort": effort if think else "low"}}
    if think:
        body["thinking"] = {"type": "adaptive"}
    elif model.startswith("claude-haiku-"):
        body["thinking"] = {"type": "disabled"}
    return body


def _anthropic_read(resp: dict) -> tuple[str, dict, str | None]:
    text = "".join(b.get("text", "") for b in resp["content"] if b.get("type") == "text").strip()
    if text.startswith("```"):
        text = text[3:].removeprefix("json").strip().removesuffix("```").strip()
    u = resp.get("usage", {})
    cut = "answer cut at max_tokens; send a smaller batch" if resp.get("stop_reason") == "max_tokens" else None
    return text, {"in": u.get("input_tokens", 0), "cached": u.get("cache_read_input_tokens", 0), "out": u.get("output_tokens", 0), "reasoning": 0}, cut


def _deepseek_body(system: str, user: str, model: str, effort: str, temperature: float | None) -> dict:
    body = {
        "model": model,
        "reasoning_effort": effort,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }
    if temperature is not None:
        body["temperature"] = temperature
    return body


def _deepseek_read(resp: dict) -> tuple[str, dict, str | None]:
    u = resp.get("usage", {})
    return resp["choices"][0]["message"]["content"], {"in": u.get("prompt_tokens", 0), "cached": u.get("prompt_cache_hit_tokens", 0), "out": u.get("completion_tokens", 0), "reasoning": (u.get("completion_tokens_details") or {}).get("reasoning_tokens", 0)}, None


_body, _read = (_anthropic_body, _anthropic_read) if PROVIDER == "anthropic" else (_deepseek_body, _deepseek_read)


def chat_json(system: str, user: str, *, model: str | None = None, effort: str = "low", tag: str = "", temperature: float | None = None, retries: int = 3) -> dict:
    model = model or FAST
    data = json.dumps(_body(system, user, model, effort, temperature)).encode()
    last = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(URL, data=data, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=600) as r:
                resp = json.load(r)
            text, u, cut = _read(resp)
            with _lock, USAGE.open("a") as f:
                f.write(json.dumps({"t": time.time(), "tag": tag, "model": model, **u}) + "\n")
            if cut:
                last = cut
                break
            return json.loads(text)
        except urllib.error.HTTPError as e:
            last = f"{e.code}: {e.read()[:300]!r}"
            if e.code in (400, 401, 403, 404):
                break
            time.sleep(2 + 3 * attempt)
        except (urllib.error.URLError, json.JSONDecodeError, KeyError, TimeoutError) as e:
            last = e
            time.sleep(2 + 3 * attempt)
    raise RuntimeError(f"LLM call failed after retries: {last}")


def pmap(fn, items, workers: int = 6):
    with ThreadPoolExecutor(workers) as ex:
        return list(ex.map(fn, items))


def usage_summary() -> dict:
    tot: dict[str, dict[str, int]] = {}
    if USAGE.exists():
        for line in USAGE.read_text().splitlines():
            r = json.loads(line)
            m = tot.setdefault(r["model"], {"calls": 0, "in": 0, "cached": 0, "out": 0, "reasoning": 0})
            m["calls"] += 1
            for k in ("in", "cached", "out", "reasoning"):
                m[k] += r[k]
    return tot


if __name__ == "__main__":
    print(json.dumps(usage_summary(), indent=1))
