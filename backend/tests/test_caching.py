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
from app.services.cache_service import ResultCacheService


@pytest.fixture
def cache_svc():
  """Returns a fresh instance of the service for each test."""
  svc = ResultCacheService()
  # Override settings for easier testing
  svc._ttl = 1  # 1 second TTL
  svc._max_entries = 3  # Small capacity
  svc._max_item_size = 1000
  return svc


def test_cache_set_get_hit(cache_svc):
  """Test basic storage and retrieval."""
  key = "test_key"
  data = {"value": 100}

  cache_svc.set(key, data)
  result = cache_svc.get(key)

  assert result == data
  assert result["value"] == 100


def test_cache_miss(cache_svc):
  """Test getting a non-existent key returns None."""
  assert cache_svc.get("ghost") is None


def test_deterministic_hashing(cache_svc):
  """Test that key generation is consistent regardless of key order in dicts."""
  config_a = {"query": "SELECT *", "limit": 10}
  config_b = {"limit": 10, "query": "SELECT *"}

  key_a = cache_svc.generate_key("SQL", config_a)
  key_b = cache_svc.generate_key("SQL", config_b)

  assert key_a == key_b
  assert len(key_a) == 64  # SHA256 hex length


def test_lru_eviction(cache_svc):
  """Test that the oldest item is removed when capacity is exceeded."""
  # Capacity is 3
  cache_svc.set("1", "one")
  cache_svc.set("2", "two")
  cache_svc.set("3", "three")

  # "1" is oldest. Add "4" -> "1" should be evicted.
  cache_svc.set("4", "four")

  assert cache_svc.get("1") is None
  assert cache_svc.get("2") == "two"
  assert cache_svc.get("4") == "four"


def test_lru_update_on_access(cache_svc):
  """Test that accessing an item makes it 'recent'."""
  # Capacity is 3
  cache_svc.set("1", "one")
  cache_svc.set("2", "two")
  cache_svc.set("3", "three")

  # Access "1" -> Now "2" is oldest
  cache_svc.get("1")

  # Add "4" -> Should evict "2", NOT "1"
  cache_svc.set("4", "four")

  assert cache_svc.get("2") is None  # Evicted
  assert cache_svc.get("1") == "one"  # Still here


def test_ttl_expiration(cache_svc):
  """Test that items expire after configured seconds."""
  cache_svc.set("temp", "data")

  # Immediate check
  assert cache_svc.get("temp") == "data"

  # Wait for TTL (1.1s > 1s)
  time.sleep(1.1)

  # Check again -> Should be None
  assert cache_svc.get("temp") is None


def test_sql_query_normalization(cache_svc):
  """Test that extra whitespace in SQL config doesn't change key."""
  conf1 = {"query": "SELECT *   FROM table"}
  conf2 = {"query": "SELECT * FROM table"}

  k1 = cache_svc.generate_key("SQL", conf1)
  k2 = cache_svc.generate_key("SQL", conf2)

  assert k1 == k2


def test_http_config_hashing(cache_svc):
  """Non-SQL widgets should hash full configs deterministically."""
  config = {"url": "https://api.example.com", "method": "GET", "params": {"q": "1"}}
  key = cache_svc.generate_key("HTTP", config)
  assert isinstance(key, str)
  assert len(key) == 64


def test_cache_rejects_oversized_items(cache_svc):
  """Ensure large items are not stored in the cache."""
  cache_svc._max_item_size = 5
  key = "too_big"
  value = {"data": "this-is-way-too-large"}

  cache_svc.set(key, value)
  assert cache_svc.get(key) is None


def test_cache_handles_unserializable_values(cache_svc):
  """Ensure serialization failures do not crash the cache set path."""

  class BadStr:
    def __str__(self) -> str:
      raise ValueError("nope")

  key = "bad"
  value = BadStr()

  cache_svc.set(key, value)
  assert cache_svc.get(key) is value
