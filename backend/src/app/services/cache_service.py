"""
Result Set Caching Service.

This module provides a thread-safe, in-memory Least Recently Used (LRU) cache
implementation designed to store query results. It mitigates load on the OLAP
engine (DuckDB) by serving frequently requested data instantly.

Features:
- **LRU Eviction**: Removes oldest accessed items when capacity is reached.
- **TTL Expiration**: Automatically invalidates stale data.
- **Size Safety**: Rejects items larger than the configured maximum to protect RAM.
- **Deterministic Hashing**: Generates unique keys based on widget configuration.
"""

import time
import json
import hashlib
import logging
from collections import OrderedDict
from typing import Any, Dict, Optional, Tuple
from threading import Lock

from app.core.config import settings

logger = logging.getLogger("cache_service")


class ResultCacheService:
  """
  Singleton service managing the lifecycle of cached analytics results.
  """

  def __init__(self) -> None:
    """
    Initialize the cache storage and synchronization lock.
    """
    self._cache: OrderedDict[str, Tuple[float, Any]] = OrderedDict()
    self._lock = Lock()
    self._ttl = settings.CACHE_TTL_SECONDS
    self._max_entries = settings.CACHE_MAX_ENTRIES
    self._max_item_size = settings.CACHE_MAX_ITEM_SIZE

  def generate_key(self, widget_type: str, config: Dict[str, Any]) -> str:
    """
    Generates a deterministic SHA-256 hash based on the widget details.

    Args:
        widget_type (str): The type of widget (e.g., "SQL", "HTTP").
        config (Dict[str, Any]): The configuration dictionary.

    Returns:
        str: A hex digest string representing the unique key.
    """
    # Normalize: Parse specific fields relevant to uniqueness
    # We sort keys to ensure {"a": 1, "b": 2} == {"b": 2, "a": 1}
    payload_str = widget_type

    if widget_type == "SQL":
      # For SQL, whitespace normalization helps cache hit rate
      query = config.get("query", "").strip()
      # Collapse multiple spaces to one
      clean_query = " ".join(query.split())
      payload_str += f":{clean_query}"
    else:
      # For generic/HTTP, dump the whole sorted config
      # Use default=str to handle non-serializable objects gracefully
      clean_config = json.dumps(config, sort_keys=True, default=str)
      payload_str += f":{clean_config}"

    return hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

  def get(self, key: str) -> Optional[Any]:
    """
    Retrieve an item from the cache if it exists and hasn't expired.
    Updates the LRU position of the item (moves to end).

    Args:
        key (str): The unique hash key.

    Returns:
        Optional[Any]: The cached data, or None if missing/expired.
    """
    with self._lock:
      if key not in self._cache:
        return None

      timestamp, value = self._cache[key]

      # TTL Check
      if time.time() - timestamp > self._ttl:
        logger.debug(f"Cache expired for key: {key[:8]}...")
        del self._cache[key]
        return None

      # Move to end (Recently Used)
      self._cache.move_to_end(key)
      logger.debug(f"Cache HIT for key: {key[:8]}...")
      return value

  def set(self, key: str, value: Any) -> None:
    """
    Store an item in the cache.
    Enforces Size limits and LRU capacity.

    Args:
        key (str): The unique hash key.
        value (Any): The result set to store.
    """
    # 1. Size Safety Check (Rough estimation via JSON dump length)
    # We perform this outside the lock purely for performance, though strictly
    # it might be inaccurate for complex objects.
    try:
      size_est = len(json.dumps(value, default=str))
      if size_est > self._max_item_size:
        logger.warning(f"Item too large for cache ({size_est} bytes). Skipping.")
        return
    except Exception:
      # If serialization fails, assume it's acceptable or riskier to assume too large
      pass

    with self._lock:
      # 2. Eviction: If full, pop first item (Least Recently Used)
      if len(self._cache) >= self._max_entries:
        # popitem(last=False) returns/removes the first item (LRU side)
        self._cache.popitem(last=False)

      # 3. Store
      self._cache[key] = (time.time(), value)
      logger.debug(f"Cache SET for key: {key[:8]}...")

  def clear(self) -> None:
    """
    Flushes all items from the cache.
    """
    with self._lock:
      self._cache.clear()
      logger.info("Cache flushed.")


# Singleton Instance
cache_service = ResultCacheService()
