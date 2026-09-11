# Repository Guide

## Boundaries

- This is two independent projects, not a root workspace; run JavaScript commands from `frontend/` and Python commands from `backend/`.
- The browser entrypoint is `frontend/src/main.jsx`; `App.jsx` owns the `/` and `/tasks` routes, while `components/api.jsx` owns the backend URL and auth interceptors.
- The API entrypoint is `backend/src/main.py`; route handlers live in `src/routers/`, SQLAlchemy tables in `src/models/`, and request schemas in `src/schemas/`.

## Commands

- Frontend install: `npm ci`
- Frontend dev server: `npm run dev`
- Frontend verification: `npm run lint` then `npm run build`
- Backend install on Windows: `.\.venv\Scripts\python.exe -m pip install -r requirements.txt`
- Backend dev server, run from `backend/`: `.\.venv\Scripts\python.exe -m uvicorn src.main:app --reload`
- Backend has no test, lint, formatter, or typecheck configuration; the available focused syntax check is `.\.venv\Scripts\python.exe -m compileall -q src`.

## Frontend Stack and Style

- The frontend uses React 19 with JavaScript/JSX, Vite 8, React Router 7, Axios, Lucide React, and React Toastify.
- Tailwind CSS 4 is integrated through `@tailwindcss/vite` and imported in `frontend/src/index.css`. Prefer Tailwind utilities for new component UI; keep global CSS focused on shared defaults and retain scoped legacy CSS where it already serves the task screens.
- Build responsive, accessible interfaces with explicit labels, visible keyboard focus, and clear loading and error feedback. Preserve the existing visual language and avoid adding UI libraries unless the task requires one.

## Runtime Contracts

- `backend/.env` is loaded relative to the process working directory and must provide `DATABASE_URL`, `SECRET_KEY`, and `ALGORITHM`; `ACCESS_TOKEN_EXPIRE_MINUTES` is optional and defaults to 30. Do not commit or expose its values.
- Importing `src.main` immediately connects through `DATABASE_URL` and runs `Base.metadata.create_all`; there is no migration system. Even an import-based check can therefore touch the configured database.
- The frontend API base URL is hard-coded to `http://localhost:8000/`. Authentication is a JWT stored as localStorage key `token` and attached as `Authorization: Bearer ...`.
- Preserve the distinct login response contracts: JSON login at `/users/login` returns `token`, while OAuth form login at `/users/token` returns `access_token`.
- Task routes are authenticated and user-scoped. Update and delete IDs are query parameters (`?id=...`), not path segments.

## Setup Traps

- `backend/requirements.txt` is UTF-16LE, unlike the source files. Preserve or deliberately normalize its encoding when editing it.
- `/users/token` uses `OAuth2PasswordRequestForm`, which requires `python-multipart`. Version 0.0.32 exists in the current `.venv` but is missing from `requirements.txt`; install it explicitly for a fresh environment until the manifest is corrected.
- No project tests or CI workflows exist. Ignore dependency-owned tests under `frontend/node_modules/`; they are not repository tests.
