import json
import random
import uuid
import os
from pathlib import Path

# Set fixed seed for reproducibility
random.seed(42)

SERVICES = ["Cardiology", "Neurology", "Orthopedics", "Trauma", "General Surgery", "Oncology", "Pediatrics"]
UNITS = ["ICU", "MedSurg", "StepDown", "Telemetry", "Nursery", "PCU"]

THEMES = [
  {
    "name": "Predictive Availability (Capacity Surge)",
    "template": "We have {demand} incoming {service} patients. Currently, {unit1} has {cap1} open beds and {unit2} has {cap2} open beds. Where should they go to minimize overflow?",
    "logic": "demand_exceeds_primary",
  },
  {
    "name": "Bottleneck Analysis (Resource Constriction)",
    "template": "A staffing shortage has reduced {unit1} capacity to {cap1}. We have {demand} {service} patients requiring admission. {unit2} is available with {cap2} beds.",
    "logic": "restricted_capacity",
  },
  {
    "name": "Day-of-Week Volatility (Weekend Surge)",
    "template": "It is Sunday night. Discharges are frozen. We have {demand1} {service1} patients and {demand2} {service2} patients holding in the ED. Available beds: {cap1} in {unit1}, {cap2} in {unit2}, and {cap3} in {unit3}. Route them efficiently.",
    "logic": "multi_service_contention",
  },
  {
    "name": "Service Dominance (Priority Affinities)",
    "template": "{unit1} is heavily favored by {service1}. We have {demand1} {service1} patients and {demand2} {service2} patients. {unit1} has {cap1} beds, {unit2} has {cap2} beds. Allocate to minimize overflow.",
    "logic": "affinity_contention",
  },
  {
    "name": "Clinical Risk (Acuity Stepping)",
    "template": "{demand} high-acuity {service} patients need immediate placement. {unit1} (high acuity) has {cap1} beds. {unit2} (lower acuity) has {cap2} beds. Recommend a routing policy.",
    "logic": "acuity_overflow",
  },
]


def generate_scenarios(count=150):
  scenarios = []

  for _ in range(count):
    theme = random.choice(THEMES)

    # Randomize variables
    s1, s2 = random.sample(SERVICES, 2)
    u1, u2, u3 = random.sample(UNITS, 3)

    d1 = random.randint(5, 40)
    d2 = random.randint(5, 30)

    c1 = random.randint(2, 25)
    c2 = random.randint(5, 30)
    c3 = random.randint(5, 20)

    # Format prompt
    prompt = theme["template"].format(
      demand=d1,
      demand1=d1,
      demand2=d2,
      service=s1,
      service1=s1,
      service2=s2,
      unit1=u1,
      unit2=u2,
      unit3=u3,
      cap1=c1,
      cap2=c2,
      cap3=c3,
    )

    # Construct Demand Data
    demand_data = []
    if "{demand1}" in theme["template"]:
      demand_data.append({"Service": s1, "Count": d1})
      demand_data.append({"Service": s2, "Count": d2})
    else:
      demand_data.append({"Service": s1, "Count": d1})

    # Construct Capacity Base
    base_capacity = {u1: c1, u2: c2}
    if "{cap3}" in theme["template"]:
      base_capacity[u3] = c3

    # Determine logical expectation (for automated scoring)
    total_demand = sum(d["Count"] for d in demand_data)
    total_capacity = sum(base_capacity.values())
    expected_overflow = max(0, total_demand - total_capacity)

    scenario = {
      "id": str(uuid.uuid4()),
      "theme": theme["name"],
      "complexity": "Medium" if len(demand_data) == 1 else "High",
      "prompt": prompt,
      "demand_data": demand_data,
      "base_capacity": base_capacity,
      "expected_metrics": {
        "total_demand": total_demand,
        "total_capacity": total_capacity,
        "expected_overflow": expected_overflow,
      },
    }

    scenarios.append(scenario)

  return scenarios


if __name__ == "__main__":
  out_dir = Path(__file__).parent.parent / "data"
  out_dir.mkdir(exist_ok=True)
  out_file = out_dir / "mpax_benchmark_scenarios.json"

  data = generate_scenarios(200)  # Generate 200 variations

  with open(out_file, "w") as f:
    json.dump(data, f, indent=2)

  print(f"Successfully generated {len(data)} MPAX benchmark scenarios at {out_file}")
