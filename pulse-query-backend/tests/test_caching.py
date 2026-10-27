"""
Tests for Result Cache Service.

Verifies:
1. Basic Get/Set functionality.
2. LRU Eviction behavior (removing old items).
3. TTL Expiration (time-based invalidation).
4. Deterministic Hashing.
"""

import time

import pytest

from app.schemas.json_types import JsonObject, JsonValue
from app.services.cache_service import ResultCacheService


class BadStr:
  """Helper class whose `__str__` raises `ValueError` to test fallback size estimation."""

  def __str__(self) -> str:
    """
    Raises `ValueError` when converted to string.

    Raises:
        ValueError: Always raised.
    """
    raise ValueError("nope")


type CacheTestPayload = JsonValue | BadStr


@pytest.fixture
def cache_svc() -> ResultCacheService[CacheTestPayload]:
  """
  Returns a fresh `ResultCacheService` instance configured with short TTL and small capacity.

  Returns:
      ResultCacheService[CacheTestPayload]: Isolated cache service instance.
  """
  svc: ResultCacheService[CacheTestPayload] = ResultCacheService()
  svc._ttl = 1
  svc._max_entries = 3
  svc._max_item_size = 1000
  return svc


def test_cache_set_get_hit(cache_svc: ResultCacheService[CacheTestPayload]) -> None:
  """Test basic storage and retrieval."""
  key = "test_key"
  data: JsonObject = {"value": 100}

  cache_svc.set(key, data)
  result = cache_svc.get(key)

  assert result == data
  assert isinstance(result, dict)
  assert result["value"] == 100


def test_cache_miss(cache_svc: ResultCacheService[CacheTestPayload]) -> None:
  """Test getting a non-existent key returns None."""
  assert cache_svc.get("ghost") is None


def test_deterministic_hashing(cache_svc: ResultCacheService[CacheTestPayload]) -> None:
  """Test that key generation is consistent regardless of key order in dicts."""
  config_a: JsonObject = {"query": "SELECT *", "limit": 10}
  config_b: JsonObject = {"limit": 10, "query": "SELECT *"}

  key_a = cache_svc.generate_key("SQL", config_a)
  key_b = cache_svc.generate_key("SQL", config_b)

  assert key_a == key_b
  assert len(key_a) == 64


def test_lru_eviction(cache_svc: ResultCacheService[CacheTestPayload]) -> None:
  """Test that the oldest item is removed when capacity is exceeded."""
  cache_svc.set("1", "one")
  cache_svc.set("2", "two")
  cache_svc.set("3", "three")
  cache_svc.set("4", "four")

  assert cache_svc.get("1") is None
  assert cache_svc.get("2") == "two"
  assert cache_svc.get("4") == "four"


def test_lru_update_on_access(cache_svc: ResultCacheService[CacheTestPayload]) -> None:
  """Test that accessing an item makes it 'recent'."""
  cache_svc.set("1", "one")
  cache_svc.set("2", "two")
  cache_svc.set("3", "three")

  cache_svc.get("1")
  cache_svc.set("4", "four")

  assert cache_svc.get("2") is None
  assert cache_svc.get("1") == "one"


def test_ttl_expiration(cache_svc: ResultCacheService[CacheTestPayload]) -> None:
  """Test that items expire after configured seconds."""
  cache_svc.set("temp", "data")
  assert cache_svc.get("temp") == "data"

  time.sleep(1.1)
  assert cache_svc.get("temp") is None


def test_sql_query_normalization(cache_svc: ResultCacheService[CacheTestPayload]) -> None:
  """Test that extra whitespace in SQL config doesn't change key."""
  conf1: JsonObject = {"query": "SELECT *   FROM table"}
  conf2: JsonObject = {"query": "SELECT * FROM table"}

  k1 = cache_svc.generate_key("SQL", conf1)
  k2 = cache_svc.generate_key("SQL", conf2)

  assert k1 == k2


def test_http_config_hashing(cache_svc: ResultCacheService[CacheTestPayload]) -> None:
  """Non-SQL widgets should hash full configs deterministically."""
  config: JsonObject = {"url": "https://api.example.com", "method": "GET", "params": {"q": "1"}}
  key = cache_svc.generate_key("HTTP", config)
  assert isinstance(key, str)
  assert len(key) == 64


def test_cache_rejects_oversized_items(cache_svc: ResultCacheService[CacheTestPayload]) -> None:
  """Ensure large items are not stored in the cache."""
  cache_svc._max_item_size = 5
  key = "too_big"
  value: JsonObject = {"data": "this-is-way-too-large"}

  cache_svc.set(key, value)
  assert cache_svc.get(key) is None


def test_cache_handles_unserializable_values(cache_svc: ResultCacheService[CacheTestPayload]) -> None:
  """Ensure serialization failures do not crash the cache set path."""
  key = "bad"
  value = BadStr()

  cache_svc.set(key, value)
  assert cache_svc.get(key) is value
