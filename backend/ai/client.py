import asyncio
import logging
from typing import Any

import anthropic
from backend.config import settings

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 4000
_RETRY_DELAYS = [1, 2, 4]


def get_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


async def call_claude(
    messages: list[dict],
    system: str | None = None,
    tools: list[dict] | None = None,
    tool_choice: dict | None = None,
    **kwargs: Any,
) -> anthropic.types.Message:
    client = get_client()
    params: dict[str, Any] = {
        "model": MODEL,
        "max_tokens": MAX_TOKENS,
        "messages": messages,
        **kwargs,
    }
    if system:
        params["system"] = system
    if tools:
        params["tools"] = tools
    if tool_choice:
        params["tool_choice"] = tool_choice

    logger.debug("Calling Claude model=%s messages=%d", MODEL, len(messages))

    loop = asyncio.get_event_loop()

    for attempt, delay in enumerate([0] + _RETRY_DELAYS):
        if delay:
            await asyncio.sleep(delay)
        try:
            response = await loop.run_in_executor(
                None,
                lambda p=params: client.messages.create(**p),
            )
            logger.debug("Claude response stop_reason=%s", response.stop_reason)
            return response
        except anthropic.RateLimitError:
            if attempt < len(_RETRY_DELAYS):
                logger.warning("Rate limited by Claude API, retrying in %ds", _RETRY_DELAYS[attempt] if attempt < len(_RETRY_DELAYS) else delay)
                continue
            raise
        except anthropic.APIError:
            raise
