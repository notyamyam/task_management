---
name: appealing-tailwind-ui
description: Builds and redesigns appealing, polished frontend UI with React and Tailwind CSS. Use when creating pages or components, improving visual design, making a UI responsive, or when the user asks for a modern, beautiful, polished, or professional interface.
---

# Appealing Tailwind UI

Create distinctive, production-quality interfaces rather than generic template layouts. Preserve an existing product's visual language when one is established; otherwise, choose a clear visual direction before writing code.

## Project Context

- Work in `frontend/` for frontend commands.
- Use React 19, JavaScript/JSX, Vite, Tailwind CSS 4, Lucide React, React Router, and React Toastify.
- Prefer Tailwind utility classes for new UI. Keep `src/index.css` limited to shared defaults and design tokens, and retain scoped CSS only where it already serves existing screens.
- Do not add a UI or icon library when the installed stack can satisfy the design.
- Run `npm run lint` and `npm run build` from `frontend/` after implementation.

## Workflow

1. Inspect the current page, nearby components, global styles, and installed dependencies before editing.
2. Identify the page's purpose, primary action, content hierarchy, interaction states, and likely user journey.
3. Select one coherent visual direction suited to the product. Define its typography, palette, spacing rhythm, surface treatment, and signature visual detail.
4. Implement the smallest maintainable component structure that supports the design.
5. Check desktop and mobile layouts, keyboard use, loading and error states, empty states, and long or unexpected content.
6. Verify with the project's lint and build commands. Fix failures introduced by the work.

## Visual Direction

- Build a deliberate hierarchy with one dominant focal point and clearly subordinate content.
- Use a restrained palette with one purposeful accent rather than many unrelated colors.
- Use typography intentionally. Vary size, weight, tracking, and line height to create hierarchy; do not rely only on card borders.
- Prefer considered composition, useful whitespace, and occasional asymmetry over a uniform grid of interchangeable cards.
- Add depth selectively through layered surfaces, borders, shadows, gradients, or subtle texture. Do not use all of them everywhere.
- Repeat a recognizable motif such as a particular radius, border style, accent shape, or spacing rhythm to make the interface feel cohesive.
- Use Lucide icons only when they clarify meaning. Give icon-only controls accessible labels.
- Keep motion subtle and functional. Favor short transitions for hover, focus, expansion, and state changes; respect `prefers-reduced-motion` when adding significant animation.

## Avoid Generic UI

- Do not default to a centered hero, three equal feature cards, excessive pill-shaped elements, or gradients used only as decoration.
- Do not wrap every section in a card. Use spacing, alignment, typography, and dividers to establish structure.
- Do not make every element rounded. Match radius to the chosen visual direction and component function.
- Do not use placeholder copy when meaningful product language can be inferred from existing functionality.
- Do not sacrifice usability for novelty. Decorative elements must not obscure content, reduce contrast, or intercept interaction.
- Do not rewrite working behavior merely to support a visual refresh.

## Responsive Design

- Design mobile and desktop intentionally instead of merely stacking desktop columns.
- Keep primary actions easy to reach and forms comfortable to complete at narrow widths.
- Use fluid sizing and bounded content widths where appropriate.
- Prevent horizontal overflow and test long titles, labels, and user-generated content.
- Ensure touch targets are at least approximately 44 by 44 pixels.
- Hide content only when it is genuinely nonessential; do not remove required actions on mobile.

## Accessibility And States

- Use semantic HTML and explicit form labels.
- Maintain readable contrast and never rely on color alone to communicate status.
- Provide visible `focus-visible` styles for every interactive element.
- Preserve logical keyboard and screen-reader order when changing visual layout.
- Include disabled, hover, focus, active, loading, error, success, and empty states when relevant.
- Use `aria-live` or the existing toast system for important asynchronous feedback.

## React Guidance

- Keep state close to where it is used and derive values during render when possible.
- Avoid unnecessary `useEffect`, `useMemo`, and `useCallback`.
- Reuse components when there is real repeated behavior or presentation, not merely to reduce line count.
- Preserve routing, API contracts, authentication behavior, and existing event handling.
- Use stable keys derived from data rather than array indexes for dynamic lists.

## Completion Checklist

- The result has a clear, product-appropriate visual identity.
- The primary action and information hierarchy are immediately understandable.
- Desktop and mobile layouts are complete and free of overflow.
- Controls have labels, visible focus states, adequate contrast, and useful feedback.
- Loading, error, and empty states are handled where applicable.
- No unnecessary dependencies were introduced.
- `npm run lint` and `npm run build` pass from `frontend/`.
