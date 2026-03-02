import os
import re
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, HttpUrl

from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig, LLMConfig
from crawl4ai.content_filter_strategy import LLMContentFilter
from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator


class ParseRequest(BaseModel):
    url: HttpUrl
    language: str = "ru"


class ParseResponse(BaseModel):
    sourceUrl: str
    language: str
    text: str
    title: str


def _extract_markdown(result: Any) -> str:
    markdown = getattr(result, "markdown", None)
    if isinstance(markdown, str):
        return markdown

    fit_markdown = getattr(markdown, "fit_markdown", None) if markdown is not None else None
    if isinstance(fit_markdown, str) and fit_markdown.strip():
        return fit_markdown

    raw_markdown = getattr(markdown, "raw_markdown", None) if markdown is not None else None
    if isinstance(raw_markdown, str) and raw_markdown.strip():
        return raw_markdown

    direct_fit = getattr(result, "fit_markdown", None)
    if isinstance(direct_fit, str) and direct_fit.strip():
        return direct_fit

    cleaned_html = getattr(result, "cleaned_html", None)
    if isinstance(cleaned_html, str):
        return cleaned_html

    return ""


def _markdown_to_text(markdown: str) -> str:
    text = markdown
    text = re.sub(r"```[\\s\\S]*?```", " ", text)
    text = re.sub(r"\[(.*?)\]\((.*?)\)", r"\1", text)
    text = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"[`>*_~|-]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _build_markdown_generator() -> Optional[DefaultMarkdownGenerator]:
    api_key = os.getenv("CRAWL4AI_API_KEY") or os.getenv("OPENAI_API_KEY")
    llm_provider = os.getenv("CRAWL4AI_LLM_PROVIDER", "openai/gpt-4.1-mini")

    if not api_key:
        return None

    llm_instruction = os.getenv(
        "CRAWL4AI_FILTER_INSTRUCTION",
        "Extract the primary educational content with maximum fidelity. Keep important facts, examples, definitions, and lists.",
    )

    llm_config = LLMConfig(provider=llm_provider, api_token=api_key)
    content_filter = LLMContentFilter(llm_config=llm_config, instruction=llm_instruction)
    return DefaultMarkdownGenerator(content_filter=content_filter)


async def parse_url(url: str, language: str) -> ParseResponse:
    markdown_generator = _build_markdown_generator()
    browser_config = BrowserConfig(headless=True, verbose=False)
    run_config = CrawlerRunConfig(cache_mode=CacheMode.BYPASS, markdown_generator=markdown_generator)

    async with AsyncWebCrawler(config=browser_config) as crawler:
        result = await crawler.arun(url=url, config=run_config)

    success = bool(getattr(result, "success", False))
    if not success:
        error_message = str(getattr(result, "error_message", "crawl4ai failed to parse URL"))
        raise HTTPException(status_code=502, detail=error_message)

    markdown = _extract_markdown(result)
    text = _markdown_to_text(markdown)

    max_chars = int(os.getenv("CRAWL4AI_MAX_TEXT_CHARS", "400000"))
    if len(text) > max_chars:
        text = text[:max_chars]

    if not text:
        raise HTTPException(status_code=422, detail="Parsed page contains no extractable text")

    title = str(getattr(result, "title", ""))
    return ParseResponse(sourceUrl=url, language=language, text=text, title=title)


app = FastAPI(title="url-parser-service", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "url-parser-service"}


@app.get("/ready")
def ready() -> dict[str, str]:
    return {"status": "ready"}


@app.post("/api/v1/parse", response_model=ParseResponse)
async def parse_endpoint(payload: ParseRequest) -> ParseResponse:
    try:
        return await parse_url(str(payload.url), payload.language)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Failed to parse URL: {exc}") from exc
