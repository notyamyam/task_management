# Backend Rules

## Scope And Structure

- Run all Python commands from `backend/`; the repository root is not a Python workspace.
- Keep route handlers in `src/routers/`, request and response validation in `src/schemas/`, SQLAlchemy tables in `src/models/`, and authentication code in `src/security/`.
- Keep handlers focused. Extract service logic only when it is reused or when a handler becomes difficult to reason about.
- Do not add dependencies without a concrete need. Preserve the encoding of `requirements.txt` when editing it.

## API And Security

- Require authentication for task, project, membership, and account operations unless an endpoint is explicitly public.
- Enforce ownership and membership in database queries for every protected read, update, and delete. Never rely on frontend filtering.
- Do not trust client-supplied ownership fields or user IDs.
- Return Pydantic response schemas and exclude password hashes, tokens, secrets, and internal-only fields.
- Use precise HTTP status codes and consistent error details without revealing another user's protected resources.
- Preserve existing endpoint contracts unless a coordinated contract change is requested. Task update and delete IDs are query parameters.
- Preserve the two login contracts: `/users/login` returns `token`; `/users/token` returns `access_token`.

## Database And Configuration

- Keep writes atomic and roll back the SQLAlchemy session after handled database failures.
- Treat schema changes as migrations even though no migration framework is configured. Explain upgrade, existing-data, and rollback effects.
- Do not import `src.main` only to validate code: importing it connects through `DATABASE_URL`, runs schema migration helpers, and calls `Base.metadata.create_all`.
- Never read, print, commit, or expose values from `backend/.env`.

## Verification

- Run `.\.venv\Scripts\python.exe -m compileall -q src` after backend changes.
- The repository has no configured backend test, lint, formatter, or type-check command. Do not claim those checks ran unless the project gains them.
- Clearly report behavior that requires a live database, email provider, or external OAuth service and could not be exercised safely.
