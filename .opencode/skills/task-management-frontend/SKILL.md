---
name: task-management-frontend
description: React frontend implementation for this task management repository. Use when changing frontend/src components, routes, Tailwind UI, authentication flows, Axios calls, projects, or tasks.
---

# Task Management Frontend

## Scope

- Work from `frontend/`; it is independent from `backend/` and the repository root is not a JavaScript workspace.
- Read `frontend/AGENTS.md` before editing.
- Start at `src/main.jsx` for bootstrapping, `src/App.jsx` for routes and shared layout state, and `src/components/api.jsx` for API behavior.
- Preserve React 19, React Router 7, Axios, Tailwind CSS 4, Lucide React, and React Toastify patterns already in use.

## Implementation

1. Trace state ownership and API calls before editing. Keep shared state in the nearest existing common owner and local interaction state in the component.
2. Preserve the JWT in localStorage key `token` and the Axios authorization interceptor.
3. Preserve login response differences: `/users/login` returns `token`; `/users/token` returns `access_token`.
4. Preserve task update/delete IDs as query parameters unless the backend contract is deliberately changed with the frontend.
5. Provide loading, error, empty, success, and disabled states where applicable. Do not rely on toast messages as the only accessible feedback for critical state.
6. Use semantic controls, explicit labels, keyboard-visible focus, and appropriate dialog behavior. Every destructive operation requires confirmation.
7. Keep layouts compact and responsive. Prefer Tailwind utilities for new UI and avoid expanding global CSS without a shared need.
8. Do not add a component abstraction until it removes real duplication or clarifies ownership.

## Verification

- Run `npm run lint` from `frontend/`.
- Run `npm run build` from `frontend/` after lint succeeds.
- For interaction-heavy changes, manually check desktop and narrow viewport behavior when browser tooling is available.
- Report any unverified browser behavior or backend contract assumption.
