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
            if "auth_version" not in user_columns:
                connection.execute(text(
                    "ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0"
                ))
            if "password_reset_otp_hash" not in user_columns:
                connection.execute(text(
                    "ALTER TABLE users ADD COLUMN password_reset_otp_hash VARCHAR(64)"
                ))
            if "password_reset_otp_expires_at" not in user_columns:
                connection.execute(text(
                    "ALTER TABLE users ADD COLUMN password_reset_otp_expires_at "
                    "TIMESTAMP WITH TIME ZONE"
                ))
            if "password_reset_requested_at" not in user_columns:
                connection.execute(text(
                    "ALTER TABLE users ADD COLUMN password_reset_requested_at "
                    "TIMESTAMP WITH TIME ZONE"
                ))
            if "password_reset_attempts" not in user_columns:
                connection.execute(text(
                    "ALTER TABLE users ADD COLUMN password_reset_attempts INTEGER "
                    "NOT NULL DEFAULT 0"
                ))
            connection.execute(
                text("ALTER TABLE users ALTER COLUMN password DROP NOT NULL")
            )

            connection.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub "
                    "ON users (google_sub) WHERE google_sub IS NOT NULL"
                )
            )

        if "projects" in tables:
            unique_name_exists = any(
                index.get("unique") and index.get("column_names") == ["name"]
                for index in inspector.get_indexes("projects")
            ) or any(
                constraint.get("column_names") == ["name"]
                for constraint in inspector.get_unique_constraints("projects")
            )

            if not unique_name_exists:
                connection.execute(text("LOCK TABLE projects IN ACCESS EXCLUSIVE MODE"))
                projects = connection.execute(
                    text("SELECT id, name FROM projects ORDER BY name, id")
                ).mappings().all()
                used_names = {project["name"] for project in projects}
                seen_names = set()

                for project in projects:
                    name = project["name"]
                    if name not in seen_names:
                        seen_names.add(name)
                        continue

                    suffix_number = 1
                    while True:
                        suffix = (
                            f" ({project['id']})"
                            if suffix_number == 1
                            else f" ({project['id']}-{suffix_number})"
                        )
                        unique_name = f"{name[:255 - len(suffix)]}{suffix}"
                        if unique_name not in used_names:
                            break
                        suffix_number += 1

                    connection.execute(
                        text("UPDATE projects SET name = :name WHERE id = :project_id"),
                        {"name": unique_name, "project_id": project["id"]},
                    )
                    used_names.add(unique_name)

                connection.execute(text(
                    "CREATE UNIQUE INDEX ux_projects_name ON projects (name)"
                ))

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
            if "project_id" not in task_columns:
                project_reference = " REFERENCES projects(id)" if "projects" in tables else ""
                connection.execute(text(
                    f"ALTER TABLE tasks ADD COLUMN project_id INTEGER{project_reference}"
                ))
            if "tags" not in task_columns:
                connection.execute(text(
                    "ALTER TABLE tasks ADD COLUMN tags JSONB NOT NULL DEFAULT '[]'"
                ))
            elif str(next(
                column["type"] for column in inspector.get_columns("tasks")
                if column["name"] == "tags"
            )).upper() != "JSONB":
                connection.execute(text(
                    "ALTER TABLE tasks ALTER COLUMN tags TYPE JSONB USING tags::jsonb"
                ))
            if "priority" not in task_columns:
                connection.execute(text(
                    "ALTER TABLE tasks ADD COLUMN priority VARCHAR(10) "
                    "NOT NULL DEFAULT 'medium'"
                ))
            if "updated_by_user_id" not in task_columns:
                user_reference = " REFERENCES users(id)" if "users" in tables else ""
                connection.execute(text(
                    "ALTER TABLE tasks ADD COLUMN updated_by_user_id "
                    f"INTEGER{user_reference}"
                ))
                connection.execute(text(
                    "UPDATE tasks SET updated_by_user_id = user_id"
                ))
            connection.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_tasks_project_id ON tasks (project_id)"
            ))

def get_db():
    db = session()
    try:
        yield db
    finally:
        db.close()
