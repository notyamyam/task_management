from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, func, not_, or_

from ...database import get_db
from ...models import (
    Permission,
    Project,
    ProjectMember,
    Role,
    RolePermission,
    Task,
    User,
    UserRole,
)
from ...schemas.admin import (
    AdminCountSummary,
    AdminUserCreate,
    AdminUserDetailResponse,
    AdminUserResponse,
    AdminUserRoleReplace,
    AdminUserRoleResponse,
    AdminUserTaskSummary,
    AdminUserUpdate,
)
from ...security.authorization import (
    get_effective_permission_keys,
    require_permission,
)
from ...services.admin import (
    anonymize_user,
    audit_admin_action,
    commit_admin_mutation,
    conflict,
    create_admin_user,
    lock_and_validate_protected_role_change,
    lock_and_validate_user_protected_roles,
    validate_assignable_roles,
)


router = APIRouter()


def get_user_or_404(db, user_id: int, *, lock: bool = False) -> User:
    query = db.query(User).filter(User.id == user_id)
    if lock:
        query = query.with_for_update()
    user = query.one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def serialize_roles(db, user_id: int) -> list[AdminUserRoleResponse]:
    roles = (
        db.query(Role)
        .join(UserRole, UserRole.role_id == Role.id)
        .filter(UserRole.user_id == user_id)
        .order_by(Role.name, Role.id)
        .all()
    )
    return [
        AdminUserRoleResponse(
            id=role.id,
            slug=role.slug,
            name=role.name,
            is_system=role.is_system,
            is_protected=role.is_protected,
        )
        for role in roles
    ]


def serialize_user(db, user: User) -> AdminUserResponse:
    deleted = user.status == "deleted"
    return AdminUserResponse(
        id=user.id,
        email=None if deleted else user.email,
        first_name=None if deleted else user.first_name,
        last_name=None if deleted else user.last_name,
        status=user.status,
        profile_complete=not deleted and bool(user.first_name and user.last_name),
        has_password=not deleted and user.password is not None,
        google_linked=not deleted and user.google_sub is not None,
        created_at=user.created_at,
        updated_at=user.updated_at,
        deleted_at=user.deleted_at,
        roles=serialize_roles(db, user.id),
    )


def serialize_user_detail(db, user: User, actor: User) -> AdminUserDetailResponse:
    base = serialize_user(db, user).model_dump()
    actor_permissions = get_effective_permission_keys(db, actor.id)
    detail = AdminUserDetailResponse(
        **base,
        effective_permissions=sorted(get_effective_permission_keys(db, user.id)),
    )
    if "projects.read" in actor_permissions:
        detail.owned_projects = AdminCountSummary(
            count=db.query(Project).filter(Project.user_id == user.id).count()
        )
    if "project_members.read" in actor_permissions:
        detail.project_memberships = AdminCountSummary(
            count=(
                db.query(ProjectMember)
                .filter(ProjectMember.user_id == user.id)
                .count()
            )
        )
    if "tasks.read" in actor_permissions:
        detail.task_activity = AdminUserTaskSummary(
            created_count=db.query(Task).filter(Task.user_id == user.id).count(),
            assigned_count=(
                db.query(Task).filter(Task.assignee_user_id == user.id).count()
            ),
        )
    return detail


def clear_password_reset(user: User) -> None:
    user.password_reset_otp_hash = None
    user.password_reset_otp_expires_at = None
    user.password_reset_requested_at = None
    user.password_reset_attempts = 0


@router.get("/users", response_model=list[AdminUserResponse])
def list_users(
    response: Response,
    search: str | None = None,
    user_status: Literal["active", "disabled", "deleted"] | None = Query(
        default=None,
        alias="status",
    ),
    role_id: int | None = Query(default=None, ge=1),
    provider: Literal["password", "google"] | None = None,
    profile_complete: bool | None = None,
    sort_by: Literal[
        "email",
        "first_name",
        "last_name",
        "status",
        "created_at",
        "updated_at",
    ] = "created_at",
    sort_order: Literal["asc", "desc"] = "desc",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db=Depends(get_db),
    actor=Depends(require_permission("users.read")),
):
    query = db.query(User)
    if search and (term := search.strip().lower()):
        pattern = f"%{term}%"
        query = query.filter(
            or_(
                func.lower(User.email).like(pattern),
                func.lower(User.first_name).like(pattern),
                func.lower(User.last_name).like(pattern),
            )
        )
    if user_status:
        query = query.filter(User.status == user_status)
    if role_id is not None:
        role_user_ids = db.query(UserRole.user_id).filter(UserRole.role_id == role_id)
        query = query.filter(User.id.in_(role_user_ids))
    if provider == "password":
        query = query.filter(User.password.is_not(None))
    elif provider == "google":
        query = query.filter(User.google_sub.is_not(None))
    if profile_complete is not None:
        complete = and_(
            User.first_name.is_not(None),
            User.first_name != "",
            User.last_name.is_not(None),
            User.last_name != "",
        )
        query = query.filter(complete if profile_complete else not_(complete))

    total = query.count()
    sort_column = {
        "email": User.email,
        "first_name": User.first_name,
        "last_name": User.last_name,
        "status": User.status,
        "created_at": User.created_at,
        "updated_at": User.updated_at,
    }[sort_by]
    order = sort_column.asc() if sort_order == "asc" else sort_column.desc()
    users = (
        query.order_by(order, User.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    response.headers["X-Total-Count"] = str(total)
    response.headers["X-Page"] = str(page)
    response.headers["X-Page-Size"] = str(page_size)
    response.headers["X-Total-Pages"] = str((total + page_size - 1) // page_size)
    return [serialize_user(db, user) for user in users]


@router.post(
    "/users",
    response_model=AdminUserResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_user(
    payload: AdminUserCreate,
    db=Depends(get_db),
    actor=Depends(require_permission("users.create")),
):
    return serialize_user(db, create_admin_user(payload, db, actor))


@router.get(
    "/users/{user_id}",
    response_model=AdminUserDetailResponse,
    response_model_exclude_none=True,
)
def get_user(
    user_id: int,
    db=Depends(get_db),
    actor=Depends(require_permission("users.read")),
):
    return serialize_user_detail(db, get_user_or_404(db, user_id), actor)


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
def update_user(
    user_id: int,
    payload: AdminUserUpdate,
    db=Depends(get_db),
    actor=Depends(require_permission("users.update")),
):
    user = get_user_or_404(db, user_id, lock=True)
    if user.status == "deleted":
        raise conflict("user_deleted", "Deleted users cannot be changed.")
    changed_fields = payload.model_fields_set
    if (
        user.id == actor.id
        and "status" in changed_fields
        and payload.status == "disabled"
        and user.status != "disabled"
    ):
        raise conflict("self_deactivation", "You cannot disable your own account.")

    email_changed = "email" in changed_fields and payload.email != user.email
    status_changed = "status" in changed_fields and payload.status != user.status
    if email_changed:
        duplicate = (
            db.query(User.id)
            .filter(
                func.lower(User.email) == payload.email,
                User.id != user.id,
            )
            .first()
        )
        if duplicate:
            raise conflict("email_in_use", "The email address is already in use.")
    if status_changed and payload.status == "disabled":
        lock_and_validate_user_protected_roles(db, user.id)

    previous_status = user.status
    if "first_name" in changed_fields:
        user.first_name = payload.first_name
    if "last_name" in changed_fields:
        user.last_name = payload.last_name
    if email_changed:
        user.email = payload.email
        clear_password_reset(user)
    if status_changed:
        user.status = payload.status
    if email_changed or status_changed:
        user.auth_version += 1

    audit_admin_action(
        db,
        actor_user_id=actor.id,
        action="users.update",
        resource_type="user",
        resource_id=user.id,
        target_user_id=user.id,
        metadata={
            "email_changed": email_changed,
            "name_changed": bool({"first_name", "last_name"} & changed_fields),
            "previous_status": previous_status,
            "status": user.status,
        },
    )
    commit_admin_mutation(db)
    return serialize_user(db, user)


@router.put("/users/{user_id}/roles", response_model=AdminUserResponse)
def replace_user_roles(
    user_id: int,
    payload: AdminUserRoleReplace,
    db=Depends(get_db),
    actor=Depends(require_permission("users.assign_roles")),
):
    if user_id == actor.id:
        raise conflict(
            "self_role_replacement",
            "You cannot replace your own role assignments.",
        )
    user = get_user_or_404(db, user_id, lock=True)
    if user.status == "deleted":
        raise conflict("user_deleted", "Deleted users cannot be changed.")
    roles = validate_assignable_roles(db, actor, payload.role_ids)
    existing = (
        db.query(UserRole)
        .filter(UserRole.user_id == user.id)
        .with_for_update()
        .all()
    )
    existing_role_ids = {assignment.role_id for assignment in existing}
    requested_role_ids = {role.id for role in roles}
    removed_role_ids = existing_role_ids - requested_role_ids
    added_role_ids = requested_role_ids - existing_role_ids
    protected_removed = (
        db.query(Role.id)
        .filter(
            Role.id.in_(removed_role_ids),
            Role.is_protected.is_(True),
        )
        .order_by(Role.id)
        .all()
        if removed_role_ids
        else []
    )
    for row in protected_removed:
        lock_and_validate_protected_role_change(
            db,
            role_id=row[0],
            removing_user_id=user.id,
        )
    if removed_role_ids or added_role_ids:
        for assignment in existing:
            if assignment.role_id in removed_role_ids:
                db.delete(assignment)
        for role in roles:
            if role.id in added_role_ids:
                db.add(
                    UserRole(
                        user_id=user.id,
                        role_id=role.id,
                        assigned_by_user_id=actor.id,
                    )
                )
        user.auth_version += 1
    audit_admin_action(
        db,
        actor_user_id=actor.id,
        action="users.assign_roles",
        resource_type="user",
        resource_id=user.id,
        target_user_id=user.id,
        metadata={"role_count": len(roles)},
    )
    commit_admin_mutation(db)
    return serialize_user(db, user)


@router.post("/users/{user_id}/revoke-sessions", response_model=AdminUserResponse)
def revoke_user_sessions(
    user_id: int,
    db=Depends(get_db),
    actor=Depends(require_permission("users.revoke_sessions")),
):
    user = get_user_or_404(db, user_id, lock=True)
    if user.status == "deleted":
        raise conflict("user_deleted", "Deleted users cannot be changed.")
    previous_version = user.auth_version
    user.auth_version += 1
    audit_admin_action(
        db,
        actor_user_id=actor.id,
        action="users.revoke_sessions",
        resource_type="user",
        resource_id=user.id,
        target_user_id=user.id,
        metadata={"previous_version": previous_version, "version": user.auth_version},
    )
    commit_admin_mutation(db)
    return serialize_user(db, user)


@router.delete("/users/{user_id}", response_model=AdminUserResponse)
def delete_user(
    user_id: int,
    db=Depends(get_db),
    actor=Depends(require_permission("users.delete")),
):
    user = get_user_or_404(db, user_id, lock=True)
    return serialize_user(db, anonymize_user(user, db, actor))
