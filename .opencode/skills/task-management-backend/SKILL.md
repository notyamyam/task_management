---
name: task-management-backend
description: FastAPI backend implementation for this task management repository. Use when changing backend/src routers, schemas, models, database behavior, authentication, projects, tasks, or email services.
---

# Task Management Backend

## Scope

- Work from `backend/`; it is independent from `frontend/` and the repository root is not a Python workspace.
- Read `backend/AGENTS.md` before editing.
- Follow the existing layers: handlers in `src/routers/`, validation in `src/schemas/`, tables in `src/models/`, security in `src/security/`, and database setup in `src/database.py`.

## Implementation

1. Trace the endpoint from request schema through authentication, authorization, query, mutation, and response schema before editing.
2. Enforce user ownership in every read, update, and delete query for tasks, projects, memberships, and account data.
3. Validate foreign-key relationships in the authenticated user's scope. Do not trust client-provided user IDs or ownership fields.
4. Use Pydantic schemas at the API boundary and avoid returning sensitive model fields.
5. Use precise status codes and stable error details. Do not reveal whether another user's protected resource exists.
6. Keep transactions atomic. Roll back failed writes when handling database errors, and refresh objects only when generated values are needed.
7. Preserve current endpoint contracts unless a coordinated contract change is requested. Task update/delete IDs remain query parameters.
8. Never log or expose secrets, password material, JWTs, reset tokens, or `.env` values.

## Database Safety

- There is no migration framework. `src.main` invokes schema migration helpers and `Base.metadata.create_all` during import.
- Do not import `src.main` for a syntax check or casual inspection.
- Call out schema changes explicitly, including the data migration and rollback implications.
- Keep PostgreSQL behavior in mind; do not assume SQLite semantics.

## Verification

- Run `.\.venv\Scripts\python.exe -m compileall -q src` from `backend/`.
- Add focused tests only if a test framework is introduced as part of the task; the repository currently has no configured backend test runner.
- Report database-dependent behavior that could not be exercised safely.
