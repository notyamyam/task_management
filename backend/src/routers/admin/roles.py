from fastapi import APIRouter, Depends, HTTPException, Response, status

from ...database import get_db
from ...models import Permission, Role, RolePermission, UserRole
from ...schemas.admin import (
    AdminMeResponse,
    PermissionResponse,
    RoleCreate,
    RolePermissionReplace,
    RoleResponse,
    RoleUpdate,
)
from ...security import auth
from ...security.authorization import (
    get_effective_permission_keys,
    require_permission,
    user_has_protected_role,
)
from ...services.admin import (
    audit_admin_action,
    commit_admin_mutation,
    conflict,
    flush_admin_mutation,
)


router = APIRouter()


def get_role_or_404(db, role_id: int, *, lock: bool = False) -> Role:
    query = db.query(Role).filter(Role.id == role_id)
    if lock:
        query = query.with_for_update()
    role = query.one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


def serialize_role(db, role: Role) -> RoleResponse:
    permission_keys = [
        row[0]
        for row in (
            db.query(Permission.key)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .filter(
                RolePermission.role_id == role.id,
                Permission.retired_at.is_(None),
            )
            .order_by(Permission.key)
            .all()
        )
    ]
    assignment_count = (
        db.query(UserRole).filter(UserRole.role_id == role.id).count()
    )
    return RoleResponse(
        id=role.id,
        slug=role.slug,
        name=role.name,
        description=role.description,
        is_system=role.is_system,
        is_protected=role.is_protected,
        version=role.version,
        created_at=role.created_at,
        updated_at=role.updated_at,
        permission_keys=permission_keys,
        assignment_count=assignment_count,
    )


def validate_permission_grant(db, actor, permission_keys: list[str]) -> list[Permission]:
    requested = set(permission_keys)
    permissions = []
    if requested:
        permissions = (
            db.query(Permission)
            .filter(
                Permission.key.in_(requested),
                Permission.retired_at.is_(None),
            )
            .all()
        )
    if {permission.key for permission in permissions} != requested:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_permission_keys",
                "message": "One or more permission keys are unavailable.",
            },
        )
    if not user_has_protected_role(db, actor.id):
        actor_permissions = get_effective_permission_keys(db, actor.id)
        if not requested.issubset(actor_permissions):
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "permission_grant_forbidden",
                    "message": "You cannot grant permissions you do not hold.",
                },
            )
    return permissions


def ensure_role_editable(role: Role) -> None:
    if role.is_protected:
        raise conflict(
            "protected_role",
            "The protected super-administrator role cannot be changed.",
        )


@router.get("/me", response_model=AdminMeResponse)
def get_admin_me(
    db=Depends(get_db),
    actor=Depends(auth.get_current_user),
):
    return AdminMeResponse(
        permissions=sorted(get_effective_permission_keys(db, actor.id)),
        is_super_admin=user_has_protected_role(db, actor.id),
    )


@router.get("/permissions", response_model=list[PermissionResponse])
def list_permissions(
    db=Depends(get_db),
    actor=Depends(require_permission("roles.read")),
):
    return (
        db.query(Permission)
        .filter(Permission.retired_at.is_(None))
        .order_by(Permission.module, Permission.action, Permission.key)
        .all()
    )


@router.get("/roles", response_model=list[RoleResponse])
def list_roles(
    db=Depends(get_db),
    actor=Depends(require_permission("roles.read")),
):
    roles = db.query(Role).order_by(Role.name, Role.id).all()
    return [serialize_role(db, role) for role in roles]


@router.post("/roles", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
def create_role(
    payload: RoleCreate,
    db=Depends(get_db),
    actor=Depends(require_permission("roles.create")),
):
    permissions = validate_permission_grant(db, actor, payload.permission_keys)
    role = Role(
        slug=payload.slug,
        name=payload.name,
        description=payload.description,
        is_system=False,
        is_protected=False,
    )
    db.add(role)
    flush_admin_mutation(db)
    for permission in permissions:
        db.add(RolePermission(role_id=role.id, permission_id=permission.id))
    audit_admin_action(
        db,
        actor_user_id=actor.id,
        action="roles.create",
        resource_type="role",
        resource_id=role.id,
        metadata={"permission_count": len(permissions), "version": role.version},
    )
    commit_admin_mutation(db)
    return serialize_role(db, role)


@router.get("/roles/{role_id}", response_model=RoleResponse)
def get_role(
    role_id: int,
    db=Depends(get_db),
    actor=Depends(require_permission("roles.read")),
):
    return serialize_role(db, get_role_or_404(db, role_id))


@router.patch("/roles/{role_id}", response_model=RoleResponse)
def update_role(
    role_id: int,
    payload: RoleUpdate,
    db=Depends(get_db),
    actor=Depends(require_permission("roles.update")),
):
    role = get_role_or_404(db, role_id, lock=True)
    ensure_role_editable(role)
    changed_fields = payload.model_fields_set
    if "name" in changed_fields:
        role.name = payload.name
    if "description" in changed_fields:
        role.description = payload.description
    previous_version = role.version
    role.version += 1
    audit_admin_action(
        db,
        actor_user_id=actor.id,
        action="roles.update",
        resource_type="role",
        resource_id=role.id,
        metadata={
            "name_changed": "name" in changed_fields,
            "description_changed": "description" in changed_fields,
            "previous_version": previous_version,
            "version": role.version,
        },
    )
    commit_admin_mutation(db)
    return serialize_role(db, role)


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(
    role_id: int,
    db=Depends(get_db),
    actor=Depends(require_permission("roles.delete")),
):
    role = get_role_or_404(db, role_id, lock=True)
    ensure_role_editable(role)
    assignment_count = db.query(UserRole).filter(UserRole.role_id == role.id).count()
    if assignment_count:
        raise conflict("role_in_use", "The role is assigned to one or more users.")
    audit_admin_action(
        db,
        actor_user_id=actor.id,
        action="roles.delete",
        resource_type="role",
        resource_id=role.id,
        metadata={"assignment_count": assignment_count},
    )
    db.delete(role)
    commit_admin_mutation(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/roles/{role_id}/permissions", response_model=RoleResponse)
def replace_role_permissions(
    role_id: int,
    payload: RolePermissionReplace,
    db=Depends(get_db),
    actor=Depends(require_permission("roles.set_permissions")),
):
    role = get_role_or_404(db, role_id, lock=True)
    ensure_role_editable(role)
    if role.version != payload.version:
        db.rollback()
        raise conflict(
            "stale_role_version",
            "The role changed after it was loaded.",
        )

    permissions = validate_permission_grant(db, actor, payload.permission_keys)
    existing = (
        db.query(RolePermission)
        .filter(RolePermission.role_id == role.id)
        .with_for_update()
        .all()
    )
    previous_permission_count = len(existing)
    for assignment in existing:
        db.delete(assignment)
    for permission in permissions:
        db.add(RolePermission(role_id=role.id, permission_id=permission.id))
    previous_version = role.version
    role.version += 1
    audit_admin_action(
        db,
        actor_user_id=actor.id,
        action="roles.set_permissions",
        resource_type="role",
        resource_id=role.id,
        metadata={
            "previous_permission_count": previous_permission_count,
            "permission_count": len(permissions),
            "previous_version": previous_version,
            "version": role.version,
        },
    )
    commit_admin_mutation(db)
    return serialize_role(db, role)
