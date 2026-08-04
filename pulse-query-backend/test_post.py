import requests
import time

API = "http://localhost:8012/api/v1"

# 1. Register
email = f"test_{time.time()}@test.com"
r = requests.post(f"{API}/auth/register", json={"email": email, "password": "password"})
print("Reg:", r.status_code, r.text)

# 2. Login
r = requests.post(f"{API}/auth/login", data={"username": email, "password": "password"})
print("Login:", r.status_code)
token = r.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# 3. Create Dash
r = requests.post(f"{API}/dashboards/", json={"name": "test"}, headers=headers)
print("Dash:", r.status_code)
dash_id = r.json()["id"]

# 4. Create Widget
r = requests.post(
  f"{API}/dashboards/{dash_id}/widgets",
  json={
    "title": "HTTP",
    "type": "HTTP",
    "visualization": "metric",
    "config": {"url": "https://example.com", "method": "GET"},
  },
  headers=headers,
)
print("Widget:", r.status_code, r.text)
