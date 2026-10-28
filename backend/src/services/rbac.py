from datetime import datetime, timezone

from sqlalchemy import text

from ..models import AdminAuditLog, Permission, Role, RolePermission, User, UserRole


RBAC_CATALOG_LOCK_ID = 1_380_007_235


_PERMISSIONS = (
    ("users", "create"),
    ("users", "read"),
    ("users", "update"),
    ("users", "delete"),
    ("users", "assign_roles"),
    ("users", "revoke_sessions"),
    ("roles", "create"),
    ("roles", "read"),
    ("roles", "update"),
    ("roles", "delete"),
    ("roles", "set_permissions"),
    ("projects", "create"),
    ("projects", "read"),
    ("projects", "update"),
    ("projects", "delete"),
    ("projects", "transfer"),
    ("project_members", "create"),
    ("project_members", "read"),
    ("project_members", "delete"),
    ("tasks", "create"),
    ("tasks", "read"),
    ("tasks", "update"),
    ("tasks", "delete"),
    ("subtasks", "create"),
    ("subtasks", "read"),
    ("subtasks", "update"),
    ("subtasks", "delete"),
    ("task_dependencies", "create"),
    ("task_dependencies", "read"),
    ("task_dependencies", "delete"),
    ("task_comments", "read"),
    ("task_comments", "delete"),
    ("task_activity", "read"),
    ("notifications", "read"),
    ("notifications", "delete"),
    ("notification_preferences", "read"),
    ("notification_preferences", "update"),
    ("reports", "export"),
    ("reports", "generate"),
    ("audit_logs", "read"),
    ("system_integrations", "read"),
)

PERMISSION_CATALOG: tuple[dict[str, object], ...] = tuple(
    {
        "key": f"{module}.{action}",
        "module": module,
        "action": action,
        "description": f"{action.replace('_', ' ').title()} {module.replace('_', ' ')}",
        "is_protected": True,
    }
    for module, action in _PERMISSIONS
)


def initialize_rbac_catalog(db) -> None:
    now = datetime.now(timezone.utc)
    try:
        if db.get_bind().dialect.name == "postgresql":
            db.execute(
                text("SELECT pg_advisory_xact_lock(:lock_id)"),
                {"lock_id": RBAC_CATALOG_LOCK_ID},
            )
        existing = {
            permission.key: permission
            for permission in db.query(Permission).with_for_update().all()
        }
        catalog_permissions = []
        for item in PERMISSION_CATALOG:
            permission = existing.get(item["key"])
            if permission is None:
                permission = Permission(**item)
                db.add(permission)
            else:
                permission.module = item["module"]
                permission.action = item["action"]
                permission.description = item["description"]
                permission.is_protected = item["is_protected"]
                permission.retired_at = None
            catalog_permissions.append(permission)

        catalog_keys = {item["key"] for item in PERMISSION_CATALOG}
        for key, permission in existing.items():
            if key not in catalog_keys and permission.retired_at is None:
                permission.retired_at = now

        db.flush()
        role = (
            db.query(Role)
            .filter(Role.slug == "super_admin")
            .with_for_update()
            .one_or_none()
        )
        if role is None:
            role = Role(
                slug="super_admin",
                name="Super Administrator",
                description="Protected role with every active administrative permission.",
                is_system=True,
                is_protected=True,
            )
            db.add(role)
            db.flush()
        else:
            role.name = "Super Administrator"
            role.description = "Protected role with every active administrative permission."
            role.is_system = True
            role.is_protected = True

        active_permission_ids = {permission.id for permission in catalog_permissions}
        assignments = (
            db.query(RolePermission)
            .filter(RolePermission.role_id == role.id)
            .with_for_update()
            .all()
        )
        assigned_permission_ids = {item.permission_id for item in assignments}
        for assignment in assignments:
            if assignment.permission_id not in active_permission_ids:
                db.delete(assignment)
        for permission_id in active_permission_ids - assigned_permission_ids:
            db.add(RolePermission(role_id=role.id, permission_id=permission_id))

        db.commit()
    except Exception:
        db.rollback()
        raise


def assign_super_admin(db, email: str) -> User:
    try:
        user = (
            db.query(User)
            .filter(User.email == email.strip().lower(), User.status == "active")
            .with_for_update()
            .first()
        )
        if not user:
            raise ValueError("An active user with that email is required.")

        role = (
            db.query(Role)
            .filter(Role.slug == "super_admin")
            .with_for_update()
            .one_or_none()
        )
        if role is None:
            raise RuntimeError("The RBAC catalog must be initialized first.")

        assignment = (
            db.query(UserRole)
            .filter(UserRole.user_id == user.id, UserRole.role_id == role.id)
            .with_for_update()
            .one_or_none()
        )
        if assignment is None:
            db.add(UserRole(user_id=user.id, role_id=role.id))
            user.auth_version += 1
            db.add(
                AdminAuditLog(
                    actor_user_id=None,
                    action="users.bootstrap_super_admin",
                    resource_type="user",
                    resource_id=str(user.id),
                    target_user_id=user.id,
                    metadata_json={},
                    correlation_id=None,
                    outcome="success",
                )
            )
        db.commit()
        return user
    except Exception:
        db.rollback()
        raise
