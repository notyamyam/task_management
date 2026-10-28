import asyncio
import json
import os
import unittest
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
    Permission,
    Project,
    ProjectMember,
    Role,
    RolePermission,
    Subtask,
    Task,
    TaskActivity,
    TaskComment,
    TaskDependency,
    User,
    UserRole,
)
from src.routers.admin import router as admin_router
from src.routers.admin import tasks as admin_tasks
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


class AdminTaskTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite+pysqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.actor = self.add_user("admin@example.com")

        app = FastAPI()
        app.include_router(admin_router)
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
            slug=f"task_role_{self.db.query(Role).count()}",
            name="Task administrator",
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

    def add_project(self, name):
        project = Project(name=name, user_id=self.actor.id)
        self.db.add(project)
        self.db.commit()
        return project

    def add_task(self, title, project):
        task = Task(title=title, user_id=self.actor.id, project_id=project.id)
        self.db.add(task)
        self.db.commit()
        return task

    def test_admin_cannot_assign_disabled_user(self):
        self.grant_actor("tasks.create")
        project = self.add_project("Administrative project")
        disabled = self.add_user("disabled@example.com", status="disabled")

        response_status, response, _ = request(
            self.app,
            "POST",
            "/admin/tasks",
            json_body={
                "title": "Must reject disabled assignee",
                "project_id": project.id,
                "assignee_user_id": disabled.id,
            },
        )

        self.assertEqual(response_status, 422)
        self.assertIn("project owner or a project member", response["detail"])
        self.assertEqual(self.db.query(Task).count(), 0)
        self.assertEqual(self.db.query(AdminAuditLog).count(), 0)

    def test_unrelated_task_update_preserves_disabled_historical_assignee(self):
        self.grant_actor("tasks.update")
        project = self.add_project("Historical assignment project")
        disabled = self.add_user("historical@example.com", status="disabled")
        self.db.add(ProjectMember(project_id=project.id, user_id=disabled.id))
        task = Task(
            title="Original title",
            user_id=self.actor.id,
            project_id=project.id,
            assignee_user_id=disabled.id,
        )
        self.db.add(task)
        self.db.commit()

        response_status, response, _ = request(
            self.app,
            "PATCH",
            f"/admin/tasks/{task.id}",
            json_body={
                "title": "Updated title",
                "project_id": project.id,
                "assignee_user_id": disabled.id,
            },
        )

        self.assertEqual(response_status, 200)
        self.assertEqual(response["title"], "Updated title")
        self.assertEqual(response["assignee_user_id"], disabled.id)
        persisted = self.db.query(Task).filter(Task.id == task.id).one()
        self.assertEqual(persisted.assignee_user_id, disabled.id)

    def test_changing_to_disabled_assignee_rejects_without_audit_or_mutation(self):
        self.grant_actor("tasks.update")
        project = self.add_project("Rejected assignment project")
        disabled = self.add_user("new-disabled@example.com", status="disabled")
        self.db.add(ProjectMember(project_id=project.id, user_id=disabled.id))
        task = self.add_task("Original title", project)
        original_assignee_id = task.assignee_user_id

        response_status, response, _ = request(
            self.app,
            "PATCH",
            f"/admin/tasks/{task.id}",
            json_body={
                "title": "Should not save",
                "project_id": project.id,
                "assignee_user_id": disabled.id,
            },
        )

        self.assertEqual(response_status, 422)
        self.assertIn("project owner or a project member", response["detail"])
        persisted = self.db.query(Task).filter(Task.id == task.id).one()
        self.assertEqual(persisted.title, "Original title")
        self.assertEqual(persisted.assignee_user_id, original_assignee_id)
        self.assertEqual(self.db.query(AdminAuditLog).count(), 0)
        self.assertEqual(self.db.query(TaskActivity).count(), 0)
        self.assertEqual(self.db.query(Notification).count(), 0)

    def test_admin_dependency_still_rejects_cycles_and_cross_project_links(self):
        self.grant_actor("task_dependencies.create")
        project = self.add_project("Dependency project")
        other_project = self.add_project("Other project")
        first = self.add_task("First", project)
        second = self.add_task("Second", project)
        foreign = self.add_task("Foreign", other_project)

        first_link_status, _, _ = request(
            self.app,
            "POST",
            f"/admin/tasks/{first.id}/dependencies",
            json_body={"blocked_by_task_id": second.id},
        )
        cycle_status, cycle_response, _ = request(
            self.app,
            "POST",
            f"/admin/tasks/{second.id}/dependencies",
            json_body={"blocked_by_task_id": first.id},
        )
        cross_status, cross_response, _ = request(
            self.app,
            "POST",
            f"/admin/tasks/{first.id}/dependencies",
            json_body={"blocked_by_task_id": foreign.id},
        )

        self.assertEqual(first_link_status, 201)
        self.assertEqual(cycle_status, 422)
        self.assertEqual(cycle_response["detail"], "Task dependency would create a cycle")
        self.assertEqual(cross_status, 422)
        self.assertEqual(
            cross_response["detail"],
            "Dependencies must link tasks in the same project",
        )
        self.assertEqual(self.db.query(TaskDependency).count(), 1)

    def test_comment_moderation_deletes_but_never_rewrites_authorship(self):
        comment_route_methods = {
            method
            for route in admin_tasks.router.routes
            if getattr(route, "path", None)
            == "/tasks/{task_id}/comments/{comment_id}"
            for method in route.methods
        }

        self.assertEqual(comment_route_methods, {"DELETE"})

    def test_global_task_crud_filters_paginates_and_audits(self):
        self.grant_actor("tasks.create", "tasks.read", "tasks.update", "tasks.delete")
        owner = self.add_user("other-owner@example.com")
        project = Project(name="Global project", user_id=owner.id)
        self.db.add(project)
        self.db.flush()
        first = Task(
            title="Zulu",
            user_id=owner.id,
            updated_by_user_id=owner.id,
            project_id=project.id,
        )
        self.db.add(first)
        self.db.commit()

        create_status, created, _ = request(
            self.app,
            "POST",
            "/admin/tasks",
            json_body={"title": "Alpha", "project_id": project.id},
        )
        list_status, listed, headers = request(
            self.app,
            "GET",
            "/admin/tasks?search=a&page=1&page_size=1&sort_by=title&sort_order=asc",
        )
        update_status, updated, _ = request(
            self.app,
            "PATCH",
            f"/admin/tasks/{created['id']}",
            json_body={
                "title": "Alpha updated",
                "project_id": project.id,
                "status": "in_progress",
            },
        )
        detail_status, detail, _ = request(
            self.app,
            "GET",
            f"/admin/tasks/{created['id']}",
        )
        delete_status, deleted, _ = request(
            self.app,
            "DELETE",
            f"/admin/tasks/{created['id']}",
        )

        self.assertEqual(create_status, 201)
        self.assertEqual(list_status, 200)
        self.assertEqual([task["title"] for task in listed], ["Alpha"])
        self.assertEqual(
            {headers[key] for key in ("x-total-count", "x-page", "x-page-size", "x-total-pages")},
            {"1"},
        )
        self.assertEqual(update_status, 200)
        self.assertEqual(updated["status"], "in_progress")
        self.assertEqual(detail_status, 200)
        self.assertEqual(detail["title"], "Alpha updated")
        self.assertEqual((delete_status, deleted), (204, None))
        self.assertIsNone(self.db.query(Task).filter(Task.id == created["id"]).one_or_none())
        self.assertEqual(
            [audit.action for audit in self.db.query(AdminAuditLog).order_by(AdminAuditLog.id)],
            ["tasks.create", "tasks.update", "tasks.delete"],
        )

    def test_task_deletion_audit_reports_all_cascaded_subresources(self):
        self.grant_actor("tasks.delete")
        project = self.add_project("Deletion audit project")
        task = self.add_task("Delete me", project)
        blocker = self.add_task("Blocker", project)
        self.db.add_all(
            [
                Subtask(task_id=task.id, title="Child"),
                TaskDependency(
                    task_id=task.id,
                    blocked_by_task_id=blocker.id,
                    created_by_user_id=self.actor.id,
                ),
                TaskComment(task_id=task.id, user_id=self.actor.id, body="Comment"),
                TaskActivity(
                    task_id=task.id,
                    actor_user_id=self.actor.id,
                    event_type="comment_added",
                ),
                Notification(
                    user_id=self.actor.id,
                    actor_user_id=self.actor.id,
                    task_id=task.id,
                    notification_type="mention",
                    title="Mention",
                    body="You were mentioned.",
                ),
            ]
        )
        self.db.commit()

        response_status, response, _ = request(
            self.app,
            "DELETE",
            f"/admin/tasks/{task.id}",
        )

        self.assertEqual((response_status, response), (204, None))
        audit = self.db.query(AdminAuditLog).filter(
            AdminAuditLog.action == "tasks.delete"
        ).one()
        self.assertEqual(
            audit.metadata_json,
            {
                "subtask_count": 1,
                "dependency_count": 1,
                "comment_count": 1,
                "activity_count": 1,
                "notification_count": 1,
            },
        )

    def test_related_routes_use_exact_permissions_and_preserve_comment_activity(self):
        self.grant_actor(
            "subtasks.create",
            "subtasks.read",
            "subtasks.update",
            "subtasks.delete",
            "task_comments.read",
            "task_comments.delete",
            "task_activity.read",
        )
        project = self.add_project("Related resources")
        member = self.add_user("member@example.com")
        self.db.add(ProjectMember(project_id=project.id, user_id=member.id))
        task = self.add_task("Parent", project)

        create_subtask_status, subtask, _ = request(
            self.app,
            "POST",
            f"/admin/tasks/{task.id}/subtasks",
            json_body={"title": "Child", "assignee_user_id": member.id},
        )
        list_subtask_status, subtasks, _ = request(
            self.app,
            "GET",
            f"/admin/tasks/{task.id}/subtasks",
        )
        update_subtask_status, updated_subtask, _ = request(
            self.app,
            "PATCH",
            f"/admin/tasks/{task.id}/subtasks/{subtask['id']}",
            json_body={"completed": True},
        )
        delete_subtask_status, _, _ = request(
            self.app,
            "DELETE",
            f"/admin/tasks/{task.id}/subtasks/{subtask['id']}",
        )

        comment = TaskComment(task_id=task.id, user_id=member.id, body="Needs review")
        activity = TaskActivity(
            task_id=task.id,
            actor_user_id=member.id,
            event_type="comment_added",
        )
        self.db.add_all([comment, activity])
        self.db.commit()
        comment_id = comment.id
        activity_id = activity.id
        list_comment_status, comments, _ = request(
            self.app,
            "GET",
            f"/admin/tasks/{task.id}/comments",
        )
        list_activity_status, activities, _ = request(
            self.app,
            "GET",
            f"/admin/tasks/{task.id}/activity",
        )
        delete_comment_status, _, _ = request(
            self.app,
            "DELETE",
            f"/admin/tasks/{task.id}/comments/{comment_id}",
        )

        self.assertEqual(create_subtask_status, 201)
        self.assertEqual(list_subtask_status, 200)
        self.assertEqual(update_subtask_status, 200)
        self.assertTrue(updated_subtask["completed"])
        self.assertEqual(delete_subtask_status, 204)
        self.assertEqual((list_comment_status, comments[0]["author"]["id"]), (200, member.id))
        self.assertEqual((list_activity_status, activities[0]["id"]), (200, activity_id))
        self.assertEqual(delete_comment_status, 204)
        self.assertIsNone(self.db.query(TaskComment).filter(TaskComment.id == comment_id).one_or_none())
        self.assertIsNotNone(self.db.query(TaskActivity).filter(TaskActivity.id == activity_id).one_or_none())
        comment_audit = self.db.query(AdminAuditLog).filter(
            AdminAuditLog.action == "task_comments.delete"
        ).one()
        self.assertEqual(comment_audit.resource_id, str(comment_id))

    def test_each_admin_task_operation_requires_its_exact_permission(self):
        self.grant_actor("users.read")
        project = self.add_project("Protected task project")
        task = self.add_task("Protected", project)
        operations = (
            ("GET", "/admin/tasks", None),
            ("POST", "/admin/tasks", {"title": "Denied", "project_id": project.id}),
            ("GET", f"/admin/tasks/{task.id}", None),
            (
                "PATCH",
                f"/admin/tasks/{task.id}",
                {"title": "Denied", "project_id": project.id},
            ),
            ("DELETE", f"/admin/tasks/{task.id}", None),
            ("GET", f"/admin/tasks/{task.id}/subtasks", None),
            ("POST", f"/admin/tasks/{task.id}/subtasks", {"title": "Denied"}),
            ("PATCH", f"/admin/tasks/{task.id}/subtasks/1", {"title": "Denied"}),
            ("DELETE", f"/admin/tasks/{task.id}/subtasks/1", None),
            ("GET", f"/admin/tasks/{task.id}/dependencies", None),
            (
                "POST",
                f"/admin/tasks/{task.id}/dependencies",
                {"blocked_by_task_id": task.id},
            ),
            ("DELETE", f"/admin/tasks/{task.id}/dependencies/1", None),
            ("GET", f"/admin/tasks/{task.id}/comments", None),
            ("DELETE", f"/admin/tasks/{task.id}/comments/1", None),
            ("GET", f"/admin/tasks/{task.id}/activity", None),
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


if __name__ == "__main__":
    unittest.main()
