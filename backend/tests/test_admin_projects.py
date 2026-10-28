import asyncio
import json
import os
import unittest
from urllib.parse import urlsplit

from fastapi import FastAPI
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
    Task,
    User,
    UserRole,
)
from src.routers.admin import router as admin_router
from src.routers.project import router as project_router
from src.schemas.admin import AdminProjectMemberResponse
from src.security import auth


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


class AdminProjectTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite+pysqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, query_cls=RecordingQuery)
        self.db = self.Session()
        self.actor = self.add_user("admin@example.com")

        app = FastAPI()
        app.include_router(admin_router)
        app.include_router(project_router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[auth.get_current_user] = lambda: self.actor
        self.app = app

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def add_user(self, email, *, status="active"):
        user = User(
            email=email,
            password="stored-hash",
            first_name="Test",
            last_name="User",
            status=status,
            must_change_password=False,
        )
        self.db.add(user)
        self.db.commit()
        return user

    def grant_actor(self, *permission_keys):
        role = Role(
            slug=f"project_role_{self.db.query(Role).count()}",
            name="Project administrator",
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

    def add_project(self, name, owner=None, description=None):
        project = Project(
            name=name,
            description=description,
            user_id=(owner or self.actor).id,
        )
        self.db.add(project)
        self.db.commit()
        return project

    def test_create_requires_explicit_locked_active_owner_and_audits(self):
        self.grant_actor("projects.create")
        active = self.add_user("owner@example.com")
        disabled = self.add_user("disabled@example.com", status="disabled")

        missing_status, _, _ = request(
            self.app,
            "POST",
            "/admin/projects",
            json_body={"name": "Missing owner"},
        )
        disabled_status, disabled_response, _ = request(
            self.app,
            "POST",
            "/admin/projects",
            json_body={"name": "Disabled owner", "owner_id": disabled.id},
        )
        previous_locks = self.db.info.get("row_locks", 0)
        created_status, created, _ = request(
            self.app,
            "POST",
            "/admin/projects",
            json_body={
                "name": "Administrative project",
                "description": " Safe description ",
                "owner_id": active.id,
            },
        )

        self.assertEqual(missing_status, 422)
        self.assertEqual(disabled_status, 422)
        self.assertEqual(disabled_response["detail"]["code"], "active_owner_required")
        self.assertEqual(created_status, 201)
        self.assertEqual(created["owner_id"], active.id)
        self.assertEqual(created["description"], "Safe description")
        self.assertNotIn("email", created)
        self.assertGreater(self.db.info.get("row_locks", 0), previous_locks)
        project = self.db.query(Project).filter(Project.id == created["id"]).one()
        self.assertEqual(project.user_id, active.id)
        audit = self.db.query(AdminAuditLog).one()
        self.assertEqual(audit.action, "projects.create")
        self.assertEqual(audit.target_user_id, active.id)
        self.assertNotIn("email", audit.metadata_json)

    def test_duplicate_project_names_return_stable_conflicts_without_audit(self):
        self.grant_actor("projects.create", "projects.update")
        first = self.add_project("Globally unique")
        second = self.add_project("Second")

        create_status, create_response, _ = request(
            self.app,
            "POST",
            "/admin/projects",
            json_body={"name": first.name, "owner_id": self.actor.id},
        )
        update_status, update_response, _ = request(
            self.app,
            "PATCH",
            f"/admin/projects/{second.id}",
            json_body={"name": first.name},
        )

        self.assertEqual((create_status, update_status), (409, 409))
        self.assertEqual(create_response["detail"]["code"], "project_name_in_use")
        self.assertEqual(update_response["detail"]["code"], "project_name_in_use")
        self.db.refresh(second)
        self.assertEqual(second.name, "Second")
        self.assertEqual(self.db.query(AdminAuditLog).count(), 0)

    def test_project_reads_filter_sort_paginate_and_return_safe_contracts(self):
        self.grant_actor("projects.read")
        owner = self.add_user("owner@example.com")
        self.add_project("Zulu", owner)
        alpha = self.add_project("Alpha match", owner, "Visible")
        self.add_project("Other match")

        list_status, projects, headers = request(
            self.app,
            "GET",
            f"/admin/projects?search=match&owner_id={owner.id}"
            "&sort_by=name&sort_order=asc&page=1&page_size=1",
        )
        detail_status, detail, _ = request(
            self.app,
            "GET",
            f"/admin/projects/{alpha.id}",
        )

        self.assertEqual((list_status, detail_status), (200, 200))
        self.assertEqual([project["name"] for project in projects], ["Alpha match"])
        self.assertEqual(headers["x-total-count"], "1")
        self.assertEqual(headers["x-page"], "1")
        self.assertEqual(headers["x-page-size"], "1")
        self.assertEqual(headers["x-total-pages"], "1")
        self.assertEqual(detail["owner_id"], owner.id)
        self.assertEqual(
            set(detail),
            {"id", "name", "description", "owner_id", "created_at", "updated_at"},
        )

    def test_update_changes_only_requested_fields_and_audits(self):
        self.grant_actor("projects.update")
        project = self.add_project("Before", description="Keep")

        response_status, response, _ = request(
            self.app,
            "PATCH",
            f"/admin/projects/{project.id}",
            json_body={"name": " After "},
        )

        self.assertEqual(response_status, 200)
        self.assertEqual(response["name"], "After")
        self.assertEqual(response["description"], "Keep")
        audit = self.db.query(AdminAuditLog).one()
        self.assertEqual(audit.action, "projects.update")
        self.assertEqual(
            audit.metadata_json,
            {"name_changed": True, "description_changed": False},
        )

    def test_transfer_atomically_replaces_owner_and_normalizes_memberships(self):
        self.grant_actor("projects.transfer")
        old_owner = self.add_user("old-owner@example.com")
        new_owner = self.add_user("new-owner@example.com")
        retained = self.add_user("retained@example.com")
        project = self.add_project("Transfer", old_owner)
        self.db.add_all(
            [
                ProjectMember(project_id=project.id, user_id=new_owner.id),
                ProjectMember(project_id=project.id, user_id=retained.id),
            ]
        )
        self.db.commit()
        previous_locks = self.db.info.get("row_locks", 0)

        response_status, response, _ = request(
            self.app,
            "POST",
            f"/admin/projects/{project.id}/transfer",
            json_body={"new_owner_id": new_owner.id},
        )

        self.db.refresh(project)
        member_ids = {
            row[0]
            for row in self.db.query(ProjectMember.user_id)
            .filter(ProjectMember.project_id == project.id)
            .all()
        }
        self.assertEqual(response_status, 200)
        self.assertEqual(response["owner_id"], new_owner.id)
        self.assertEqual(project.user_id, new_owner.id)
        self.assertEqual(member_ids, {old_owner.id, retained.id})
        self.assertGreaterEqual(self.db.info.get("row_locks", 0), previous_locks + 2)
        audit = self.db.query(AdminAuditLog).one()
        self.assertEqual(audit.action, "projects.transfer")
        self.assertEqual(audit.target_user_id, new_owner.id)
        self.assertEqual(audit.metadata_json, {"owner_changed": True})

    def test_transfer_to_same_owner_removes_owner_membership_without_adding_it_back(self):
        self.grant_actor("projects.transfer")
        owner = self.add_user("owner@example.com")
        project = self.add_project("Same owner", owner)
        self.db.add(ProjectMember(project_id=project.id, user_id=owner.id))
        self.db.commit()

        response_status, _, _ = request(
            self.app,
            "POST",
            f"/admin/projects/{project.id}/transfer",
            json_body={"new_owner_id": owner.id},
        )

        self.assertEqual(response_status, 200)
        self.assertEqual(
            self.db.query(ProjectMember)
            .filter(
                ProjectMember.project_id == project.id,
                ProjectMember.user_id == owner.id,
            )
            .count(),
            0,
        )
        self.assertEqual(
            self.db.query(AdminAuditLog).one().metadata_json,
            {"owner_changed": False},
        )

    def test_transfer_rejects_inactive_new_owner_without_mutation(self):
        self.grant_actor("projects.transfer")
        old_owner = self.add_user("old-owner@example.com")
        disabled = self.add_user("disabled@example.com", status="disabled")
        project = self.add_project("Rejected transfer", old_owner)

        response_status, response, _ = request(
            self.app,
            "POST",
            f"/admin/projects/{project.id}/transfer",
            json_body={"new_owner_id": disabled.id},
        )

        self.db.refresh(project)
        self.assertEqual(response_status, 422)
        self.assertEqual(response["detail"]["code"], "active_owner_required")
        self.assertEqual(project.user_id, old_owner.id)
        self.assertEqual(self.db.query(ProjectMember).count(), 0)
        self.assertEqual(self.db.query(AdminAuditLog).count(), 0)

    def test_membership_management_validates_lists_and_audits(self):
        self.grant_actor(
            "project_members.create",
            "project_members.read",
            "project_members.delete",
        )
        owner = self.add_user("owner@example.com")
        active = self.add_user("member@example.com")
        disabled = self.add_user("disabled@example.com", status="disabled")
        project = self.add_project("Members", owner)
        previous_locks = self.db.info.get("row_locks", 0)

        add_status, added, _ = request(
            self.app,
            "POST",
            f"/admin/projects/{project.id}/members",
            json_body={"user_id": active.id},
        )
        duplicate_status, duplicate, _ = request(
            self.app,
            "POST",
            f"/admin/projects/{project.id}/members",
            json_body={"user_id": active.id},
        )
        owner_status, owner_response, _ = request(
            self.app,
            "POST",
            f"/admin/projects/{project.id}/members",
            json_body={"user_id": owner.id},
        )
        disabled_status, disabled_response, _ = request(
            self.app,
            "POST",
            f"/admin/projects/{project.id}/members",
            json_body={"user_id": disabled.id},
        )
        list_status, members, headers = request(
            self.app,
            "GET",
            f"/admin/projects/{project.id}/members?user_id={active.id}"
            "&page=1&page_size=1",
        )
        delete_status, _, _ = request(
            self.app,
            "DELETE",
            f"/admin/projects/{project.id}/members/{active.id}",
        )
        missing_status, missing, _ = request(
            self.app,
            "DELETE",
            f"/admin/projects/{project.id}/members/{active.id}",
        )

        self.assertEqual(add_status, 201)
        self.assertEqual(set(added), {"user_id", "created_at"})
        self.assertEqual(added["user_id"], active.id)
        self.assertGreater(self.db.info.get("row_locks", 0), previous_locks)
        self.assertEqual(duplicate_status, 409)
        self.assertEqual(duplicate["detail"]["code"], "project_member_exists")
        self.assertEqual(owner_status, 409)
        self.assertEqual(owner_response["detail"]["code"], "project_owner_is_not_member")
        self.assertEqual(disabled_status, 422)
        self.assertEqual(disabled_response["detail"]["code"], "active_member_required")
        self.assertEqual(list_status, 200)
        self.assertEqual([member["user_id"] for member in members], [active.id])
        self.assertEqual(headers["x-total-count"], "1")
        self.assertEqual(headers["x-page"], "1")
        self.assertEqual(headers["x-page-size"], "1")
        self.assertEqual(headers["x-total-pages"], "1")
        self.assertEqual(delete_status, 204)
        self.assertEqual(missing_status, 404)
        self.assertEqual(missing["detail"], "Project membership not found")
        self.assertEqual(
            [audit.action for audit in self.db.query(AdminAuditLog).order_by(AdminAuditLog.id)],
            ["project_members.create", "project_members.delete"],
        )

    def test_membership_routes_serialize_sqlalchemy_responses(self):
        self.grant_actor(
            "project_members.create",
            "project_members.read",
            "project_members.delete",
        )
        project = self.add_project("Route response project")
        member = self.add_user("route-member@example.com")

        add_status, added, _ = request(
            self.app,
            "POST",
            f"/admin/projects/{project.id}/members",
            json_body={"user_id": member.id},
        )
        list_status, listed, _ = request(
            self.app,
            "GET",
            f"/admin/projects/{project.id}/members",
        )
        persisted_member = self.db.query(ProjectMember).one()
        serialized_member = AdminProjectMemberResponse.model_validate(persisted_member)
        delete_status, _, _ = request(
            self.app,
            "DELETE",
            f"/admin/projects/{project.id}/members/{member.id}",
        )

        self.assertEqual(add_status, 201)
        self.assertEqual(list_status, 200)
        self.assertEqual(delete_status, 204)
        self.assertEqual(serialized_member.model_dump(mode="json"), added)
        self.assertEqual(listed, [added])

    def test_delete_requires_explicit_task_cascade_and_reports_affected_counts(self):
        self.grant_actor("projects.delete")
        project = self.add_project("Cascade")
        first_member = self.add_user("first-member@example.com")
        second_member = self.add_user("second-member@example.com")
        self.db.add_all(
            [
                ProjectMember(project_id=project.id, user_id=first_member.id),
                ProjectMember(project_id=project.id, user_id=second_member.id),
                Task(title="First", user_id=self.actor.id, project_id=project.id),
                Task(title="Second", user_id=self.actor.id, project_id=project.id),
            ]
        )
        self.db.commit()

        rejected_status, rejected, _ = request(
            self.app,
            "DELETE",
            f"/admin/projects/{project.id}",
        )

        self.assertEqual(rejected_status, 409)
        self.assertEqual(rejected["detail"]["code"], "cascade_confirmation_required")
        self.assertEqual(rejected["detail"]["task_count"], 2)
        self.assertEqual(rejected["detail"]["member_count"], 2)
        self.assertEqual(self.db.query(Project).filter(Project.id == project.id).count(), 1)
        self.assertEqual(self.db.query(Task).filter(Task.project_id == project.id).count(), 2)
        self.assertEqual(self.db.query(AdminAuditLog).count(), 0)

        deleted_status, deleted, _ = request(
            self.app,
            "DELETE",
            f"/admin/projects/{project.id}?confirm_cascade=true",
        )

        self.assertEqual(deleted_status, 204)
        self.assertIsNone(deleted)
        self.assertEqual(self.db.query(Project).filter(Project.id == project.id).count(), 0)
        self.assertEqual(self.db.query(Task).filter(Task.project_id == project.id).count(), 0)
        self.assertEqual(self.db.query(ProjectMember).filter(ProjectMember.project_id == project.id).count(), 0)
        audit = self.db.query(AdminAuditLog).one()
        self.assertEqual(audit.action, "projects.delete")
        self.assertEqual(
            audit.metadata_json,
            {"task_count": 2, "member_count": 2, "cascade": True},
        )

    def test_every_admin_project_endpoint_requires_its_exact_permission(self):
        self.grant_actor("users.read")
        owner = self.add_user("owner@example.com")
        member = self.add_user("member@example.com")
        project = self.add_project("Protected", owner)
        self.db.add(ProjectMember(project_id=project.id, user_id=member.id))
        self.db.commit()
        operations = (
            ("GET", "/admin/projects", None),
            ("POST", "/admin/projects", {"name": "Denied", "owner_id": owner.id}),
            ("GET", f"/admin/projects/{project.id}", None),
            ("PATCH", f"/admin/projects/{project.id}", {"name": "Denied"}),
            ("DELETE", f"/admin/projects/{project.id}", None),
            ("POST", f"/admin/projects/{project.id}/transfer", {"new_owner_id": member.id}),
            ("GET", f"/admin/projects/{project.id}/members", None),
            ("POST", f"/admin/projects/{project.id}/members", {"user_id": self.actor.id}),
            ("DELETE", f"/admin/projects/{project.id}/members/{member.id}", None),
        )

        for method, path, body in operations:
            with self.subTest(method=method, path=path):
                response_status, response, _ = request(
                    self.app,
                    method,
                    path,
                    json_body=body,
                )
                self.assertEqual(response_status, 403)
                self.assertEqual(response["detail"]["code"], "permission_denied")

        self.assertEqual(self.db.query(Project).filter(Project.id == project.id).one().name, "Protected")
        self.assertEqual(self.db.query(ProjectMember).filter(ProjectMember.project_id == project.id).count(), 1)
        self.assertEqual(self.db.query(AdminAuditLog).count(), 0)

    def test_admin_permission_does_not_bypass_ordinary_project_scope(self):
        self.grant_actor("projects.read")
        owner = self.add_user("owner@example.com")
        project = self.add_project("Owner scoped", owner)

        response_status, response, _ = request(
            self.app,
            "GET",
            f"/projects/{project.id}",
        )

        self.assertEqual(response_status, 404)
        self.assertEqual(response["detail"], "Project not found")


if __name__ == "__main__":
    unittest.main()
