# Frontend Rules

## Scope And Structure

- Run all JavaScript commands from `frontend/`; the repository root is not a JavaScript workspace.
- Keep routing and shared dashboard state in `src/App.jsx`, API configuration in `src/components/api.jsx`, and feature UI in `src/components/`.
- Preserve the existing React 19, React Router 7, Axios, Tailwind CSS 4, Lucide React, and React Toastify stack. Do not add a UI or state library without a concrete need.

## UI And Interaction

- Keep every module and component visually compact and consistent with the existing interface.
- Build responsive layouts for desktop and mobile without hiding required actions or information.
- Every enabled button must use a pointer cursor. With Tailwind CSS, include `cursor-pointer`; disabled buttons must communicate their disabled state.
- Every destructive action must open an accessible confirmation dialog before sending the delete request.
- Always use a drawer, not a modal dialog, when editing an existing entity.
- Navigation submenus must open on hover and remain operable by keyboard and touch.
- Use semantic controls, explicit form labels, visible keyboard focus, and meaningful dialog titles.
- Provide clear loading, error, empty, success, and disabled states. Do not use toast notifications as the only feedback for critical errors.

## React And API

- Prefer direct, readable state flow. Add abstractions only when they remove real duplication or clarify ownership.
- Clean up effects that can outlive a component and guard against stale async responses.
- Keep authentication compatible with localStorage key `token` and the Axios interceptor.
- Preserve the distinct login responses: `/users/login` returns `token`, while `/users/token` returns `access_token`.
- Keep task update and delete IDs in query parameters unless the backend contract changes at the same time.

## Verification

- Run `npm run lint` and then `npm run build` after frontend changes.
- Check interaction-heavy changes at desktop and narrow viewport sizes when browser tooling is available.
