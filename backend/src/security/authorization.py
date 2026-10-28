from fastapi import Depends, HTTPException

from ..database import get_db
from ..models import Permission, Role, RolePermission, UserRole
from . import auth


def get_effective_permission_keys(db, user_id: int) -> set[str]:
    rows = (
        db.query(Permission.key)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(UserRole, UserRole.role_id == RolePermission.role_id)
        .filter(UserRole.user_id == user_id, Permission.retired_at.is_(None))
        .distinct()
        .all()
    )
    return {row[0] for row in rows}


def user_has_protected_role(db, user_id: int) -> bool:
    return (
        db.query(UserRole.user_id)
        .join(Role, Role.id == UserRole.role_id)
        .filter(UserRole.user_id == user_id, Role.is_protected.is_(True))
        .first()
        is not None
    )


def require_permission(key: str):
    def dependency(
        current_user=Depends(auth.get_current_user),
        db=Depends(get_db),
    ):
        if key not in get_effective_permission_keys(db, current_user.id):
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "permission_denied",
                    "message": "You do not have permission to perform this action.",
                },
            )
        return current_user

    return dependency
