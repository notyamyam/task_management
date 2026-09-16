from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_

from ..database import get_db
from ..models import Project, ProjectMember, User
from ..schemas import ProjectCreate, ProjectMemberCreate
from ..security import auth

router = APIRouter(prefix="/projects", tags=["Projects"])


def serialize_user(user: User):
    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
    }


def get_accessible_project(project_id, current_user, db):
    project = (
        db.query(Project)
        .outerjoin(ProjectMember, ProjectMember.project_id == Project.id)
        .filter(
            Project.id == project_id,
            or_(Project.user_id == current_user.id, ProjectMember.user_id == current_user.id),
        )
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def serialize_project(project: Project, db):
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "user_id": project.user_id,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "member_count": db.query(ProjectMember)
        .filter(ProjectMember.project_id == project.id)
        .count(),
    }


def get_current_complete_user(current_user=Depends(auth.get_current_user)):
    if not current_user.first_name or not current_user.last_name:
        raise HTTPException(
            status_code=403,
            detail="Complete your profile before managing projects",
        )
    return current_user


@router.post("/create-project")
def create_project(
    project: ProjectCreate,
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    new_project = Project(**project.model_dump(), user_id=current_user.id)
    db.add(new_project)
    db.commit()
    db.refresh(new_project)
    return serialize_project(new_project, db)


@router.get("/get-projects")
def get_projects(
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    projects = (
        db.query(Project)
        .outerjoin(ProjectMember, ProjectMember.project_id == Project.id)
        .filter(
            or_(
                Project.user_id == current_user.id,
                ProjectMember.user_id == current_user.id,
            )
        )
        .order_by(Project.name.asc())
        .distinct()
        .all()
    )
    return [serialize_project(project, db) for project in projects]


@router.get("/{project_id}")
def get_project(
    project_id: int,
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    project = get_accessible_project(project_id, current_user, db)
    owner = db.query(User).filter(User.id == project.user_id).first()
    members = (
        db.query(User)
        .join(ProjectMember, ProjectMember.user_id == User.id)
        .filter(ProjectMember.project_id == project.id)
        .order_by(User.first_name.asc(), User.last_name.asc(), User.email.asc())
        .all()
    )
    return {
        **serialize_project(project, db),
        "is_owner": project.user_id == current_user.id,
        "owner": serialize_user(owner),
        "members": [serialize_user(member) for member in members],
    }


@router.get("/{project_id}/available-users")
def get_available_project_users(
    project_id: int,
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    project = get_accessible_project(project_id, current_user, db)
    if project.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the project owner can add members")

    member_ids = db.query(ProjectMember.user_id).filter(
        ProjectMember.project_id == project.id
    )
    users = (
        db.query(User)
        .filter(User.id != project.user_id, ~User.id.in_(member_ids))
        .order_by(User.first_name.asc(), User.last_name.asc(), User.email.asc())
        .all()
    )
    return [serialize_user(user) for user in users]


@router.post("/{project_id}/members", status_code=status.HTTP_201_CREATED)
def add_project_member(
    project_id: int,
    payload: ProjectMemberCreate,
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    project = get_accessible_project(project_id, current_user, db)
    if project.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the project owner can add members")
    if payload.user_id == project.user_id:
        raise HTTPException(status_code=409, detail="The project owner is already included")

    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing_member = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project.id,
            ProjectMember.user_id == user.id,
        )
        .first()
    )
    if existing_member:
        raise HTTPException(status_code=409, detail="User is already a project member")

    db.add(ProjectMember(project_id=project.id, user_id=user.id))
    db.commit()
    return serialize_user(user)
