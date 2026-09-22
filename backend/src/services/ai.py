import json

import requests

from ..security.config import settings


class AIServiceError(Exception):
    pass


def _extract_content(payload):
    try:
        content = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as error:
        raise AIServiceError("The AI provider returned an unexpected response") from error

    if not isinstance(content, str) or not content.strip():
        raise AIServiceError("The AI provider returned an empty response")
    return content.strip()


def create_chat_completion(messages):
    if not settings.ai_api_key or not settings.ai_model:
        raise AIServiceError("AI is not configured on the server")

    endpoint = f"{settings.ai_base_url.rstrip('/')}/chat/completions"
    try:
        response = requests.post(
            endpoint,
            headers={
                "Authorization": f"Bearer {settings.ai_api_key}",
                "Content-Type": "application/json",
            },
            json={"model": settings.ai_model, "messages": messages},
            timeout=settings.ai_timeout_seconds,
        )
        response.raise_for_status()
        return _extract_content(response.json())
    except requests.Timeout as error:
        raise AIServiceError("The AI provider timed out") from error
    except requests.RequestException as error:
        raise AIServiceError("The AI provider request failed") from error
    except ValueError as error:
        raise AIServiceError("The AI provider returned invalid JSON") from error


def create_json_completion(messages):
    content = create_chat_completion(messages)
    if content.startswith("```"):
        content = content.removeprefix("```json").removeprefix("```")
        content = content.removesuffix("```").strip()

    start = content.find("{")
    end = content.rfind("}")
    if start == -1 or end == -1:
        raise AIServiceError("The AI provider did not return the required JSON")

    try:
        return json.loads(content[start:end + 1])
    except json.JSONDecodeError as error:
        raise AIServiceError("The AI provider returned malformed JSON") from error
