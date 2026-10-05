"""Per-user rate limits, in memory (one server instance).

Each limiter has rules like (30, 60) = at most 30 calls per 60 seconds; a
call must fit every rule. Blocked calls aren't counted. RATE_LIMITS=off
turns them off (the test suite does; test_rate_limits.py turns them on).
"""
import math
import os
import threading
import time
from collections import deque
from typing import Callable, Optional

# indirection so tests can fake time
_clock: Callable[[], float] = time.monotonic

_limiters: list = []


def enabled() -> bool:
    return os.getenv("RATE_LIMITS", "on").strip().lower() not in {"off", "0", "false", "no"}


class RateLimiter:
    def __init__(self, name: str, rules: list, clock: Optional[Callable[[], float]] = None):
        self.name = name
        self.rules = sorted(rules, key=lambda r: r[1])  # shortest window first
        self._clock = clock
        self._hits: dict = {}  # key -> deque of call times, oldest first
        self._lock = threading.Lock()

    def _now(self) -> float:
        return (self._clock or _clock)()

    def blocked(self, key: str) -> Optional[tuple]:
        """None (and the call is counted) if allowed, else (seconds to wait,
        the window of the rule that blocks)."""
        with self._lock:
            now = self._now()
            hits = self._hits.setdefault(key, deque())
            longest = self.rules[-1][1]
            while hits and hits[0] <= now - longest:
                hits.popleft()
            worst = None
            for limit, window in self.rules:
                recent = [t for t in hits if t > now - window]
                if len(recent) >= limit:
                    # wait until the call that fills the limit leaves the window
                    wait = math.ceil(window - (now - recent[-limit]))
                    if worst is None or wait > worst[0]:
                        worst = (max(wait, 1), window)
            if worst:
                return worst
            hits.append(now)
            return None

    def check(self, key: str) -> Optional[int]:
        """None if allowed (and counted), else seconds to wait."""
        result = self.blocked(key)
        return result[0] if result else None

    def reset(self):
        with self._lock:
            self._hits.clear()


def limiter(name: str, rules: list) -> RateLimiter:
    created = RateLimiter(name, rules)
    _limiters.append(created)
    return created


def reset_all():
    for each in _limiters:
        each.reset()
