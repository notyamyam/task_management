import asyncio
import json
import os
import unittest
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch
from urllib.parse import urlsplit

from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("ALGORITHM", "HS256")


@compiles(JSONB, "sqlite")
def compile_jsonb_for_sqlite(type_, compiler, **kwargs):
    return "JSON"


from src.database import Base, get_db
from src.models import (
    AdminAuditLog,
    Notification,
    NotificationPreference,
    Permission,
    Project,
    Role,
    RolePermission,
    Task,
    User,
    UserRole,
)
from src.routers.admin import router as admin_router
from src.security import auth
from src.services.admin import audit_admin_action


def request(app, method, url, *, json_body=None):
    parsed = urlsplit(url)
    body = json.dumps(json_body).encode() if json_body is not None else b""
    headers = [(b"content-length", str(len(body)).encode())]
    if json_body is not None:
        headers.append((b"content-type", b"application/json"))
    sent = []
    received = False

    async def receive():
        nonlocal received
        if not received:
            received = True
            return {"type": "http.request", "body": body, "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message):
        sent.append(message)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": parsed.path,
        "raw_path": parsed.path.encode(),
        "query_string": parsed.query.encode(),
        "root_path": "",
        "headers": headers,
        "client": ("test", 123),
        "server": ("testserver", 80),
    }
    asyncio.run(app(scope, receive, send))
    start = next(message for message in sent if message["type"] == "http.response.start")
    response_body = b"".join(
        message.get("body", b"")
        for message in sent
        if message["type"] == "http.response.body"
    )
    response_headers = {
        key.decode().lower(): value.decode() for key, value in start["headers"]
    }
    try:
        parsed_body = json.loads(response_body or b"null")
    except json.JSONDecodeError:
        parsed_body = response_body.decode()
    return start["status"], parsed_body, response_headers


class AdminOperationsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite+pysqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.actor = self.add_user("admin@example.com", first_name="Admin", last_name="User")

        app = FastAPI()
        app.include_router(admin_router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[auth.get_current_user] = lambda: self.actor
        self.app = app

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def add_user(self, email, *, status="active", first_name="Test", last_name="User"):
        user = User(
            email=email,
            password="stored-hash",
            first_name=first_name,
            last_name=last_name,
            status=status,
            must_change_password=False,
        )
        self.db.add(user)
        self.db.commit()
        return user

    def grant_actor(self, *permission_keys):
        role = Role(
            slug=f"operations_role_{self.db.query(Role).count()}",
            name="Operations administrator",
        )
        self.db.add(role)
        self.db.flush()
        for key in permission_keys:
            module, action = key.split(".", 1)
            permission = Permission(
                key=key,
                module=module,
                action=action,
                description=key,
                is_protected=True,
            )
            self.db.add(permission)
            self.db.flush()
            self.db.add(RolePermission(role_id=role.id, permission_id=permission.id))
        self.db.add(UserRole(user_id=self.actor.id, role_id=role.id))
        self.db.commit()

    def test_summary_omits_modules_without_read_permission(self):
        self.grant_actor("users.read")
        other = self.add_user("other@example.com")
        self.db.add(Notification(user_id=other.id, notification_type="mention", title="Hi", body="Secret"))
        self.db.commit()

        response_status, result, _ = request(self.app, "GET", "/admin/summary")
        old_response_status, _, _ = request(self.app, "GET", "/admin/overview")

        self.assertEqual(response_status, 200)
        self.assertEqual(old_response_status, 404)
        self.assertIn("users", result)
        self.assertNotIn("projects", result)
        self.assertNotIn("notifications", result)

    def test_summary_serializes_permission_scoped_counts_activity_and_warnings(self):
        self.grant_actor(
            "users.read",
            "roles.read",
            "projects.read",
            "tasks.read",
            "audit_logs.read",
            "system_integrations.read",
        )
        backup_role = Role(
            slug="summary_super_admin",
            name="Summary super administrator",
            is_protected=True,
        )
        self.db.add(backup_role)
        self.db.flush()
        self.db.add(UserRole(user_id=self.actor.id, role_id=backup_role.id))
        disabled = self.add_user("disabled-summary@example.com", status="disabled")
        project = Project(name="Summary project", user_id=self.actor.id)
        self.db.add(project)
        self.db.flush()
        self.db.add_all(
            [
                Task(
                    title="Overdue",
                    user_id=self.actor.id,
                    project_id=project.id,
                    status="in_progress",
                    due_date=date.today() - timedelta(days=1),
                ),
                Task(
                    title="Done",
                    user_id=self.actor.id,
                    project_id=project.id,
                    status="done",
                    completed=True,
                ),
                AdminAuditLog(
                    actor_user_id=self.actor.id,
                    action="projects.create",
                    resource_type="project",
                    resource_id=str(project.id),
                    outcome="success",
                    created_at=datetime(2026, 10, 26, 12, 0, tzinfo=timezone.utc),
                ),
            ]
        )
        self.db.commit()

        with patch("src.routers.admin.operations.is_smtp_configured", return_value=False), patch.object(
            __import__("src.routers.admin.operations", fromlist=["settings"]).settings,
            "ai_api_key",
            "",
        ), patch.object(
            __import__("src.routers.admin.operations", fromlist=["settings"]).settings,
            "ai_model",
            "",
        ):
            response_status, result, _ = request(self.app, "GET", "/admin/summary")

        self.assertEqual(response_status, 200)
        self.assertEqual(
            result["users"]["status_counts"],
            {"active": 1, "disabled": 1, "deleted": 0},
        )
        self.assertEqual(result["projects"]["count"], 1)
        self.assertEqual(
            result["tasks"],
            {"count": 2, "open_count": 1, "overdue_count": 1},
        )
        self.assertEqual(result["recent_activity"][0]["actor"]["label"], "Admin User")
        self.assertEqual(result["recent_activity"][0]["action"], "projects.create")
        self.assertEqual(result["recent_activity"][0]["resource_type"], "project")
        self.assertTrue(result["recent_activity"][0]["timestamp"].startswith("2026-10-26T12:00:00"))
        warning_codes = {warning["code"] for warning in result["warnings"]}
        self.assertEqual(warning_codes, {"no_backup_super_admin", "email_unavailable", "ai_unavailable"})
        self.assertNotIn("smtp_password", json.dumps(result))
        self.assertNotIn("ai_api_key", json.dumps(result))
        self.assertNotIn("disabled-summary@example.com", json.dumps(result))

    def test_notification_detail_is_read_only_and_permission_protected(self):
        self.grant_actor("notifications.read")
        notification = Notification(
            user_id=self.actor.id,
            notification_type="mention",
            title="Keep this title",
            body="Keep this body",
            read_at=datetime(2026, 10, 26, 9, 0, tzinfo=timezone.utc),
        )
        self.db.add(notification)
        self.db.commit()

        response_status, result, _ = request(
            self.app,
            "GET",
            f"/admin/notifications/{notification.id}",
        )

        self.assertEqual(response_status, 200)
        self.assertEqual(result["title"], "Keep this title")
        self.assertEqual(result["body"], "Keep this body")
        self.assertIsNotNone(result["read_at"])
        self.db.refresh(notification)
        self.assertEqual(notification.body, "Keep this body")
        self.assertIsNotNone(notification.read_at)

    def test_audit_date_filters_are_typed_and_reject_reversed_ranges(self):
        self.grant_actor("audit_logs.read")
        older = AdminAuditLog(
            actor_user_id=self.actor.id,
            action="older",
            resource_type="user",
            resource_id="1",
            outcome="success",
            created_at=datetime(2026, 10, 1, tzinfo=timezone.utc),
        )
        newer = AdminAuditLog(
            actor_user_id=self.actor.id,
            action="newer",
            resource_type="user",
            resource_id="2",
            outcome="success",
            created_at=datetime(2026, 10, 20, tzinfo=timezone.utc),
        )
        self.db.add_all([older, newer])
        self.db.commit()

        filtered_status, records, headers = request(
            self.app,
            "GET",
            "/admin/audit-logs?start=2026-10-15T00:00:00Z&end=2026-10-25T00:00:00Z",
        )
        reversed_status, reversed_response, _ = request(
            self.app,
            "GET",
            "/admin/audit-logs?start=2026-10-25T00:00:00Z&end=2026-10-15T00:00:00Z",
        )

        self.assertEqual(filtered_status, 200)
        self.assertEqual([record["action"] for record in records], ["newer"])
        self.assertEqual(headers["x-total-count"], "1")
        self.assertEqual(reversed_status, 422)
        self.assertEqual(reversed_response["detail"]["code"], "invalid_date_range")

    def test_csv_export_escapes_formula_values(self):
        self.grant_actor("reports.export")
        project = Project(name="+unsafe-project", user_id=self.actor.id)
        self.db.add(project)
        self.db.flush()
        self.db.add(
            Task(
                title="=SUM(1,1)",
                description="@command",
                user_id=self.actor.id,
                project_id=project.id,
            )
        )
        self.db.commit()

        response_status, csv_body, _ = request(self.app, "GET", "/admin/reports/tasks.csv")

        self.assertEqual(response_status, 200)
        self.assertIn("'=SUM(1,1)", csv_body)
        self.assertIn("'@command", csv_body)

    def test_ai_report_serialization_uses_safe_csv_values_without_live_provider(self):
        self.grant_actor("reports.generate")
        project = Project(name="Report project", user_id=self.actor.id)
        self.db.add(project)
        self.db.flush()
        task = Task(title="Report task", user_id=self.actor.id, project_id=project.id)
        self.db.add(task)
        self.db.commit()

        with patch(
            "src.routers.admin.operations.create_json_completion",
            return_value={"summary": "=unsafe summary", "insights": {str(task.id): "+unsafe insight"}},
        ) as completion:
            response_status, csv_body, _ = request(
                self.app,
                "POST",
                f"/admin/reports/projects/{project.id}/task-report.csv",
            )

        self.assertEqual(response_status, 200)
        completion.assert_called_once()
        self.assertIn("'=unsafe summary", csv_body)
        self.assertIn("'+unsafe insight", csv_body)

    def test_health_returns_flags_not_secret_values(self):
        from src.routers.admin.operations import get_integration_health

        result = get_integration_health(actor=self.actor, db=self.db)

        self.assertEqual(set(result), {"email_configured", "ai_configured"})
        self.assertTrue(all(isinstance(value, bool) for value in result.values()))

    def test_audit_metadata_rejects_sensitive_keys(self):
        audit_admin_action(
            self.db,
            actor_user_id=self.actor.id,
            action="test",
            resource_type="test",
            resource_id=1,
            metadata={"password": "secret", "authorization": "Bearer x", "task_count": 2},
        )
        self.db.commit()

        audit = self.db.query(AdminAuditLog).one()
        self.assertEqual(audit.metadata_json, {"task_count": 2})

    def test_global_notifications_are_filterable_and_deletion_is_audited_without_content(self):
        self.grant_actor("notifications.read", "notifications.delete")
        recipient = self.add_user("recipient@example.com")
        self.db.add_all(
            [
                Notification(
                    user_id=recipient.id,
                    notification_type="mention",
                    title="Private title",
                    body="Private body",
                ),
                Notification(
                    user_id=recipient.id,
                    notification_type="assignment",
                    title="Other",
                    body="Other body",
                    read_at=None,
                ),
            ]
        )
        self.db.commit()
        notification = self.db.query(Notification).first()

        list_status, notifications, headers = request(
            self.app,
            "GET",
            f"/admin/notifications?user_id={recipient.id}&notification_type=mention&page_size=1",
        )
        delete_status, deleted, _ = request(
            self.app,
            "DELETE",
            f"/admin/notifications/{notification.id}",
        )

        self.assertEqual(list_status, 200)
        self.assertEqual(len(notifications), 1)
        self.assertEqual(headers["x-total-count"], "1")
        self.assertEqual(delete_status, 204)
        self.assertIsNone(deleted)
        audit = self.db.query(AdminAuditLog).one()
        self.assertEqual(audit.action, "notifications.delete")
        self.assertNotIn("title", audit.metadata_json)
        self.assertNotIn("body", audit.metadata_json)

    def test_preferences_are_admin_scoped_and_mutable_with_exact_permissions(self):
        target = self.add_user("target@example.com")
        self.grant_actor("notification_preferences.read", "notification_preferences.update")

        read_status, preferences, _ = request(
            self.app,
            "GET",
            f"/admin/users/{target.id}/notification-preferences",
        )
        update_status, updated, _ = request(
            self.app,
            "PUT",
            f"/admin/users/{target.id}/notification-preferences",
            json_body={"assignment_notifications": False, "reminder_days_before": 3},
        )

        self.assertEqual(read_status, 200)
        self.assertTrue(preferences["assignment_notifications"])
        self.assertEqual(update_status, 200)
        self.assertFalse(updated["assignment_notifications"])
        self.assertEqual(updated["reminder_days_before"], 3)
        self.assertEqual(self.db.query(AdminAuditLog).one().action, "notification_preferences.update")

    def test_admin_audit_reads_are_filterable_and_deleted_actors_are_neutral(self):
        self.grant_actor("audit_logs.read")
        deleted = self.add_user("deleted@example.com", status="deleted", first_name=None, last_name=None)
        audit_admin_action(
            self.db,
            actor_user_id=deleted.id,
            action="users.delete",
            resource_type="user",
            resource_id=deleted.id,
            metadata={"status": "deleted"},
        )
        self.db.commit()

        list_status, records, headers = request(
            self.app,
            "GET",
            "/admin/audit-logs?action=users.delete&page_size=1",
        )
        detail_status, detail, _ = request(
            self.app,
            "GET",
            f"/admin/audit-logs/{records[0]['id']}",
        )

        self.assertEqual((list_status, detail_status), (200, 200))
        self.assertEqual(headers["x-total-count"], "1")
        self.assertEqual(records[0]["actor"]["label"], "Deleted user")
        self.assertEqual(detail["metadata"], {"status": "deleted"})

    def test_report_routes_require_exact_permissions_and_do_not_add_notification_mutations(self):
        self.grant_actor("users.read")
        notification_methods = {
            method
            for route in __import__("src.routers.admin.operations", fromlist=["router"]).router.routes
            if getattr(route, "path", None) == "/notifications/{notification_id}"
            for method in route.methods
        }

        export_status, export_response, _ = request(self.app, "GET", "/admin/reports/tasks.csv")
        generate_status, generate_response, _ = request(
            self.app,
            "POST",
            "/admin/reports/projects/1/task-report.csv",
        )

        self.assertEqual(notification_methods, {"GET", "DELETE"})
        self.assertEqual(export_status, 403)
        self.assertEqual(generate_status, 403)
        self.assertEqual(export_response["detail"]["code"], "permission_denied")
        self.assertEqual(generate_response["detail"]["code"], "permission_denied")


if __name__ == "__main__":
    unittest.main()
