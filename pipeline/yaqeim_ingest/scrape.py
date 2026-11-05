"""Bounded Selenium collection using an administrator's existing authorized session."""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable
from urllib.parse import urlencode, urlparse

from .models import RawPost, ValidationError, redact_contacts

GROUP_ID_PATTERN = r"[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?"


def resolve_group_url(url: str | None, query: str | None) -> str:
    if url:
        if query is not None:
            raise ValidationError("Choose --url or ROR_GROUP_ID with --query, not both")
        return validate_group_url(url)
    group_id = os.environ.get("ROR_GROUP_ID", "")
    if not re.fullmatch(GROUP_ID_PATTERN, group_id):
        raise ValidationError("Set ROR_GROUP_ID to a valid group ID or provide --url")
    if not isinstance(query, str) or not 1 <= len(query.strip()) <= 200 or re.search(r"[\x00-\x1f\x7f]", query):
        raise ValidationError("An explicit --query of 1 to 200 characters is required with ROR_GROUP_ID")
    return f"https://www.facebook.com/groups/{group_id}/search/?{urlencode({'q': query.strip()})}"


def validate_group_url(url: str) -> str:
    try:
        parsed = urlparse(url)
        valid = (parsed.scheme == "https" and parsed.hostname in {"facebook.com", "www.facebook.com"}
                 and not parsed.username and not parsed.password and parsed.port in (None, 443)
                 and re.fullmatch(rf"/groups/{GROUP_ID_PATTERN}(?:/search)?/?", parsed.path)
                 and not re.search(r"[\x00-\x1f\x7f]", url))
    except ValueError:
        valid = False
    if not valid:
        raise ValidationError("Use an HTTPS Facebook group or group-search URL")
    return url


def session_cookies(path: Path | None) -> list[dict[str, Any]]:
    if path is not None:
        return load_cookies(path)
    user = os.environ.get("FB_C_USER", "")
    session = os.environ.get("FB_XS", "")
    if not user or not session:
        raise ValidationError("Provide --cookies or set both FB_C_USER and FB_XS in the environment")
    if not re.fullmatch(r"[0-9]{1,30}", user):
        raise ValidationError("FB_C_USER must be a numeric Facebook account ID")
    if len(session) > 4096 or re.search(r"[\x00-\x20\x7f;]", session):
        raise ValidationError("FB_XS contains invalid cookie characters or is too long")
    return [{"name": name, "value": value, "domain": ".facebook.com", "path": "/",
             "secure": True, "httpOnly": True, "sameSite": "None"}
            for name, value in (("c_user", user), ("xs", session))]


def load_cookies(path: Path) -> list[dict[str, Any]]:
    try:
        value = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError) as exc:
        raise ValidationError("Cannot read the session-cookie JSON file") from exc
    if not isinstance(value, list) or not 1 <= len(value) <= 200:
        raise ValidationError("Cookie file must be a non-empty JSON array")
    cookies = []
    for item in value:
        if not isinstance(item, dict) or not isinstance(item.get("name"), str) or not isinstance(item.get("value"), str):
            raise ValidationError("Cookie entries require string name/value fields")
        domain = item.get("domain", ".facebook.com")
        if domain not in {"facebook.com", ".facebook.com", "www.facebook.com", ".www.facebook.com"}:
            continue
        cookie = {key: item[key] for key in ("name", "value", "path", "secure", "httpOnly") if key in item}
        cookie["domain"] = domain
        cookie["path"] = cookie.get("path", "/")
        expiry = item.get("expiry", item.get("expirationDate"))
        if expiry is not None:
            if isinstance(expiry, bool) or not isinstance(expiry, (float, int)):
                raise ValidationError("Invalid cookie expiry")
            if expiry <= time.time():
                continue
            cookie["expiry"] = int(expiry)
        same_site = item.get("sameSite")
        if same_site in {"Lax", "Strict", "None"}:
            cookie["sameSite"] = same_site
        cookies.append(cookie)
    if not cookies:
        raise ValidationError("No valid unexpired Facebook cookies were found")
    return cookies


def post_identity(url: str, fallback_body: str, group_url: str) -> str:
    parsed = urlparse(url)
    if parsed.hostname in {"facebook.com", "www.facebook.com"}:
        match = re.search(r"/groups/([A-Za-z0-9._-]+)/(?:posts|permalink)/(\d+)", parsed.path)
        if match:
            return f"facebook:{match[1]}:{match[2]}"
    # A stable content fingerprint is the fallback when Facebook hides permalinks.
    # Content edits can yield a new fallback ID and must be reconciled during review.
    group = urlparse(group_url).path.split("/")[2]
    body = " ".join(fallback_body.split())
    return "facebook-content:" + hashlib.sha256(f"{group}\n{body}".encode()).hexdigest()


@dataclass(frozen=True)
class ScrapeOptions:
    url: str
    cookie_file: Path | None = None
    max_scrolls: int = 100
    max_posts: int = 1000
    idle_rounds: int = 4
    pause_seconds: float = 2.0
    message_selector: str = '[data-ad-preview="message"], [data-ad-comet-preview="message"]'

    def validate(self) -> None:
        validate_group_url(self.url)
        if not 1 <= self.max_scrolls <= 10000 or not 1 <= self.max_posts <= 100000:
            raise ValidationError("Scroll/post limits are out of range")
        if not 1 <= self.idle_rounds <= 30 or not 1 <= self.pause_seconds <= 60:
            raise ValidationError("Idle/pause limits are out of range")
        if not self.message_selector.strip():
            raise ValidationError("A post-message selector is required")


def scrape_posts(options: ScrapeOptions, driver: Any = None, sleep: Callable = time.sleep) -> Iterable[RawPost]:
    options.validate()
    cookies = session_cookies(options.cookie_file)
    owned_driver = driver is None
    if driver is None:
        from selenium import webdriver
        chrome = webdriver.ChromeOptions()
        chrome.add_argument("--headless=new")
        chrome.add_argument("--disable-dev-shm-usage")
        chrome.add_argument("--window-size=1280,1000")
        driver = webdriver.Chrome(options=chrome)
    seen, idle = set(), 0
    try:
        driver.set_page_load_timeout(45)
        driver.get("https://www.facebook.com/")
        for cookie in cookies:
            driver.add_cookie(cookie)
        driver.get(options.url)
        sleep(options.pause_seconds)
        if any(marker in urlparse(driver.current_url).path for marker in ("/login", "/checkpoint", "/recover")):
            raise ValidationError("Session is expired or Facebook requires interactive authentication")
        for _ in range(options.max_scrolls):
            if any(marker in urlparse(driver.current_url).path for marker in ("/login", "/checkpoint", "/recover")):
                raise ValidationError("Session expired during collection; refresh the authorized session locally")
            added = 0
            for article in driver.find_elements("css selector", '[role="article"]'):
                try:
                    messages = article.find_elements("css selector", options.message_selector)
                    body = "\n".join(dict.fromkeys(message.text.strip() for message in messages if message.text.strip()))
                    if len(body) < 10:
                        continue
                    links = article.find_elements("css selector", 'a[href*="/posts/"], a[href*="/permalink/"]')
                    permalink = next((link.get_attribute("href") for link in links if link.get_attribute("href")), "")
                    identity = post_identity(permalink, body, options.url)
                    if identity in seen:
                        continue
                    post = RawPost.from_dict({"source_id": identity, "body": redact_contacts(body),
                                              "captured_at": datetime.now(timezone.utc).isoformat()})
                except Exception as exc:
                    if type(exc).__name__ == "StaleElementReferenceException":
                        continue
                    raise
                seen.add(identity)
                added += 1
                yield post
                if len(seen) >= options.max_posts:
                    return
            idle = idle + 1 if added == 0 else 0
            if idle >= options.idle_rounds:
                break
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight)")
            sleep(options.pause_seconds)
        if not seen:
            raise ValidationError("No posts found; check authorized group access and message selectors")
    finally:
        if owned_driver:
            driver.quit()
