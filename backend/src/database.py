from sqlalchemy import create_engine, inspect, text
from .security import config
from sqlalchemy.orm import sessionmaker, declarative_base

engine = create_engine(config.settings.database_url)
session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def migrate_existing_schema():
    with engine.begin() as connection:
        inspector = inspect(connection)
        tables = inspector.get_table_names()

        if "users" in tables:
            user_columns = {column["name"] for column in inspector.get_columns("users")}
            if "username" in user_columns and "email" not in user_columns:
                connection.execute(text("ALTER TABLE users RENAME COLUMN username TO email"))
            if "google_sub" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN google_sub VARCHAR"))
            if "first_name" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN first_name VARCHAR(100)"))
            if "last_name" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN last_name VARCHAR(100)"))
            connection.execute(
                text("ALTER TABLE users ALTER COLUMN password DROP NOT NULL")
            )

            connection.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub "
                    "ON users (google_sub) WHERE google_sub IS NOT NULL"
                )
            )

        if "tasks" in tables:
            task_columns = {column["name"] for column in inspector.get_columns("tasks")}
            if "created_at" not in task_columns:
                connection.execute(text(
                    "ALTER TABLE tasks ADD COLUMN created_at TIMESTAMP WITH TIME ZONE "
                    "NOT NULL DEFAULT CURRENT_TIMESTAMP"
                ))
            if "updated_at" not in task_columns:
                connection.execute(text(
                    "ALTER TABLE tasks ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE "
                    "NOT NULL DEFAULT CURRENT_TIMESTAMP"
                ))

def get_db():
    db = session()
    try:
        yield db
    finally:
        db.close()
