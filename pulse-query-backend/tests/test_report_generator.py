"""
Tests for Benchmark Report Generator.

Verifies:
1. CSV Parsing logic (BenchmarkResult instantiation).
2. Statistical Aggregation (StrategyStats math).
3. The Logic Checker for "CoT Improvements" (Failure Analysis logic).
4. Markdown Formatting compliance.
"""

from pathlib import Path
from unittest.mock import patch

import pytest

from scripts.generate_report import (
  BenchmarkResult,
  StrategyStats,
  aggregate_stats,
  analyze_improvements,
  generate_markdown,
  load_results,
  main,
)


def test_benchmark_result_parsing() -> None:
  """
  Verify that CSV row dictionaries are correctly parsed into objects with type conversion.
  """
  row = {"Theme": "Test Theme", "Strategy": "zero-shot", "Model": "GPT-4", "Success": "True", "LatencyMs": "150"}
  res = BenchmarkResult(row)

  assert res.theme == "Test Theme"
  assert res.strategy == "zero-shot"
  assert res.success is True
  assert res.latency == 150


def test_strategy_stats_math() -> None:
  """
  Verify accuracy and average calculations.
  """
  stats = StrategyStats()
  stats.total = 10
  stats.wins = 5
  stats.latencies = [100, 200]

  assert stats.accuracy == 50.0
  assert stats.avg_latency == 150.0


def test_aggregate_stats_logic() -> None:
  """
  Verify grouping of raw results into strategy stats buckets.
  """
  raw_data = [
    BenchmarkResult({"Strategy": "A", "Success": "True", "LatencyMs": "10"}),
    BenchmarkResult({"Strategy": "A", "Success": "False", "LatencyMs": "20"}),
    BenchmarkResult({"Strategy": "B", "Success": "True", "LatencyMs": "100"}),
  ]

  agg = aggregate_stats(raw_data)

  assert "A" in agg
  assert "B" in agg

  assert agg["A"].total == 2
  assert agg["A"].wins == 1
  assert agg["A"].avg_latency == 15.0

  assert agg["B"].accuracy == 100.0


def test_analyze_improvements_logic() -> None:
  """
  Verify the logic that detects when CoT is strictly better than Zero-Shot.

  Scenario:
  - Theme 1: Zero-Shot Fails (False/False), CoT Succeeds (True). -> Should be detected.
  - Theme 2: Zero-Shot Succeeds. -> Ignored.
  - Theme 3: Both Fail. -> Ignored.
  """
  data = [
    # Theme 1: Improvement Case
    BenchmarkResult({"Theme": "T1", "Strategy": "zero-shot", "Success": "False"}),
    BenchmarkResult({"Theme": "T1", "Strategy": "cot-macro", "Success": "True", "Model": "BetterModel"}),
    # Theme 2: Baseline Good
    BenchmarkResult({"Theme": "T2", "Strategy": "zero-shot", "Success": "True"}),
    BenchmarkResult({"Theme": "T2", "Strategy": "cot-macro", "Success": "True"}),
    # Theme 3: Both Bad
    BenchmarkResult({"Theme": "T3", "Strategy": "zero-shot", "Success": "False"}),
    BenchmarkResult({"Theme": "T3", "Strategy": "cot-macro", "Success": "False"}),
  ]

  improvements = analyze_improvements(data)

  assert len(improvements) == 1
  assert improvements[0]["theme"] == "T1"
  assert improvements[0]["cot_model"] == "BetterModel"


def test_markdown_generation() -> None:
  """
  Verify that the markdown output contains the expected table rows and sections.
  """
  stats = {"zero-shot": StrategyStats(), "cot-macro": StrategyStats()}
  stats["zero-shot"].total = 10
  stats["zero-shot"].wins = 2

  from scripts.generate_report import CotImprovementItemDict

  improvements: list[CotImprovementItemDict] = [{"theme": "Complex Logic", "cot_model": "GPT-4"}]

  md = generate_markdown(stats, improvements)

  # Check Table presence
  assert "| Strategy | Accuracy" in md
  assert "| **zero-shot** | 20.0%" in md

  # Check Analysis Section
  assert "Failure Analysis" in md
  assert "- **Complex Logic**: Fixed by `GPT-4`" in md

  md_empty = generate_markdown(stats, [])
  assert "No distinct improvements detected" in md_empty


def test_load_results_and_main(tmp_path: Path) -> None:
  """Verify load_results file reading, FileNotFoundError, and CLI main() execution."""
  missing_csv = tmp_path / "missing.csv"
  with pytest.raises(FileNotFoundError):
    load_results(str(missing_csv))

  csv_path = tmp_path / "results.csv"
  out_md = tmp_path / "report.md"
  csv_path.write_text(
    "Theme,Strategy,Model,Success,LatencyMs\nT1,zero-shot,M1,False,100\nT1,cot-macro,M2,True,120\n",
    encoding="utf-8",
  )

  loaded = load_results(str(csv_path))
  assert len(loaded) == 2
  assert loaded[1].success is True

  with patch("sys.argv", ["generate_report.py", "--input", str(csv_path), "--output", str(out_md)]):
    main()
  assert out_md.exists()
  assert "M2" in out_md.read_text(encoding="utf-8")

  with patch("sys.argv", ["generate_report.py", "--input", str(missing_csv), "--output", str(out_md)]):
    with pytest.raises(SystemExit) as exc:
      main()
    assert exc.value.code == 1
