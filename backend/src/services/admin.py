import secrets
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm.exc import StaleDataError

from ..models import (
    AdminAuditLog,
    Permission,
    Project,
    ProjectMember,
    Role,
    RolePermission,
    User,
    UserRole,
)
from ..schemas.admin import AdminUserCreate
from ..security import auth
from ..security.authorization import (
    get_effective_permission_keys,
    user_has_protected_role,
)


AUDIT_METADATA_KEYS = frozenset(
    {
        "assignment_count",
        "activity_count",
        "cascade",
        "comment_count",
        "dependency_count",
        "description_changed",
        "email_changed",
        "member_count",
        "name_changed",
        "notification_count",
        "owner_changed",
        "permission_count",
        "previous_permission_count",
        "previous_status",
        "previous_version",
        "project_count",
        "role_count",
        "status",
        "subtask_count",
        "task_count",
        "version",
    }
)
AUDIT_SCALAR_TYPES = (str, int, float, bool, type(None))
CONCURRENCY_SQLSTATES = {"40001", "40P01", "55P03"}


def conflict(code: str, message: str) -> HTTPException:
    return HTTPException(status_code=409, detail={"code": code, "message": message})


def audit_admin_action(
    db,
    *,
    actor_user_id: int | None,
    action: str,
    resource_type: str,
    resource_id: str | int,
    metadata: dict[str, object] | None = None,
    target_user_id: int | None = None,
    correlation_id: str | None = None,
    outcome: str = "success",
) -> AdminAuditLog:
    safe_metadata = {
        key: value
        for key, value in (metadata or {}).items()
        if key in AUDIT_METADATA_KEYS and isinstance(value, AUDIT_SCALAR_TYPES)
    }
    audit = AdminAuditLog(
        actor_user_id=actor_user_id,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id),
        target_user_id=target_user_id,
        metadata_json=safe_metadata,
        correlation_id=correlation_id,
        outcome=outcome,
    )
    db.add(audit)
    return audit


def _raise_admin_mutation_error(db, error: Exception) -> None:
    db.rollback()
    if isinstance(error, IntegrityError):
        raise conflict(
            "integrity_conflict",
            "The administrative change conflicts with current data.",
        ) from error
    if isinstance(error, StaleDataError):
        raise conflict(
            "concurrent_update",
            "The resource changed while the request was being processed.",
        ) from error
    if isinstance(error, DBAPIError):
        sqlstate = getattr(error.orig, "sqlstate", None) or getattr(
            error.orig,
            "pgcode",
            None,
        )
        if sqlstate in CONCURRENCY_SQLSTATES:
            raise conflict(
                "concurrent_update",
                "The resource changed while the request was being processed.",
            ) from error
    raise error


def flush_admin_mutation(db) -> None:
    try:
        db.flush()
    except Exception as error:
        _raise_admin_mutation_error(db, error)


def commit_admin_mutation(db) -> None:
    try:
        db.commit()
    except Exception as error:
        _raise_admin_mutation_error(db, error)


def lock_and_validate_protected_role_change(
    db,
    *,
    role_id: int,
    removing_user_id: int | None = None,
) -> Role | None:
    role = (
        db.query(Role)
        .filter(Role.id == role_id, Role.is_protected.is_(True))
        .with_for_update()
        .one_or_none()
    )
    if role is None:
        return None

    active_assignment_rows = (
        db.query(UserRole.user_id)
        .join(User, User.id == UserRole.user_id)
        .filter(UserRole.role_id == role.id, User.status == "active")
        .with_for_update()
        .all()
    )
    active_user_ids = {row[0] for row in active_assignment_rows}
    if removing_user_id in active_user_ids and len(active_user_ids) <= 1:
        raise conflict(
            "final_super_admin",
            "The final active super administrator cannot be removed.",
        )
    return role


def validate_assignable_roles(db, actor: User, role_ids: list[int]) -> list[Role]:
    if not role_ids:
        return []
    roles = (
        db.query(Role)
        .filter(Role.id.in_(role_ids))
        .order_by(Role.id)
        .with_for_update()
        .all()
    )
    if {role.id for role in roles} != set(role_ids):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_role_ids",
                "message": "One or more roles are unavailable.",
            },
        )

    actor_permissions = get_effective_permission_keys(db, actor.id)
    actor_is_super_admin = user_has_protected_role(db, actor.id)
    if "users.assign_roles" not in actor_permissions:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "permission_denied",
                "message": "You do not have permission to perform this action.",
            },
        )
    requested_permission_keys = {
        row[0]
        for row in (
            db.query(Permission.key)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .filter(
                RolePermission.role_id.in_(role_ids),
                Permission.retired_at.is_(None),
            )
            .all()
        )
    }
    if not actor_is_super_admin and (
        any(role.is_protected for role in roles)
        or not requested_permission_keys.issubset(actor_permissions)
    ):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "role_assignment_forbidden",
                "message": "You cannot assign one or more requested roles.",
            },
        )
    return roles


def lock_and_validate_user_protected_roles(db, user_id: int) -> None:
    protected_role_ids = [
        row[0]
        for row in (
            db.query(Role.id)
            .join(UserRole, UserRole.role_id == Role.id)
            .filter(UserRole.user_id == user_id, Role.is_protected.is_(True))
            .order_by(Role.id)
            .all()
        )
    ]
    for role_id in protected_role_ids:
        lock_and_validate_protected_role_change(
            db,
            role_id=role_id,
            removing_user_id=user_id,
        )


def create_admin_user(payload: AdminUserCreate, db, actor: User) -> User:
    duplicate = (
        db.query(User.id)
        .filter(func.lower(User.email) == payload.email)
        .first()
    )
    if duplicate:
        raise conflict("email_in_use", "The email address is already in use.")
    roles = validate_assignable_roles(db, actor, payload.role_ids)

    user = User(
        email=payload.email,
        password=auth.hash_password(payload.temp_password),
        first_name=payload.first_name,
        last_name=payload.last_name,
        status="active",
        must_change_password=True,
    )
    db.add(user)
    flush_admin_mutation(db)
    for role in roles:
        db.add(
            UserRole(
                user_id=user.id,
                role_id=role.id,
                assigned_by_user_id=actor.id,
            )
        )
    audit_admin_action(
        db,
        actor_user_id=actor.id,
        action="users.create",
        resource_type="user",
        resource_id=user.id,
        target_user_id=user.id,
        metadata={"role_count": len(roles), "status": user.status},
    )
    commit_admin_mutation(db)
    return user


def anonymize_user(user: User, db, actor: User) -> User:
    if user.id == actor.id:
        raise conflict("self_deletion", "You cannot delete your own account.")
    if user.status == "deleted":
        raise conflict("user_deleted", "The user has already been deleted.")
    owned_project = (
        db.query(Project.id)
        .filter(Project.user_id == user.id)
        .with_for_update()
        .first()
    )
    if owned_project:
        raise conflict(
            "owned_projects_exist",
            "Transfer the user's owned projects before deletion.",
        )

    lock_and_validate_user_protected_roles(db, user.id)
    assignments = (
        db.query(UserRole)
        .filter(UserRole.user_id == user.id)
        .with_for_update()
        .all()
    )
    role_count = len(assignments)
    for assignment in assignments:
        db.delete(assignment)
    member_count = (
        db.query(ProjectMember)
        .filter(ProjectMember.user_id == user.id)
        .delete(synchronize_session=False)
    )

    user.auth_version += 1
    user.email = f"deleted-{user.id}-{secrets.token_hex(8)}@deleted.invalid"
    user.password = None
    user.google_sub = None
    user.first_name = None
    user.last_name = None
    user.password_reset_otp_hash = None
    user.password_reset_otp_expires_at = None
    user.password_reset_requested_at = None
    user.password_reset_attempts = 0
    user.must_change_password = False
    user.status = "deleted"
    user.deleted_at = datetime.now(timezone.utc)
    audit_admin_action(
        db,
        actor_user_id=actor.id,
        action="users.delete",
        resource_type="user",
        resource_id=user.id,
        target_user_id=user.id,
        metadata={
            "role_count": role_count,
            "member_count": member_count,
            "status": "deleted",
        },
    )
    commit_admin_mutation(db)
    return user


def transfer_project(project: Project, new_owner: User, db, actor: User) -> Project:
    project = (
        db.query(Project)
        .filter(Project.id == project.id)
        .with_for_update()
        .one_or_none()
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    new_owner = (
        db.query(User)
        .filter(User.id == new_owner.id, User.status == "active")
        .with_for_update()
        .one_or_none()
    )
    if new_owner is None:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "active_owner_required",
                "message": "The project owner must be an active user.",
            },
        )

    old_owner_id = project.user_id
    members = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project.id)
        .with_for_update()
        .all()
    )
    for member in members:
        if member.user_id == new_owner.id:
            db.delete(member)

    if old_owner_id != new_owner.id and not any(
        member.user_id == old_owner_id for member in members
    ):
        db.add(ProjectMember(project_id=project.id, user_id=old_owner_id))

    project.user_id = new_owner.id
    audit_admin_action(
        db,
        actor_user_id=actor.id,
        action="projects.transfer",
        resource_type="project",
        resource_id=project.id,
        target_user_id=new_owner.id,
        metadata={"owner_changed": old_owner_id != new_owner.id},
    )
    commit_admin_mutation(db)
    return project
