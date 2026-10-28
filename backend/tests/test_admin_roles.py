import asyncio
import json
import os
import unittest

from fastapi import FastAPI, HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import IntegrityError
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
from src.models import AdminAuditLog, Permission, Role, RolePermission, User, UserRole
from src.routers.admin import router as admin_router
from src.routers.admin.roles import (
    create_role,
    delete_role,
    replace_role_permissions,
    update_role,
)
from src.schemas import RoleCreate, RolePermissionReplace, RoleUpdate
from src.security import auth
from src.security.authorization import (
    get_effective_permission_keys,
    require_permission,
)
from src.services.admin import (
    audit_admin_action,
    commit_admin_mutation,
    lock_and_validate_protected_role_change,
)


def request(app, method, path, *, json_body=None):
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
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
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
    return start["status"], json.loads(response_body or b"null")


class RecordingQuery(Query):
    def with_for_update(self, *args, **kwargs):
        self.session.info["row_locks"] = self.session.info.get("row_locks", 0) + 1
        return super().with_for_update(*args, **kwargs)


class AdminRoleTests(unittest.TestCase):
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
            status=status,
            must_change_password=False,
        )
        self.db.add(user)
        self.db.commit()
        return user

    def add_permission(self, key, *, retired=False):
        module, action = key.split(".", 1)
        permission = Permission(
            key=key,
            module=module,
            action=action,
            description=key,
            is_protected=True,
        )
        if retired:
            from datetime import datetime, timezone

            permission.retired_at = datetime.now(timezone.utc)
        self.db.add(permission)
        self.db.commit()
        return permission

    def add_role(self, slug, permission_keys=(), *, protected=False, version=1):
        role = Role(
            slug=slug,
            name=slug.replace("_", " ").title(),
            is_system=protected,
            is_protected=protected,
            version=version,
        )
        self.db.add(role)
        self.db.flush()
        for key in permission_keys:
            permission = self.db.query(Permission).filter(Permission.key == key).one()
            self.db.add(RolePermission(role_id=role.id, permission_id=permission.id))
        self.db.commit()
        return role

    def assign(self, user, role):
        self.db.add(UserRole(user_id=user.id, role_id=role.id))
        self.db.commit()

    def assert_conflict(self, error, code):
        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(error.exception.detail["code"], code)

    def test_missing_exact_permission_returns_403(self):
        self.add_permission("roles.read")
        role = self.add_role("reader", ["roles.read"])
        self.assign(self.actor, role)

        dependency = require_permission("roles.update")
        with self.assertRaises(HTTPException) as error:
            dependency(self.actor, self.db)

        self.assertEqual(error.exception.status_code, 403)
        self.assertEqual(error.exception.detail["code"], "permission_denied")

    def test_effective_permissions_exclude_retired_catalog_entries(self):
        self.add_permission("roles.read")
        self.add_permission("roles.update", retired=True)
        role = self.add_role("manager", ["roles.read", "roles.update"])
        self.assign(self.actor, role)

        self.assertEqual(
            get_effective_permission_keys(self.db, self.actor.id),
            {"roles.read"},
        )

    def test_admin_me_needs_no_admin_permission_and_returns_only_capabilities(self):
        status, response = request(self.app, "GET", "/admin/me")

        self.assertEqual(status, 200)
        self.assertEqual(response, {"permissions": [], "is_super_admin": False})

    def test_permission_catalog_requires_roles_read(self):
        self.add_permission("roles.read")

        status, response = request(self.app, "GET", "/admin/permissions")

        self.assertEqual(status, 403)
        self.assertEqual(response["detail"]["code"], "permission_denied")

    def test_stale_role_version_returns_409_without_mutation(self):
        self.add_permission("roles.set_permissions")
        self.add_permission("users.read")
        actor_role = self.add_role("role_editor", ["roles.set_permissions", "users.read"])
        target_role = self.add_role("target", ["users.read"], version=3)
        self.assign(self.actor, actor_role)

        with self.assertRaises(HTTPException) as error:
            replace_role_permissions(
                target_role.id,
                RolePermissionReplace(version=2, permission_keys=[]),
                self.db,
                self.actor,
            )

        self.assert_conflict(error, "stale_role_version")
        self.db.expire_all()
        self.assertEqual(self.db.query(Role).filter(Role.id == target_role.id).one().version, 3)
        self.assertEqual(
            self.db.query(RolePermission).filter(RolePermission.role_id == target_role.id).count(),
            1,
        )
        self.assertEqual(self.db.query(AdminAuditLog).count(), 0)

    def test_non_super_admin_can_grant_only_an_effective_permission_subset(self):
        self.add_permission("roles.create")
        self.add_permission("roles.set_permissions")
        self.add_permission("users.read")
        actor_role = self.add_role(
            "limited_admin",
            ["roles.create", "roles.set_permissions"],
        )
        target_role = self.add_role("target")
        self.assign(self.actor, actor_role)

        with self.assertRaises(HTTPException) as create_error:
            create_role(
                RoleCreate(
                    slug="overreach",
                    name="Overreach",
                    permission_keys=["users.read"],
                ),
                self.db,
                self.actor,
            )
        self.assertEqual(create_error.exception.status_code, 403)

        with self.assertRaises(HTTPException) as replace_error:
            replace_role_permissions(
                target_role.id,
                RolePermissionReplace(version=1, permission_keys=["users.read"]),
                self.db,
                self.actor,
            )
        self.assertEqual(replace_error.exception.status_code, 403)
        self.assertEqual(self.db.query(AdminAuditLog).count(), 0)

    def test_protected_role_cannot_be_updated_repermissioned_or_deleted(self):
        for key in ("roles.update", "roles.set_permissions", "roles.delete"):
            self.add_permission(key)
        protected = self.add_role("super_admin", protected=True)
        actor_role = self.add_role(
            "role_manager",
            ["roles.update", "roles.set_permissions", "roles.delete"],
        )
        self.assign(self.actor, actor_role)

        operations = (
            lambda: update_role(
                protected.id,
                RoleUpdate(name="Renamed"),
                self.db,
                self.actor,
            ),
            lambda: replace_role_permissions(
                protected.id,
                RolePermissionReplace(version=1, permission_keys=[]),
                self.db,
                self.actor,
            ),
            lambda: delete_role(protected.id, self.db, self.actor),
        )
        for operation in operations:
            with self.subTest(operation=operation), self.assertRaises(HTTPException) as error:
                operation()
            self.assert_conflict(error, "protected_role")
            self.db.rollback()

        self.assertEqual(self.db.query(Role).filter(Role.id == protected.id).one().name, "Super Admin")
        self.assertEqual(self.db.query(AdminAuditLog).count(), 0)

    def test_assigned_role_deletion_returns_role_in_use(self):
        self.add_permission("roles.delete")
        actor_role = self.add_role("deleter", ["roles.delete"])
        target_role = self.add_role("assigned")
        target_user = self.add_user("target@example.com")
        self.assign(self.actor, actor_role)
        self.assign(target_user, target_role)

        with self.assertRaises(HTTPException) as error:
            delete_role(target_role.id, self.db, self.actor)

        self.assert_conflict(error, "role_in_use")
        self.assertIsNotNone(self.db.query(Role).filter(Role.id == target_role.id).one_or_none())

    def test_duplicate_role_slug_returns_stable_conflict_without_audit(self):
        self.add_role("duplicate")

        with self.assertRaises(HTTPException) as error:
            create_role(
                RoleCreate(slug="duplicate", name="Duplicate"),
                self.db,
                self.actor,
            )

        self.assert_conflict(error, "integrity_conflict")
        self.assertEqual(self.db.query(Role).filter(Role.slug == "duplicate").count(), 1)
        self.assertEqual(self.db.query(AdminAuditLog).count(), 0)

    def test_successful_permission_replacement_and_audit_commit_together(self):
        self.add_permission("roles.set_permissions")
        self.add_permission("users.read")
        actor_role = self.add_role(
            "permission_admin",
            ["roles.set_permissions", "users.read"],
        )
        target_role = self.add_role("target")
        self.assign(self.actor, actor_role)

        response = replace_role_permissions(
            target_role.id,
            RolePermissionReplace(version=1, permission_keys=["users.read"]),
            self.db,
            self.actor,
        )

        self.assertEqual(response.version, 2)
        self.assertEqual(response.permission_keys, ["users.read"])
        audit = self.db.query(AdminAuditLog).one()
        self.assertEqual(audit.action, "roles.set_permissions")
        self.assertEqual(audit.resource_id, str(target_role.id))
        self.assertEqual(audit.metadata_json["permission_count"], 1)

    def test_audit_metadata_is_allow_listed_and_redacted(self):
        audit = audit_admin_action(
            self.db,
            actor_user_id=self.actor.id,
            action="roles.update",
            resource_type="role",
            resource_id="7",
            metadata={
                "permission_count": 2,
                "name_changed": True,
                "password": "secret",
                "authorization": "Bearer token",
                "nested": {"secret": "value"},
            },
        )

        self.assertEqual(
            audit.metadata_json,
            {"permission_count": 2, "name_changed": True},
        )

    def test_failed_commit_rolls_back_mutation_and_audit(self):
        self.db.add(Role(slug="atomic", name="Atomic"))
        audit_admin_action(
            self.db,
            actor_user_id=self.actor.id,
            action="roles.create",
            resource_type="role",
            resource_id="pending",
        )

        def fail_commit(session):
            raise IntegrityError("forced", {}, Exception("forced"))

        event.listen(self.db, "before_commit", fail_commit)
        try:
            with self.assertRaises(HTTPException) as error:
                commit_admin_mutation(self.db)
        finally:
            event.remove(self.db, "before_commit", fail_commit)

        self.assert_conflict(error, "integrity_conflict")
        verifier = self.Session()
        try:
            self.assertEqual(verifier.query(Role).filter(Role.slug == "atomic").count(), 0)
            self.assertEqual(verifier.query(AdminAuditLog).count(), 0)
        finally:
            verifier.close()

    def test_concurrent_last_super_admin_removal_is_rejected_under_lock(self):
        protected = self.add_role("super_admin", protected=True)
        self.assign(self.actor, protected)

        with self.assertRaises(HTTPException) as error:
            lock_and_validate_protected_role_change(
                self.db,
                role_id=protected.id,
                removing_user_id=self.actor.id,
            )

        self.assert_conflict(error, "final_super_admin")
        self.assertGreaterEqual(self.db.info.get("row_locks", 0), 2)
        self.assertEqual(self.db.query(UserRole).count(), 1)

    def test_role_crud_routes_return_safe_typed_contracts(self):
        for key in (
            "roles.create",
            "roles.read",
            "roles.update",
            "roles.delete",
            "roles.set_permissions",
        ):
            self.add_permission(key)
        protected = self.add_role(
            "super_admin",
            permission_keys=(
                "roles.create",
                "roles.read",
                "roles.update",
                "roles.delete",
                "roles.set_permissions",
            ),
            protected=True,
        )
        self.assign(self.actor, protected)

        create_status, created = request(
            self.app,
            "POST",
            "/admin/roles",
            json_body={"slug": "support", "name": "Support", "permission_keys": ["roles.read"]},
        )
        role_id = created["id"]
        list_status, roles = request(self.app, "GET", "/admin/roles")
        detail_status, detail = request(self.app, "GET", f"/admin/roles/{role_id}")
        update_status, updated = request(
            self.app,
            "PATCH",
            f"/admin/roles/{role_id}",
            json_body={"name": "Support Team", "description": "Safe description"},
        )
        permission_status, permission_update = request(
            self.app,
            "PUT",
            f"/admin/roles/{role_id}/permissions",
            json_body={"version": updated["version"], "permission_keys": []},
        )
        delete_status, delete_response = request(
            self.app,
            "DELETE",
            f"/admin/roles/{role_id}",
        )

        self.assertEqual(create_status, 201)
        self.assertEqual(list_status, 200)
        self.assertIn(role_id, [role["id"] for role in roles])
        self.assertEqual(detail_status, 200)
        self.assertNotIn("password", detail)
        self.assertEqual(update_status, 200)
        self.assertEqual(updated["name"], "Support Team")
        self.assertEqual(permission_status, 200)
        self.assertEqual(permission_update["permission_keys"], [])
        self.assertEqual(delete_status, 204)
        self.assertIsNone(delete_response)
        self.assertEqual(self.db.query(AdminAuditLog).count(), 4)


if __name__ == "__main__":
    unittest.main()
