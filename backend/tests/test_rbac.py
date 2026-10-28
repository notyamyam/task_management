import os
import unittest
from datetime import datetime, timezone
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from unittest.mock import patch


os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("ALGORITHM", "HS256")

from src.services.rbac import PERMISSION_CATALOG, assign_super_admin


class EmptyQuery:
    def filter(self, *criteria):
        return self

    def with_for_update(self):
        return self

    def first(self):
        return None


class EmptyDatabase:
    def query(self, model):
        return EmptyQuery()

    def rollback(self):
        pass


def fake_db_without_active_user():
    return EmptyDatabase()


class CapturingConnection:
    def __init__(self):
        self.statements = []

    def execute(self, statement, parameters=None):
        self.statements.append(str(statement))


class FakeBegin:
    def __init__(self, connection):
        self.connection = connection

    def __enter__(self):
        return self.connection

    def __exit__(self, exc_type, exc_value, traceback):
        return False


class FakeEngine:
    def __init__(self, connection):
        self.connection = connection

    def begin(self):
        return FakeBegin(self.connection)


class UsersOnlyInspector:
    def get_table_names(self):
        return ["users"]

    def get_columns(self, table):
        return [
            {"name": name}
            for name in (
                "id",
                "email",
                "password",
                "google_sub",
                "first_name",
                "last_name",
                "auth_version",
                "password_reset_otp_hash",
                "password_reset_otp_expires_at",
                "password_reset_requested_at",
                "password_reset_attempts",
            )
        ]

    def get_check_constraints(self, table):
        return []


class RbacCatalogTests(unittest.TestCase):
    def test_permission_keys_exactly_match_the_approved_catalog(self):
        expected_keys = {
            "users.create",
            "users.read",
            "users.update",
            "users.delete",
            "users.assign_roles",
            "users.revoke_sessions",
            "roles.create",
            "roles.read",
            "roles.update",
            "roles.delete",
            "roles.set_permissions",
            "projects.create",
            "projects.read",
            "projects.update",
            "projects.delete",
            "projects.transfer",
            "project_members.create",
            "project_members.read",
            "project_members.delete",
            "tasks.create",
            "tasks.read",
            "tasks.update",
            "tasks.delete",
            "subtasks.create",
            "subtasks.read",
            "subtasks.update",
            "subtasks.delete",
            "task_dependencies.create",
            "task_dependencies.read",
            "task_dependencies.delete",
            "task_comments.read",
            "task_comments.delete",
            "task_activity.read",
            "notifications.read",
            "notifications.delete",
            "notification_preferences.read",
            "notification_preferences.update",
            "reports.export",
            "reports.generate",
            "audit_logs.read",
            "system_integrations.read",
        }
        keys = [item["key"] for item in PERMISSION_CATALOG]

        self.assertEqual(len(keys), len(set(keys)))
        self.assertEqual(set(keys), expected_keys)

    def test_bootstrap_requires_an_existing_active_user(self):
        with self.assertRaisesRegex(ValueError, "active user"):
            assign_super_admin(fake_db_without_active_user(), "admin@example.com")

    def test_rbac_models_match_the_schema_contract(self):
        from sqlalchemy.dialects.postgresql import JSONB

        from src.models import (
            AdminAuditLog,
            Permission,
            Role,
            RolePermission,
            User,
            UserRole,
        )

        self.assertEqual(
            {
                Permission.__tablename__,
                Role.__tablename__,
                RolePermission.__tablename__,
                UserRole.__tablename__,
                AdminAuditLog.__tablename__,
            },
            {
                "permissions",
                "roles",
                "role_permissions",
                "user_roles",
                "admin_audit_logs",
            },
        )
        self.assertEqual(
            {column.name for column in RolePermission.__table__.primary_key},
            {"role_id", "permission_id"},
        )
        self.assertEqual(
            {column.name for column in UserRole.__table__.primary_key},
            {"user_id", "role_id"},
        )
        self.assertEqual(Role.version.default.arg, 1)
        self.assertEqual(str(Role.version.server_default.arg), "1")
        self.assertIsInstance(AdminAuditLog.metadata_json.type, JSONB)
        for column in (AdminAuditLog.actor_user_id, AdminAuditLog.target_user_id):
            self.assertTrue(column.nullable)
            self.assertEqual(next(iter(column.foreign_keys)).ondelete, "SET NULL")
        self.assertTrue(
            {"status", "must_change_password", "created_at", "updated_at", "deleted_at"}
            <= set(User.__table__.columns.keys())
        )

    def test_catalog_reconciliation_upserts_retires_and_populates_super_admin(self):
        from sqlalchemy import create_engine
        from sqlalchemy.dialects.postgresql import JSONB
        from sqlalchemy.ext.compiler import compiles
        from sqlalchemy.orm import sessionmaker

        from src.database import Base
        from src.models import Permission, Role, RolePermission
        from src.services.rbac import initialize_rbac_catalog

        @compiles(JSONB, "sqlite")
        def compile_jsonb_for_sqlite(type_, compiler, **kwargs):
            return "JSON"

        engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        db = Session()
        db.add_all(
            [
                Permission(
                    key="users.read",
                    module="stale",
                    action="stale",
                    description="stale",
                    is_protected=False,
                    retired_at=datetime.now(timezone.utc),
                ),
                Permission(
                    key="removed.read",
                    module="removed",
                    action="read",
                    description="Removed permission",
                    is_protected=True,
                ),
            ]
        )
        db.commit()

        initialize_rbac_catalog(db)
        db.close()

        db = Session()
        permissions = {item.key: item for item in db.query(Permission).all()}
        role = db.query(Role).filter(Role.slug == "super_admin").one()
        attached_keys = {
            permission.key
            for permission in (
                db.query(Permission)
                .join(RolePermission, RolePermission.permission_id == Permission.id)
                .filter(RolePermission.role_id == role.id)
                .all()
            )
        }

        self.assertEqual(
            set(permissions),
            {item["key"] for item in PERMISSION_CATALOG} | {"removed.read"},
        )
        self.assertIsNone(permissions["users.read"].retired_at)
        self.assertEqual(permissions["users.read"].module, "users")
        self.assertIsNotNone(permissions["removed.read"].retired_at)
        self.assertTrue(role.is_system)
        self.assertTrue(role.is_protected)
        self.assertEqual(attached_keys, {item["key"] for item in PERMISSION_CATALOG})

        initialize_rbac_catalog(db)
        self.assertEqual(
            db.query(RolePermission).filter(RolePermission.role_id == role.id).count(),
            len(PERMISSION_CATALOG),
        )
        db.close()
        engine.dispose()

    def test_catalog_reconciliation_takes_postgresql_advisory_lock_before_queries(self):
        from types import SimpleNamespace

        from sqlalchemy import create_engine
        from sqlalchemy.dialects.postgresql import JSONB
        from sqlalchemy.ext.compiler import compiles
        from sqlalchemy.orm import sessionmaker

        from src.database import Base
        from src.services.rbac import initialize_rbac_catalog

        @compiles(JSONB, "sqlite")
        def compile_jsonb_for_sqlite(type_, compiler, **kwargs):
            return "JSON"

        engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        real_db = Session()
        events = []

        class RecordingPostgresSession:
            def get_bind(self):
                return SimpleNamespace(dialect=SimpleNamespace(name="postgresql"))

            def execute(self, statement, parameters=None):
                events.append(("execute", str(statement), parameters))

            def query(self, *entities, **kwargs):
                events.append(("query", entities[0].__name__))
                return real_db.query(*entities, **kwargs)

            def __getattr__(self, name):
                return getattr(real_db, name)

        initialize_rbac_catalog(RecordingPostgresSession())

        self.assertEqual(events[0][0], "execute")
        self.assertEqual(events[0][1], "SELECT pg_advisory_xact_lock(:lock_id)")
        self.assertIsInstance(events[0][2]["lock_id"], int)
        self.assertEqual(events[1][0], "query")
        real_db.close()
        engine.dispose()

    def test_bootstrap_assigns_once_revokes_sessions_and_audits_without_credentials(self):
        from sqlalchemy import create_engine
        from sqlalchemy.dialects.postgresql import JSONB
        from sqlalchemy.ext.compiler import compiles
        from sqlalchemy.orm import sessionmaker

        from src.database import Base
        from src.models import AdminAuditLog, Role, User, UserRole
        from src.services.rbac import initialize_rbac_catalog

        @compiles(JSONB, "sqlite")
        def compile_jsonb_for_sqlite(type_, compiler, **kwargs):
            return "JSON"

        engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        db = Session()
        user = User(email="admin@example.com", password="stored-hash", status="active")
        db.add(user)
        db.commit()
        user_id = user.id
        initialize_rbac_catalog(db)

        assigned_user = assign_super_admin(db, " Admin@Example.com ")
        self.assertEqual(assigned_user.id, user_id)
        db.close()

        db = Session()
        role = db.query(Role).filter(Role.slug == "super_admin").one()
        assignment = db.query(UserRole).one()
        audit = db.query(AdminAuditLog).one()
        user = db.query(User).filter(User.id == user_id).one()
        self.assertEqual((assignment.user_id, assignment.role_id), (user_id, role.id))
        self.assertEqual(user.auth_version, 1)
        self.assertEqual(audit.action, "users.bootstrap_super_admin")
        self.assertEqual(audit.target_user_id, user_id)
        self.assertEqual(audit.metadata_json, {})

        assign_super_admin(db, "admin@example.com")
        self.assertEqual(db.query(UserRole).count(), 1)
        self.assertEqual(db.query(AdminAuditLog).count(), 1)
        self.assertEqual(db.query(User).filter(User.id == user_id).one().auth_version, 1)
        db.close()
        engine.dispose()

    def test_bootstrap_rejects_persisted_disabled_and_deleted_users_without_changes(self):
        from sqlalchemy import create_engine
        from sqlalchemy.dialects.postgresql import JSONB
        from sqlalchemy.ext.compiler import compiles
        from sqlalchemy.orm import sessionmaker

        from src.database import Base
        from src.models import AdminAuditLog, User, UserRole
        from src.services.rbac import initialize_rbac_catalog

        @compiles(JSONB, "sqlite")
        def compile_jsonb_for_sqlite(type_, compiler, **kwargs):
            return "JSON"

        for status in ("disabled", "deleted"):
            with self.subTest(status=status):
                engine = create_engine("sqlite+pysqlite:///:memory:")
                Base.metadata.create_all(engine)
                Session = sessionmaker(bind=engine)
                db = Session()
                user = User(
                    email=f"{status}@example.com",
                    password="stored-hash",
                    status=status,
                    auth_version=7,
                )
                db.add(user)
                db.commit()
                user_id = user.id
                initialize_rbac_catalog(db)

                with self.assertRaisesRegex(ValueError, "active user"):
                    assign_super_admin(db, user.email)

                self.assertEqual(db.query(UserRole).count(), 0)
                self.assertEqual(db.query(AdminAuditLog).count(), 0)
                self.assertEqual(
                    db.query(User).filter(User.id == user_id).one().auth_version,
                    7,
                )
                db.close()
                engine.dispose()

    def test_user_lifecycle_migration_adds_backfills_then_constrains_columns(self):
        from src import database

        connection = CapturingConnection()
        inspector = UsersOnlyInspector()
        with (
            patch.object(database, "engine", FakeEngine(connection)),
            patch.object(database, "inspect", return_value=inspector),
        ):
            database.migrate_existing_schema()

        expected_in_order = [
            "ALTER TABLE users ADD COLUMN status VARCHAR(20)",
            "ALTER TABLE users ADD COLUMN must_change_password BOOLEAN",
            "ALTER TABLE users ADD COLUMN created_at TIMESTAMP WITH TIME ZONE",
            "ALTER TABLE users ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE",
            "ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE",
            "UPDATE users SET status = 'active' WHERE status IS NULL",
            "UPDATE users SET must_change_password = FALSE WHERE must_change_password IS NULL",
            "UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL",
            "UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL",
            "ALTER TABLE users ALTER COLUMN status SET DEFAULT 'active'",
            "ALTER TABLE users ALTER COLUMN status SET NOT NULL",
            "ALTER TABLE users ALTER COLUMN must_change_password SET DEFAULT FALSE",
            "ALTER TABLE users ALTER COLUMN must_change_password SET NOT NULL",
            "ALTER TABLE users ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP",
            "ALTER TABLE users ALTER COLUMN created_at SET NOT NULL",
            "ALTER TABLE users ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP",
            "ALTER TABLE users ALTER COLUMN updated_at SET NOT NULL",
            "ALTER TABLE users ADD CONSTRAINT ck_users_status CHECK "
            "(status IN ('active', 'disabled', 'deleted'))",
        ]
        positions = [connection.statements.index(statement) for statement in expected_in_order]
        self.assertEqual(positions, sorted(positions))

    def test_database_initialization_preserves_order_and_closes_catalog_session(self):
        from src import database
        from src.services import rbac

        events = []

        class FakeMetadata:
            def create_all(self, bind):
                events.append("create_all")

        class FakeBase:
            metadata = FakeMetadata()

        class FakeSession:
            def __enter__(self):
                events.append("session.open")
                return self

            def __exit__(self, exc_type, exc_value, traceback):
                events.append("session.close")

        with (
            patch.object(database, "Base", FakeBase),
            patch.object(database, "engine", object()),
            patch.object(database, "session", FakeSession),
            patch.object(
                database,
                "migrate_existing_schema",
                lambda: events.append("migrate"),
            ),
            patch.object(
                rbac,
                "initialize_rbac_catalog",
                lambda db: events.append("catalog"),
            ),
        ):
            database.initialize_database()

        self.assertEqual(
            events,
            ["migrate", "create_all", "session.open", "catalog", "session.close"],
        )

    def test_bootstrap_cli_returns_redacted_success_and_failure_summaries(self):
        from src.scripts import bootstrap_super_admin

        assigned_emails = []

        class FakeSession:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc_value, traceback):
                return False

        def assign_success(db, email):
            assigned_emails.append(email)
            return object()

        stdout = StringIO()
        with (
            patch.object(bootstrap_super_admin, "session", FakeSession),
            patch.object(bootstrap_super_admin, "assign_super_admin", assign_success),
            redirect_stdout(stdout),
        ):
            result = bootstrap_super_admin.main(["--email", "admin@example.com"])

        self.assertEqual(result, 0)
        self.assertEqual(assigned_emails, ["admin@example.com"])
        self.assertEqual(stdout.getvalue(), "Super administrator assigned successfully.\n")
        self.assertNotIn("admin@example.com", stdout.getvalue())

        def assign_failure(db, email):
            raise ValueError("active user admin@example.com was not found")

        stderr = StringIO()
        with (
            patch.object(bootstrap_super_admin, "session", FakeSession),
            patch.object(bootstrap_super_admin, "assign_super_admin", assign_failure),
            redirect_stderr(stderr),
        ):
            result = bootstrap_super_admin.main(["--email", "admin@example.com"])

        self.assertEqual(result, 1)
        self.assertEqual(stderr.getvalue(), "Super administrator bootstrap failed.\n")
        self.assertNotIn("admin@example.com", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
