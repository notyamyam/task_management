from fastapi import APIRouter

from . import operations, projects, roles, tasks, users


router = APIRouter(prefix="/admin", tags=["Admin"])
router.include_router(roles.router)
router.include_router(users.router)
router.include_router(projects.router)
router.include_router(tasks.router)
router.include_router(operations.router)
