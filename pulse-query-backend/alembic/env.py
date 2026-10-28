"""Alembic migration environment configuration."""

import asyncio
from logging.config import fileConfig

from sqlalchemy import inspect, pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context
from app.core.config import settings
from app.database.postgres import Base, register_sqlite_type_compilers
from app.models import register_orm_models

config = context.config

if config.config_file_name is not None:
  fileConfig(config.config_file_name, disable_existing_loggers=False)

register_orm_models()
target_metadata = Base.metadata
register_sqlite_type_compilers()

config.set_main_option("sqlalchemy.url", settings.SQLALCHEMY_DATABASE_URI)


def run_migrations_offline() -> None:
  """Run migrations in 'offline' mode."""
  url = config.get_main_option("sqlalchemy.url")
  context.configure(
    url=url,
    target_metadata=target_metadata,
    literal_binds=True,
    dialect_opts={"paramstyle": "named"},
  )

  with context.begin_transaction():
    context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
  """
  Configures the Alembic context with an active connection and executes migrations.

  Args:
      connection (Connection): Active SQLAlchemy database connection.
  """
  inspector = inspect(connection)
  existing_tables = set(inspector.get_table_names())
  if "users" in existing_tables and "alembic_version" not in existing_tables:
    target_metadata.drop_all(bind=connection, checkfirst=True)
    connection.commit()

  context.configure(connection=connection, target_metadata=target_metadata)

  with context.begin_transaction():
    context.run_migrations()


async def run_async_migrations() -> None:
  """Creates an async SQLAlchemy engine, executes online Alembic migrations, and commits the transaction."""
  connectable = async_engine_from_config(
    config.get_section(config.config_ini_section, {}),
    prefix="sqlalchemy.",
    poolclass=pool.NullPool,
  )

  async with connectable.connect() as connection:
    await connection.run_sync(do_run_migrations)
    await connection.commit()

  await connectable.dispose()


def run_migrations_online() -> None:
  """Run migrations in 'online' mode."""
  asyncio.run(run_async_migrations())


if context.is_offline_mode():
  run_migrations_offline()
else:
  run_migrations_online()
