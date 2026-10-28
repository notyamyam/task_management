"""Create the repeatable demo accounts and collaboration data."""

import os
import sys

from ..database import initialize_database, session
from ..models import Project, ProjectMember, Task, User
from ..security.auth import hash_password


DEMO_PASSWORD = os.getenv("SEED_PASSWORD") or "password123"
EMAIL_DOMAIN = os.getenv("SEED_EMAIL_DOMAIN", "corner.com").strip().lower()
SHARED_PROJECT_NAME = "2026 Product Operations Roadmap"
USERS = (
    ("Olivia", "Bennett"),
    ("Marcus", "Reed"),
    ("Priya", "Shah"),
    ("Ethan", "Cole"),
    ("Sofia", "Martinez"),
    ("Daniel", "Kim"),
    ("Ava", "Thompson"),
    ("Noah", "Williams"),
    ("Maya", "Patel"),
    ("Lucas", "Morgan"),
)
PERSONAL_PROJECTS = (
    "Q4 Product Launch",
    "Customer Onboarding Revamp",
    "Platform Reliability Initiative",
    "Enterprise Reporting Upgrade",
    "Mobile Experience Refresh",
    "Revenue Operations Planning",
    "Security Readiness Program",
    "Support Workflow Improvement",
    "Data Quality Improvement",
    "Partner Enablement Program",
)


def demo_email(index: int) -> str:
    first_name, last_name = USERS[index - 1]
    return f"{first_name}.{last_name}@{EMAIL_DOMAIN}".lower()


def demo_name(index: int) -> tuple[str, str]:
    return USERS[index - 1]


def get_or_create_user(db, index: int) -> User:
    email = demo_email(index)
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        user = User(email=email)
        db.add(user)

    first_name, last_name = demo_name(index)
    user.password = hash_password(DEMO_PASSWORD)
    user.first_name = first_name
    user.last_name = last_name
    user.status = "active"
    user.must_change_password = False
    return user


def get_or_create_project(db, name: str, owner: User) -> Project:
    project = db.query(Project).filter(Project.name == name).first()
    if project is None:
        project = Project(name=name, description="Seeded demo project", user_id=owner.id)
        db.add(project)
        db.flush()
    elif project.user_id != owner.id:
        raise RuntimeError(f"Project already exists with a different owner: {name}")
    return project


def seed_demo_data(db):
    users = [get_or_create_user(db, index) for index in range(1, len(USERS) + 1)]
    db.flush()

    shared_project = get_or_create_project(db, SHARED_PROJECT_NAME, users[0])

    for user in users[1:]:
        membership = (
            db.query(ProjectMember)
            .filter(
                ProjectMember.project_id == shared_project.id,
                ProjectMember.user_id == user.id,
            )
            .first()
        )
        if membership is None:
            db.add(ProjectMember(project_id=shared_project.id, user_id=user.id))

    for index, user in enumerate(users, start=1):
        get_or_create_project(db, PERSONAL_PROJECTS[index - 1], user)
        first_name, last_name = demo_name(index)
        task_title = f"{first_name} {last_name}: complete quarterly planning"
        task = (
            db.query(Task)
            .filter(
                Task.project_id == shared_project.id,
                Task.title == task_title,
            )
            .first()
        )
        if task is None:
            db.add(
                Task(
                    title=task_title,
                    description="Complete the quarterly planning review and share the next steps.",
                    user_id=users[0].id,
                    updated_by_user_id=users[0].id,
                    project_id=shared_project.id,
                    assignee_user_id=user.id,
                    tags=[{"name": "demo", "color": "blue"}],
                    priority="medium",
                )
            )

    db.commit()
    return users


def main() -> int:
    try:
        initialize_database()
        with session() as db:
            try:
                users = seed_demo_data(db)
            except Exception:
                db.rollback()
                raise
    except Exception as error:
        print(f"Demo data seeding failed: {error}", file=sys.stderr)
        return 1

    print(
        f"Seeded {len(users)} demo users, one shared project, ten personal projects, "
        "and ten assigned tasks."
    )
    print(f"Password for every demo user: {DEMO_PASSWORD}")
    print("Demo users:")
    for user in users:
        print(f"  {user.email}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
