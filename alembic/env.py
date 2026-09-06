from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from app.core.database import Base
from app.config import settings

# Import all application models so Alembic autogenerate can detect them.
import app.models
import app.modules.timetable.models
import app.modules.school.models
import app.modules.academics.models
import app.modules.class_register.models
import app.modules.users.models
import app.modules.ocr.models
import app.modules.students.models_v2
import app.modules.attendance.models
import app.modules.examinations.models_v2
import app.modules.finance.models
import app.modules.outlook.router

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(config.get_section(config.config_ini_section, {}), prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
