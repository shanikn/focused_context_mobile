"""The users' local time.

Dates in notes ("today", "tomorrow", "on Friday"), "due today" and the
current hour are the users' local ones, not the server's: Azure runs in
UTC, 2-3 hours behind Israel. APP_TIMEZONE sets the zone (default
Asia/Jerusalem); zoneinfo needs the tzdata package for it.
"""
import logging
import os
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

logger = logging.getLogger(__name__)

DEFAULT_APP_TIMEZONE = "Asia/Jerusalem"


def app_timezone() -> ZoneInfo:
    name = os.getenv("APP_TIMEZONE", DEFAULT_APP_TIMEZONE).strip() or DEFAULT_APP_TIMEZONE
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        logger.warning("Unknown APP_TIMEZONE %r; using %s", name, DEFAULT_APP_TIMEZONE)
        return ZoneInfo(DEFAULT_APP_TIMEZONE)


def local_now() -> datetime:
    """The current time in APP_TIMEZONE, as a naive datetime (what the
    categorizer and relevance code compare against)."""
    return datetime.now(app_timezone()).replace(tzinfo=None)
