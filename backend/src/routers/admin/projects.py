from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_

from ...database import get_db
from ...models import Project, ProjectMember, Task, User
from ...schemas.admin import (
    AdminProjectCreate,
    AdminProjectMemberCreate,
    AdminProjectMemberResponse,
    AdminProjectResponse,
    AdminProjectTransfer,
    AdminProjectUpdate,
)
from ...security.authorization import require_permission
from ...services.admin import (
    audit_admin_action,
    commit_admin_mutation,
    conflict,
    flush_admin_mutation,
    transfer_project,
)


router = APIRouter()


def get_project_or_404(db, project_id: int, *, lock: bool = False) -> Project:
    query = db.query(Project).filter(Project.id == project_id)
    if lock:
        query = query.with_for_update()
    project = query.one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def serialize_project(project: Project) -> AdminProjectResponse:
    return AdminProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        owner_id=project.user_id,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


def set_pagination_headers(response: Response, *, total: int, page: int, page_size: int) -> None:
    response.headers["X-Total-Count"] = str(total)
    response.headers["X-Page"] = str(page)
    response.headers["X-Page-Size"] = str(page_size)
    response.headers["X-Total-Pages"] = str((total + page_size - 1) // page_size)


def get_active_user_or_422(db, user_id: int, *, code: str, message: str) -> User:
    user = (
        db.query(User)
        .filter(User.id == user_id, User.status == "active")
        .with_for_update()
        .one_or_none()
    )
    if user is None:
        raise HTTPException(status_code=422, detail={"code": code, "message": message})
    return user


@router.get("/projects", response_model=list[AdminProjectResponse])
def list_projects(
    response: Response,
    search: str | None = None,
    owner_id: int | None = Query(default=None, ge=1),
    sort_by: Literal["name", "created_at", "updated_at"] = "name",
    sort_order: Literal["asc", "desc"] = "asc",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db=Depends(get_db),
    actor=Depends(require_permission("projects.read")),
):
    query = db.query(Project)
    if search and (term := search.strip().lower()):
        pattern = f"%{term}%"
        query = query.filter(
            or_(
                func.lower(Project.name).like(pattern),
                func.lower(Project.description).like(pattern),
            )
        )
    if owner_id is not None:
        query = query.filter(Project.user_id == owner_id)

    total = query.count()
    sort_column = {
        "name": Project.name,
        "created_at": Project.created_at,
        "updated_at": Project.updated_at,
    }[sort_by]
    order = sort_column.asc() if sort_order == "asc" else sort_column.desc()
    projects = (
        query.order_by(order, Project.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    set_pagination_headers(response, total=total, page=page, page_size=page_size)
    return [serialize_project(project) for project in projects]


@router.post(
    "/projects",
    response_model=AdminProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_project(
    payload: AdminProjectCreate,
    db=Depends(get_db),
    actor=Depends(require_permission("projects.create")),
):
    owner = get_active_user_or_422(
        db,
        payload.owner_id,
        code="active_owner_required",
        message="The project owner must be an active user.",
    )
    if db.query(Project.id).filter(Project.name == payload.name).first():
        raise conflict("project_name_in_use", "The project name is already in use.")

    project = Project(
        name=payload.name,
        description=payload.description,
        user_id=owner.id,
    )
    db.add(project)
    flush_admin_mutation(db)
    audit_admin_action(
        db,
        actor_user_id=actor.id,
        action="projects.create",
        resource_type="project",
        resource_id=project.id,
        target_user_id=owner.id,
    )
    commit_admin_mutation(db)
    db.refresh(project)
    return serialize_project(project)


@router.get("/projects/{project_id}", response_model=AdminProjectResponse)
def get_project(
    project_id: int,
    db=Depends(get_db),
    actor=Depends(require_permission("projects.read")),
):
    return serialize_project(get_project_or_404(db, project_id))


@router.patch("/projects/{project_id}", response_model=AdminProjectResponse)
def update_project(
    project_id: int,
    payload: AdminProjectUpdate,
    db=Depends(get_db),
    actor=Depends(require_permission("projects.update")),
):
    project = get_project_or_404(db, project_id, lock=True)
    changed_fields = payload.model_fields_set
    name_changed = "name" in changed_fields and payload.name != project.name
    description_changed = (
        "description" in changed_fields and payload.description != project.description
    )
    if name_changed and db.query(Project.id).filter(
        Project.name == payload.name, Project.id != project.id
    ).first():
        raise conflict("project_name_in_use", "The project name is already in use.")
    if name_changed:
        project.name = payload.name
    if description_changed:
        project.description = payload.description
    audit_admin_action(
        db,
        actor_user_id=actor.id,
        action="projects.update",
        resource_type="project",
        resource_id=project.id,
        metadata={
            "name_changed": name_changed,
            "description_changed": description_changed,
        },
    )
    commit_admin_mutation(db)
    db.refresh(project)
    return serialize_project(project)


@router.post("/projects/{project_id}/transfer", response_model=AdminProjectResponse)
def transfer_project_owner(
    project_id: int,
    payload: AdminProjectTransfer,
    db=Depends(get_db),
    actor=Depends(require_permission("projects.transfer")),
):
    project = get_project_or_404(db, project_id)
    new_owner = User(id=payload.new_owner_id)
    return serialize_project(transfer_project(project, new_owner, db, actor))


@router.get(
    "/projects/{project_id}/members",
    response_model=list[AdminProjectMemberResponse],
)
def list_project_members(
    project_id: int,
    response: Response,
    user_id: int | None = Query(default=None, ge=1),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db=Depends(get_db),
    actor=Depends(require_permission("project_members.read")),
):
    get_project_or_404(db, project_id)
    query = db.query(ProjectMember).filter(ProjectMember.project_id == project_id)
    if user_id is not None:
        query = query.filter(ProjectMember.user_id == user_id)
    total = query.count()
    members = (
        query.order_by(ProjectMember.user_id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    set_pagination_headers(response, total=total, page=page, page_size=page_size)
    return members


@router.post(
    "/projects/{project_id}/members",
    response_model=AdminProjectMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_project_member(
    project_id: int,
    payload: AdminProjectMemberCreate,
    db=Depends(get_db),
    actor=Depends(require_permission("project_members.create")),
):
    project = get_project_or_404(db, project_id, lock=True)
    user = get_active_user_or_422(
        db,
        payload.user_id,
        code="active_member_required",
        message="The project member must be an active user.",
    )
    if user.id == project.user_id:
        raise conflict(
            "project_owner_is_not_member",
            "The project owner is not a project member.",
        )
    existing = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project.id,
            ProjectMember.user_id == user.id,
        )
        .with_for_update()
        .one_or_none()
    )
    if existing:
        raise conflict("project_member_exists", "The user is already a project member.")

    member = ProjectMember(project_id=project.id, user_id=user.id)
    db.add(member)
    flush_admin_mutation(db)
    audit_admin_action(
        db,
        actor_user_id=actor.id,
        action="project_members.create",
        resource_type="project_member",
        resource_id=member.id,
        target_user_id=user.id,
    )
    commit_admin_mutation(db)
    db.refresh(member)
    return member


@router.delete(
    "/projects/{project_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_project_member(
    project_id: int,
    user_id: int,
    db=Depends(get_db),
    actor=Depends(require_permission("project_members.delete")),
):
    get_project_or_404(db, project_id, lock=True)
    member = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
        .with_for_update()
        .one_or_none()
    )
    if member is None:
        raise HTTPException(status_code=404, detail="Project membership not found")
    db.delete(member)
    audit_admin_action(
        db,
        actor_user_id=actor.id,
        action="project_members.delete",
        resource_type="project_member",
        resource_id=member.id,
        target_user_id=user_id,
    )
    commit_admin_mutation(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    confirm_cascade: bool = False,
    db=Depends(get_db),
    actor=Depends(require_permission("projects.delete")),
):
    project = get_project_or_404(db, project_id, lock=True)
    task_count = db.query(Task).filter(Task.project_id == project.id).count()
    member_count = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project.id)
        .count()
    )
    if task_count and not confirm_cascade:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "cascade_confirmation_required",
                "message": "Explicit confirmation is required to delete project tasks.",
                "task_count": task_count,
                "member_count": member_count,
            },
        )

    db.query(Task).filter(Task.project_id == project.id).delete(synchronize_session=False)
    db.query(ProjectMember).filter(ProjectMember.project_id == project.id).delete(
        synchronize_session=False
    )
    audit_admin_action(
        db,
        actor_user_id=actor.id,
        action="projects.delete",
        resource_type="project",
        resource_id=project.id,
        metadata={
            "task_count": task_count,
            "member_count": member_count,
            "cascade": bool(task_count),
        },
    )
    db.delete(project)
    commit_admin_mutation(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
