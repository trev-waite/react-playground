# @react-playground/layout-sheet

Turn any screen into a sheet you can drag things around on, then snap every gap onto the spacing scale. Your markup and CSS stay as they are: the sheet only offsets items with CSS `translate`, so it works over flex, grid, or absolute layouts, and dragging writes to the DOM without re-rendering.

```tsx
import { SheetGuides, useSheet } from "@react-playground/layout-sheet/react";

function Screen() {
  const sheet = useSheet();
  return (
    <main ref={sheet.root}>
      <img ref={sheet.item("logo", { group: "header" })} />
      <h1 ref={sheet.item("title", { group: "header" })}>Hello</h1>
      <SheetGuides sheet={sheet} />
      <button onClick={() => sheet.tidy()}>Tidy</button>
    </main>
  );
}
```

- **Drag** with a pointer, or focus an item and use the arrow keys (Shift for 8px). Alt, Ctrl, and Meta are left to the screen.
- **`sheet.tidy(planner?)`** averages each kind of gap the user made (the inset from the edge, the gutter inside each `group`, the gap between groups), snaps it to the scale (8px steps, or 2 and 4 when tiny), and glides everything into place. Groups sit at least 8px further apart than any gutter. Pass your own `SheetPlanner`, such as an AI one, to plan differently.
- **`sheet.undo()`** glides back. **`sheet.keepInPlace(change)`** lets the layout underneath change (a new line height) without moving anything on screen; wrap React updates in `flushSync`.
- **`<SheetGuides>`** draws each gap: amber while it is off the scale, green once it is on.
- **`sheet.offsets()`** and **`sheet.setOffsets()`** save and restore a session.

Without React, `new Sheet()` from the root entry does the same: `sheet.attach(root)`, then `sheet.register(element, { id, group })`. The pure layout math (`tidy`, `measureGaps`, `snapSpacing`) needs no DOM at all.

Spacing Tidy (`apps/web/src/live/tools/SpacingTidy`) is the showcase.
