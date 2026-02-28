import re

with open('backend/src/app/services/llm_client.py', 'r') as f:
    content = f.read()

# Import AdminSettingsResponse
content = content.replace(
    'from app.core.config import settings\n',
    'from app.core.config import settings\nfrom app.schemas.admin import AdminSettingsResponse\n'
)

# Update get_available_models
old_get_avail = """  def get_available_models(self) -> List[Dict[str, Any]]:
    \"\"\"
    Returns a list of configured models.
    \"\"\"
    return [
      {"id": m["id"], "name": m["name"], "provider": m["provider"], "is_local": m.get("is_local", False)}
      for m in self.swarm
    ]"""

new_get_avail = """  def get_available_models(self, admin_settings: Optional[AdminSettingsResponse] = None) -> List[Dict[str, Any]]:
    \"\"\"
    Returns a list of configured models. Filters by admin settings if provided.
    \"\"\"
    models = [
      {"id": m["id"], "name": m["name"], "provider": m["provider"], "is_local": m.get("is_local", False)}
      for m in self.swarm
    ]
    if admin_settings and admin_settings.visible_models:
        return [m for m in models if m["id"] in admin_settings.visible_models]
    return models"""

content = content.replace(old_get_avail, new_get_avail)

# Update _generate_single signature
content = content.replace(
    '  async def _generate_single(\n    self,\n    combatant: Dict[str, Any],\n    messages: List[Dict[str, str]],\n    temperature: float,\n    max_tokens: int,\n    stop: Optional[List[str]],\n  ) -> ArenaResponse:',
    '  async def _generate_single(\n    self,\n    combatant: Dict[str, Any],\n    messages: List[Dict[str, str]],\n    temperature: float,\n    max_tokens: int,\n    stop: Optional[List[str]],\n    admin_settings: Optional[AdminSettingsResponse] = None,\n  ) -> ArenaResponse:'
)

# Update _generate_single api key handling
old_client_call = """      response = await run_in_threadpool(
        client.completion,
        model=target_model_name,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stop=stop,
      )"""

new_client_call = """      # Override API key if provided in settings
      kwargs = {}
      if admin_settings and admin_settings.api_keys:
          provider = combatant["provider"]
          if provider in admin_settings.api_keys:
              kwargs["api_key"] = admin_settings.api_keys[provider]

      response = await run_in_threadpool(
        client.completion,
        model=target_model_name,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stop=stop,
        **kwargs,
      )"""
content = content.replace(old_client_call, new_client_call)

# Update generate_arena_competition signature
old_gen_arena = """  async def generate_arena_competition(
    self,
    messages: List[Dict[str, str]],
    temperature: float = 0.0,
    max_tokens: int = 512,
    stop: Optional[List[str]] = None,
    target_model_ids: Optional[List[str]] = None,
  ) -> List[ArenaResponse]:"""

new_gen_arena = """  async def generate_arena_competition(
    self,
    messages: List[Dict[str, str]],
    temperature: float = 0.0,
    max_tokens: int = 512,
    stop: Optional[List[str]] = None,
    target_model_ids: Optional[List[str]] = None,
    admin_settings: Optional[AdminSettingsResponse] = None,
  ) -> List[ArenaResponse]:"""
content = content.replace(old_gen_arena, new_gen_arena)

# Update task creation inside generate_arena_competition
old_task_creation = """    # Create tasks for all providers
    tasks = [self._generate_single(combatant, messages, temperature, max_tokens, stop) for combatant in active_combatants]"""
new_task_creation = """    # Filter by visible_models if no specific targets are requested
    if not target_model_ids and admin_settings and admin_settings.visible_models:
        active_combatants = [c for c in active_combatants if c["id"] in admin_settings.visible_models]

    # Create tasks for all providers
    tasks = [self._generate_single(combatant, messages, temperature, max_tokens, stop, admin_settings) for combatant in active_combatants]"""
content = content.replace(old_task_creation, new_task_creation)

with open('backend/src/app/services/llm_client.py', 'w') as f:
    f.write(content)

print("Updated llm_client.py")
