import asyncio
import json
import os
import unittest
from datetime import datetime, timezone
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Query, sessionmaker
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
    Permission,
    Project,
    ProjectMember,
    Role,
    RolePermission,
    Subtask,
    Task,
    TaskActivity,
    TaskComment,
    User,
    UserRole,
)
from src.routers.admin import router as admin_router
from src.routers.project import router as project_router
from src.routers.task import get_project_assignee, router as task_router, update_task
from src.routers.user import router as user_router
from src.schemas import TaskCreate
from src.schemas.admin import AdminUserCreate
from src.security import auth
from src.services.admin import anonymize_user, create_admin_user


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
    return start["status"], json.loads(response_body or b"null"), response_headers


class RecordingQuery(Query):
    def with_for_update(self, *args, **kwargs):
        self.session.info["row_locks"] = self.session.info.get("row_locks", 0) + 1
        return super().with_for_update(*args, **kwargs)


class AdminUserTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite+pysqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, query_cls=RecordingQuery)
        self.db = self.Session()
        self.actor = self.add_user("admin@example.com", first_name="Admin", last_name="User")

        app = FastAPI()
        app.include_router(admin_router)
        app.include_router(user_router)
        app.include_router(project_router)
        app.include_router(task_router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[auth.get_current_user] = lambda: self.actor
        self.app = app

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def add_user(self, email, **values):
        user = User(
            email=email,
            password=values.pop("password", "stored-hash"),
            status=values.pop("status", "active"),
            must_change_password=values.pop("must_change_password", False),
            **values,
        )
        self.db.add(user)
        self.db.commit()
        return user

    def add_permission(self, key):
        module, action = key.split(".", 1)
        permission = Permission(
            key=key,
            module=module,
            action=action,
            description=key,
            is_protected=True,
        )
        self.db.add(permission)
        self.db.commit()
        return permission

    def add_role(self, slug, permission_keys=(), *, protected=False):
        role = Role(
            slug=slug,
            name=slug.replace("_", " ").title(),
            is_system=protected,
            is_protected=protected,
        )
        self.db.add(role)
        self.db.flush()
        for key in permission_keys:
            permission = self.db.query(Permission).filter(Permission.key == key).one()
            self.db.add(RolePermission(role_id=role.id, permission_id=permission.id))
        self.db.commit()
        return role

    def assign(self, user, role):
        self.db.add(
            UserRole(
                user_id=user.id,
                role_id=role.id,
                assigned_by_user_id=self.actor.id,
            )
        )
        self.db.commit()

    def grant_actor(self, *permission_keys, protected=False):
        for key in permission_keys:
            if self.db.query(Permission).filter(Permission.key == key).first() is None:
                self.add_permission(key)
        role = self.add_role(
            f"actor_role_{self.db.query(Role).count()}",
            permission_keys,
            protected=protected,
        )
        self.assign(self.actor, role)
        return role

    def assert_conflict(self, error, code):
        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(error.exception.detail["code"], code)

    def test_create_hashes_temp_password_normalizes_email_and_requires_change(self):
        created = create_admin_user(
            AdminUserCreate(
                email=" New.User@Example.COM ",
                first_name=" New ",
                last_name=" User ",
                temp_password="temporary-123",
            ),
            self.db,
            self.actor,
        )

        self.assertEqual(created.email, "new.user@example.com")
        self.assertEqual((created.first_name, created.last_name), ("New", "User"))
        self.assertNotEqual(created.password, "temporary-123")
        self.assertTrue(auth.verify_password("temporary-123", created.password))
        self.assertTrue(created.must_change_password)
        self.assertEqual(created.status, "active")
        audit = self.db.query(AdminAuditLog).one()
        self.assertEqual(audit.action, "users.create")
        self.assertNotIn("password", audit.metadata_json)

    def test_create_route_never_returns_password_material(self):
        self.grant_actor("users.create")

        response_status, response, _ = request(
            self.app,
            "POST",
            "/admin/users",
            json_body={
                "email": "created@example.com",
                "first_name": "Created",
                "last_name": "User",
                "temp_password": "temporary-123",
                "role_ids": [],
            },
        )

        self.assertEqual(response_status, 201)
        for forbidden in (
            "password",
            "temp_password",
            "password_reset_otp_hash",
            "password_reset_otp_expires_at",
            "google_sub",
            "token",
        ):
            self.assertNotIn(forbidden, response)
        self.assertEqual(response["has_password"], True)
        self.assertEqual(response["google_linked"], False)

    def test_create_rejects_duplicate_normalized_email(self):
        self.add_user("duplicate@example.com")

        with self.assertRaises(HTTPException) as error:
            create_admin_user(
                AdminUserCreate(
                    email=" DUPLICATE@EXAMPLE.COM ",
                    first_name="Duplicate",
                    last_name="User",
                    temp_password="temporary-123",
                ),
                self.db,
                self.actor,
            )

        self.assert_conflict(error, "email_in_use")
        self.assertEqual(self.db.query(User).filter(User.email == "duplicate@example.com").count(), 1)
        self.assertEqual(self.db.query(AdminAuditLog).count(), 0)

    def test_admin_user_list_filters_sorts_paginates_and_returns_safe_fields(self):
        self.grant_actor("users.read")
        role = self.add_role("support")
        first = self.add_user(
            "zulu@example.com",
            first_name="Zulu",
            last_name="Complete",
            google_sub="google-zulu",
        )
        second = self.add_user(
            "alpha@example.com",
            first_name="Alpha",
            last_name="Complete",
            google_sub="google-alpha",
        )
        self.add_user("incomplete@example.com", first_name=None, last_name=None)
        self.assign(first, role)
        self.assign(second, role)

        status, users, headers = request(
            self.app,
            "GET",
            f"/admin/users?search=example&status=active&role_id={role.id}"
            "&provider=google&profile_complete=true&sort_by=email&sort_order=asc"
            "&page=1&page_size=1",
        )

        self.assertEqual(status, 200)
        self.assertEqual([user["email"] for user in users], ["alpha@example.com"])
        self.assertEqual(headers["x-total-count"], "2")
        self.assertEqual(headers["x-page"], "1")
        self.assertEqual(headers["x-page-size"], "1")
        self.assertEqual(headers["x-total-pages"], "2")
        forbidden = {
            "password",
            "must_change_password",
            "password_reset_otp_hash",
            "google_sub",
            "auth_version",
            "token",
        }
        self.assertTrue(forbidden.isdisjoint(users[0]))

    def test_detail_omits_cross_module_aggregates_without_matching_permissions(self):
        self.grant_actor("users.read")
        target = self.add_user("target@example.com", first_name="Target", last_name="User")
        project = Project(name="Owned", user_id=target.id)
        self.db.add(project)
        self.db.flush()
        self.db.add(ProjectMember(project_id=project.id, user_id=target.id))
        self.db.add(Task(title="Created", user_id=target.id, assignee_user_id=target.id))
        self.db.commit()

        status, response, _ = request(self.app, "GET", f"/admin/users/{target.id}")

        self.assertEqual(status, 200)
        self.assertNotIn("owned_projects", response)
        self.assertNotIn("project_memberships", response)
        self.assertNotIn("task_activity", response)

    def test_detail_returns_only_each_permitted_cross_module_aggregate(self):
        self.grant_actor("users.read", "projects.read", "tasks.read")
        target = self.add_user("target@example.com", first_name="Target", last_name="User")
        project = Project(name="Owned", user_id=target.id)
        self.db.add(project)
        self.db.flush()
        self.db.add(ProjectMember(project_id=project.id, user_id=target.id))
        self.db.add(Task(title="Created", user_id=target.id, assignee_user_id=target.id))
        self.db.commit()

        status, response, _ = request(self.app, "GET", f"/admin/users/{target.id}")

        self.assertEqual(status, 200)
        self.assertEqual(response["owned_projects"], {"count": 1})
        self.assertNotIn("project_memberships", response)
        self.assertEqual(
            response["task_activity"],
            {"created_count": 1, "assigned_count": 1},
        )

    def test_update_email_or_status_revokes_sessions_but_name_only_does_not(self):
        self.grant_actor("users.update")
        target = self.add_user(
            "target@example.com",
            first_name="Before",
            last_name="User",
            auth_version=4,
            password_reset_otp_hash="reset-hash",
            password_reset_attempts=2,
        )

        name_status, _, _ = request(
            self.app,
            "PATCH",
            f"/admin/users/{target.id}",
            json_body={"first_name": "After"},
        )
        email_status, _, _ = request(
            self.app,
            "PATCH",
            f"/admin/users/{target.id}",
            json_body={"email": " Renamed@Example.com "},
        )
        status_status, _, _ = request(
            self.app,
            "PATCH",
            f"/admin/users/{target.id}",
            json_body={"status": "disabled"},
        )

        self.db.refresh(target)
        self.assertEqual((name_status, email_status, status_status), (200, 200, 200))
        self.assertEqual(target.email, "renamed@example.com")
        self.assertEqual(target.status, "disabled")
        self.assertEqual(target.auth_version, 6)
        self.assertIsNone(target.password_reset_otp_hash)
        self.assertEqual(target.password_reset_attempts, 0)

    def test_self_deactivate_delete_and_role_replacement_have_stable_conflicts(self):
        for key in ("users.update", "users.delete", "users.assign_roles"):
            self.add_permission(key)
        role = self.add_role(
            "user_manager",
            ("users.update", "users.delete", "users.assign_roles"),
        )
        self.assign(self.actor, role)

        operations = (
            ("PATCH", f"/admin/users/{self.actor.id}", {"status": "disabled"}, "self_deactivation"),
            ("DELETE", f"/admin/users/{self.actor.id}", None, "self_deletion"),
            ("PUT", f"/admin/users/{self.actor.id}/roles", {"role_ids": [role.id]}, "self_role_replacement"),
        )
        for method, path, body, code in operations:
            with self.subTest(code=code):
                status, response, _ = request(self.app, method, path, json_body=body)
                self.assertEqual(status, 409)
                self.assertEqual(response["detail"]["code"], code)

        self.db.refresh(self.actor)
        self.assertEqual(self.actor.status, "active")
        self.assertEqual(self.db.query(UserRole).filter(UserRole.user_id == self.actor.id).count(), 1)

    def test_role_replacement_is_atomic_revokes_sessions_and_allows_disabled_users(self):
        self.add_permission("users.assign_roles")
        self.add_permission("users.read")
        actor_role = self.add_role("role_manager", ("users.assign_roles", "users.read"))
        assignable = self.add_role("reader", ("users.read",))
        self.assign(self.actor, actor_role)
        target = self.add_user("disabled@example.com", status="disabled", auth_version=2)

        status, response, _ = request(
            self.app,
            "PUT",
            f"/admin/users/{target.id}/roles",
            json_body={"role_ids": [assignable.id]},
        )

        self.db.refresh(target)
        self.assertEqual(status, 200)
        self.assertEqual([role["id"] for role in response["roles"]], [assignable.id])
        self.assertEqual(target.auth_version, 3)
        self.assertEqual(
            self.db.query(UserRole).filter(UserRole.user_id == target.id).count(),
            1,
        )
        self.assertEqual(self.db.query(AdminAuditLog).filter(AdminAuditLog.action == "users.assign_roles").count(), 1)

    def test_project_member_picker_excludes_inactive_users(self):
        project = Project(name="Active candidates", user_id=self.actor.id)
        active = self.add_user("active@example.com")
        self.add_user("disabled@example.com", status="disabled")
        self.add_user("deleted@example.com", status="deleted")
        self.db.add(project)
        self.db.commit()

        response_status, users, _ = request(
            self.app,
            "GET",
            f"/projects/{project.id}/available-users",
        )

        self.assertEqual(response_status, 200)
        self.assertEqual([user["id"] for user in users], [active.id])

    def test_inactive_users_cannot_be_added_as_project_members(self):
        project = Project(name="Protected assignments", user_id=self.actor.id)
        self.db.add(project)
        self.db.commit()

        for user_status in ("disabled", "deleted"):
            with self.subTest(status=user_status):
                target = self.add_user(
                    f"{user_status}@example.com",
                    status=user_status,
                )

                response_status, _, _ = request(
                    self.app,
                    "POST",
                    f"/projects/{project.id}/members",
                    json_body={"user_id": target.id},
                )

                self.assertEqual(response_status, 404)
                self.assertEqual(
                    self.db.query(ProjectMember)
                    .filter(ProjectMember.user_id == target.id)
                    .count(),
                    0,
                )

    def test_project_membership_assignment_locks_active_target(self):
        project = Project(name="Locked membership", user_id=self.actor.id)
        target = self.add_user("locked-member@example.com")
        self.db.add(project)
        self.db.commit()
        previous_locks = self.db.info.get("row_locks", 0)

        response_status, _, _ = request(
            self.app,
            "POST",
            f"/projects/{project.id}/members",
            json_body={"user_id": target.id},
        )

        self.assertEqual(response_status, 201)
        self.assertGreater(self.db.info.get("row_locks", 0), previous_locks)

    def test_inactive_project_users_cannot_receive_task_assignments(self):
        project = Project(name="Task assignments", user_id=self.actor.id)
        self.db.add(project)
        self.db.flush()

        for user_status in ("disabled", "deleted"):
            with self.subTest(status=user_status):
                target = self.add_user(
                    f"task-{user_status}@example.com",
                    status=user_status,
                )
                self.db.add(ProjectMember(project_id=project.id, user_id=target.id))
                self.db.commit()

                with self.assertRaises(HTTPException) as error:
                    get_project_assignee(project, target.id, self.db)

                self.assertEqual(error.exception.status_code, 422)

    def test_task_assignment_validation_locks_active_target(self):
        project = Project(name="Locked task assignment", user_id=self.actor.id)
        target = self.add_user("locked-assignee@example.com")
        self.db.add(project)
        self.db.flush()
        self.db.add(ProjectMember(project_id=project.id, user_id=target.id))
        self.db.commit()
        previous_locks = self.db.info.get("row_locks", 0)

        assignee = get_project_assignee(project, target.id, self.db)

        self.assertEqual(assignee.id, target.id)
        self.assertGreater(self.db.info.get("row_locks", 0), previous_locks)

    def test_unrelated_task_update_preserves_existing_disabled_assignee(self):
        project = Project(name="Existing assignment", user_id=self.actor.id)
        target = self.add_user("existing-disabled@example.com", status="disabled")
        self.db.add(project)
        self.db.flush()
        self.db.add(ProjectMember(project_id=project.id, user_id=target.id))
        task = Task(
            title="Before",
            user_id=self.actor.id,
            updated_by_user_id=self.actor.id,
            project_id=project.id,
            assignee_user_id=target.id,
        )
        self.db.add(task)
        self.db.commit()

        try:
            response = update_task(
                task.id,
                TaskCreate(title="After", project_id=project.id),
                self.db,
                self.actor,
            )
        except HTTPException as error:
            self.fail(f"Unrelated update rejected: {error.detail}")

        self.db.refresh(task)
        self.assertEqual(response["title"], "After")
        self.assertEqual(task.assignee_user_id, target.id)

    def test_subtask_route_allows_unchanged_disabled_assignee_but_rejects_new_one(self):
        project = Project(name="Historical subtask assignment", user_id=self.actor.id)
        historical = self.add_user("historical-disabled@example.com", status="disabled")
        replacement = self.add_user("replacement-disabled@example.com", status="disabled")
        self.db.add(project)
        self.db.flush()
        self.db.add_all(
            [
                ProjectMember(project_id=project.id, user_id=historical.id),
                ProjectMember(project_id=project.id, user_id=replacement.id),
            ]
        )
        task = Task(
            title="Parent",
            user_id=self.actor.id,
            updated_by_user_id=self.actor.id,
            project_id=project.id,
        )
        self.db.add(task)
        self.db.flush()
        subtask = Subtask(
            task_id=task.id,
            title="Before",
            assignee_user_id=historical.id,
        )
        self.db.add(subtask)
        self.db.commit()

        update_status, updated, _ = request(
            self.app,
            "PATCH",
            f"/tasks/{task.id}/subtasks/{subtask.id}",
            json_body={
                "title": "After",
                "completed": True,
                "due_date": "2026-11-01",
                "assignee_user_id": historical.id,
            },
        )
        rejected_status, rejected, _ = request(
            self.app,
            "PATCH",
            f"/tasks/{task.id}/subtasks/{subtask.id}",
            json_body={"assignee_user_id": replacement.id},
        )

        self.assertEqual(update_status, 200)
        self.assertEqual(updated["title"], "After")
        self.assertTrue(updated["completed"])
        self.assertEqual(updated["due_date"], "2026-11-01")
        self.assertEqual(updated["assignee_user_id"], historical.id)
        self.assertEqual(rejected_status, 422)
        self.assertEqual(
            rejected["detail"],
            "Assignee must be the project owner or a project member",
        )

    def test_role_replacement_updates_only_the_changed_assignments(self):
        self.add_permission("users.assign_roles")
        actor_role = self.add_role("role_manager", ("users.assign_roles",))
        retained = self.add_role("retained")
        removed = self.add_role("removed")
        added = self.add_role("added")
        self.assign(self.actor, actor_role)
        target = self.add_user("target@example.com", auth_version=3)
        original_assigner = self.add_user("original-assigner@example.com")
        retained_assignment = UserRole(
            user_id=target.id,
            role_id=retained.id,
            assigned_by_user_id=original_assigner.id,
            assigned_at=datetime(2025, 1, 2, tzinfo=timezone.utc),
        )
        self.db.add_all(
            [
                retained_assignment,
                UserRole(
                    user_id=target.id,
                    role_id=removed.id,
                    assigned_by_user_id=original_assigner.id,
                ),
            ]
        )
        self.db.commit()
        original_assigned_at = retained_assignment.assigned_at

        status, response, _ = request(
            self.app,
            "PUT",
            f"/admin/users/{target.id}/roles",
            json_body={"role_ids": [retained.id, added.id]},
        )

        self.db.refresh(target)
        self.assertEqual(status, 200)
        self.assertEqual(
            {role["id"] for role in response["roles"]},
            {retained.id, added.id},
        )
        self.assertEqual(target.auth_version, 4)
        persisted_retained = (
            self.db.query(UserRole)
            .filter(
                UserRole.user_id == target.id,
                UserRole.role_id == retained.id,
            )
            .one()
        )
        self.assertIs(persisted_retained, retained_assignment)
        self.assertEqual(
            persisted_retained.assigned_by_user_id,
            original_assigner.id,
        )
        self.assertEqual(persisted_retained.assigned_at, original_assigned_at)

    def test_non_super_admin_cannot_assign_role_with_permissions_they_do_not_hold(self):
        self.add_permission("users.assign_roles")
        self.add_permission("users.delete")
        actor_role = self.add_role("role_manager", ("users.assign_roles",))
        overreach = self.add_role("deleter", ("users.delete",))
        self.assign(self.actor, actor_role)
        target = self.add_user("target@example.com", auth_version=5)

        status, response, _ = request(
            self.app,
            "PUT",
            f"/admin/users/{target.id}/roles",
            json_body={"role_ids": [overreach.id]},
        )

        self.db.refresh(target)
        self.assertEqual(status, 403)
        self.assertEqual(response["detail"]["code"], "role_assignment_forbidden")
        self.assertEqual(target.auth_version, 5)
        self.assertEqual(self.db.query(UserRole).filter(UserRole.user_id == target.id).count(), 0)

    def test_final_active_super_admin_cannot_be_disabled_deleted_or_stripped(self):
        for key in ("users.update", "users.delete", "users.assign_roles"):
            self.add_permission(key)
        manager = self.add_role(
            "manager",
            ("users.update", "users.delete", "users.assign_roles"),
        )
        protected = self.add_role("super_admin", protected=True)
        replacement = self.add_role("replacement")
        self.assign(self.actor, manager)
        target = self.add_user("super@example.com")
        self.assign(target, protected)

        operations = (
            ("PATCH", f"/admin/users/{target.id}", {"status": "disabled"}),
            ("DELETE", f"/admin/users/{target.id}", None),
            ("PUT", f"/admin/users/{target.id}/roles", {"role_ids": [replacement.id]}),
        )
        for method, path, body in operations:
            with self.subTest(method=method):
                status, response, _ = request(self.app, method, path, json_body=body)
                self.assertEqual(status, 409)
                self.assertEqual(response["detail"]["code"], "final_super_admin")

        self.db.refresh(target)
        self.assertEqual(target.status, "active")
        self.assertEqual(
            self.db.query(UserRole).filter(
                UserRole.user_id == target.id,
                UserRole.role_id == protected.id,
            ).count(),
            1,
        )
        self.assertGreaterEqual(self.db.info.get("row_locks", 0), 6)

    def test_session_revocation_increments_auth_version_and_audits(self):
        self.grant_actor("users.revoke_sessions")
        target = self.add_user("target@example.com", auth_version=7)

        status, response, _ = request(
            self.app,
            "POST",
            f"/admin/users/{target.id}/revoke-sessions",
        )

        self.db.refresh(target)
        self.assertEqual(status, 200)
        self.assertEqual(target.auth_version, 8)
        self.assertNotIn("auth_version", response)
        self.assertEqual(self.db.query(AdminAuditLog).filter(AdminAuditLog.action == "users.revoke_sessions").count(), 1)

    def test_anonymize_clears_pii_and_access_but_preserves_user_and_history(self):
        target = self.add_user(
            "target@example.com",
            password="password-hash",
            google_sub="google-subject",
            first_name="Target",
            last_name="User",
            auth_version=3,
            must_change_password=True,
            password_reset_otp_hash="otp-hash",
            password_reset_otp_expires_at=datetime.now(timezone.utc),
            password_reset_requested_at=datetime.now(timezone.utc),
            password_reset_attempts=4,
        )
        role = self.add_role("member")
        self.assign(target, role)
        project = Project(name="Other owner", user_id=self.actor.id)
        self.db.add(project)
        self.db.flush()
        self.db.add(ProjectMember(project_id=project.id, user_id=target.id))
        task = Task(title="Historical task", user_id=target.id, assignee_user_id=target.id)
        self.db.add(task)
        self.db.flush()
        comment = TaskComment(task_id=task.id, user_id=target.id, body="Historical comment")
        activity = TaskActivity(
            task_id=task.id,
            actor_user_id=target.id,
            event_type="task_created",
        )
        old_audit = AdminAuditLog(
            actor_user_id=target.id,
            action="historical",
            resource_type="task",
            resource_id=str(task.id),
            target_user_id=target.id,
            metadata_json={},
            outcome="success",
        )
        self.db.add_all([comment, activity, old_audit])
        self.db.commit()
        user_id = target.id

        anonymized = anonymize_user(target, self.db, self.actor)

        self.assertEqual(anonymized.id, user_id)
        self.assertEqual(anonymized.status, "deleted")
        self.assertTrue(anonymized.email.startswith(f"deleted-{user_id}-"))
        self.assertTrue(anonymized.email.endswith("@deleted.invalid"))
        for field in (
            "password",
            "google_sub",
            "first_name",
            "last_name",
            "password_reset_otp_hash",
            "password_reset_otp_expires_at",
            "password_reset_requested_at",
        ):
            self.assertIsNone(getattr(anonymized, field))
        self.assertEqual(anonymized.password_reset_attempts, 0)
        self.assertFalse(anonymized.must_change_password)
        self.assertEqual(anonymized.auth_version, 4)
        self.assertIsNotNone(anonymized.deleted_at)
        self.assertEqual(self.db.query(UserRole).filter(UserRole.user_id == user_id).count(), 0)
        self.assertEqual(self.db.query(ProjectMember).filter(ProjectMember.user_id == user_id).count(), 0)
        self.assertEqual(self.db.query(Task).filter(Task.user_id == user_id).count(), 1)
        self.assertEqual(self.db.query(TaskComment).filter(TaskComment.user_id == user_id).count(), 1)
        self.assertEqual(self.db.query(TaskActivity).filter(TaskActivity.actor_user_id == user_id).count(), 1)
        self.assertEqual(self.db.query(AdminAuditLog).filter(AdminAuditLog.actor_user_id == user_id).count(), 1)
        deletion_audit = self.db.query(AdminAuditLog).filter(AdminAuditLog.action == "users.delete").one()
        self.assertEqual(deletion_audit.target_user_id, user_id)
        self.assertNotIn("email", deletion_audit.metadata_json)
        self.assertNotIn("name", deletion_audit.metadata_json)

    def test_anonymize_owned_project_returns_conflict_without_mutation(self):
        target = self.add_user(
            "owner@example.com",
            first_name="Project",
            last_name="Owner",
            auth_version=2,
        )
        self.db.add(Project(name="Owned project", user_id=target.id))
        self.db.commit()

        with self.assertRaises(HTTPException) as error:
            anonymize_user(target, self.db, self.actor)

        self.assert_conflict(error, "owned_projects_exist")
        self.db.refresh(target)
        self.assertEqual(target.email, "owner@example.com")
        self.assertEqual(target.status, "active")
        self.assertEqual(target.auth_version, 2)
        self.assertEqual(self.db.query(AdminAuditLog).count(), 0)

    def test_deleted_users_serialize_neutrally_without_tombstone_address(self):
        self.grant_actor("users.read", "users.delete")
        target = self.add_user("target@example.com", first_name="Target", last_name="User")

        delete_status, deleted, _ = request(self.app, "DELETE", f"/admin/users/{target.id}")
        detail_status, detail, _ = request(self.app, "GET", f"/admin/users/{target.id}")

        self.assertEqual((delete_status, detail_status), (200, 200))
        self.assertIsNone(deleted["email"])
        self.assertIsNone(detail.get("email"))
        self.assertNotIn("deleted.invalid", json.dumps(deleted))
        self.assertNotIn("deleted.invalid", json.dumps(detail))

    def test_existing_global_user_list_requires_exact_users_read(self):
        denied_status, denied, _ = request(self.app, "GET", "/users/")
        self.grant_actor("users.read")
        allowed_status, allowed, _ = request(self.app, "GET", "/users/")

        self.assertEqual(denied_status, 403)
        self.assertEqual(denied["detail"]["code"], "permission_denied")
        self.assertEqual(allowed_status, 200)
        self.assertEqual(allowed[0]["email"], self.actor.email)
        self.assertTrue(
            any(
                getattr(route, "path", None) == "/projects/{project_id}/available-users"
                for route in project_router.routes
            )
        )

    def test_admin_user_routes_require_their_exact_permissions(self):
        target = self.add_user("target@example.com")
        operations = (
            ("GET", "/admin/users", None),
            ("POST", "/admin/users", {
                "email": "created@example.com",
                "first_name": "Created",
                "last_name": "User",
                "temp_password": "temporary-123",
            }),
            ("PATCH", f"/admin/users/{target.id}", {"first_name": "Changed"}),
            ("PUT", f"/admin/users/{target.id}/roles", {"role_ids": []}),
            ("POST", f"/admin/users/{target.id}/revoke-sessions", None),
            ("DELETE", f"/admin/users/{target.id}", None),
        )

        for method, path, body in operations:
            with self.subTest(method=method, path=path):
                status, response, _ = request(self.app, method, path, json_body=body)
                self.assertEqual(status, 403)
                self.assertEqual(response["detail"]["code"], "permission_denied")


if __name__ == "__main__":
    unittest.main()
