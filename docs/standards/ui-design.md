# UI Design

A practical foundation for clean, consistent, accessible interfaces. Tokens live in `apps/web/src/app/app.css`; springs live in `apps/web/src/app/motion/transitions.ts`.

1. **Visual hierarchy.** Use size, weight, color, and position to establish clear levels of importance and guide attention.
2. **Consistent spacing.** Use the 8px scale (8, 16, 24, 32, 40, 48, 64) through the `--space-*` tokens.
3. **Visual grouping.** Keep related elements 8–16px apart and separate unrelated sections by 32–48px.
4. **Consistent alignment.** Align to shared edges, baselines, or grids.
5. **Typographic hierarchy.** At most 2 font families, 3 weights, and 6 reusable text styles. Line height 1.0–1.2 for headings, 1.4–1.6 for body.
6. **Intentional whitespace.** Let negative space carry balance and emphasis instead of decoration.
7. **Accessible contrast.** WCAG AA: 4.5:1 for normal text, 3:1 for large text.
8. **Accessible interactions and feedback.** Touch targets of 44–48px, visible hover and keyboard focus, and clear loading, success, and error states.
9. **Layout stability and purposeful motion.** Reserve space for changing content. Animate only to explain a transition, with the shared springs, and honor `prefers-reduced-motion`.
10. **Responsive design.** Adapt to screen size, orientation, and text scaling while keeping hierarchy, alignment, and usability.
