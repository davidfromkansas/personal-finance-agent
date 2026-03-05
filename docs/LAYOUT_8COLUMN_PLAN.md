# 8-Column Layout Plan

## Goals

- **Single grid system:** All dashboard (and app) modules sit on an **8-column grid**.
- **Whole-column widths:** Every module spans a whole number of columns (1–8).
- **Top alignment:** Modules are aligned to the top; any empty space appears below, with consistent spacing between modules (no extra top margin pushing content down).

---

## 1. Grid definition

- **Columns:** 8 equal columns (`repeat(8, 1fr)` or equivalent).
- **Gap:** One consistent gap for both rows and columns (e.g. `1.5rem` / `24px`) so spacing between modules is uniform.
- **Container:** Max-width can stay as today (e.g. `1280px`) with horizontal padding; the **content area** inside uses the 8-column grid.
- **Implementation:** Use CSS Grid on the main content wrapper, e.g. `grid-template-columns: repeat(8, 1fr)` and `gap: 1.5rem`.

---

## 2. Module width = whole columns

- Each module has a **column span** in the range 1–8.
- No half-columns; total spans in a row can be ≤ 8 (e.g. 5+3, 4+4, 8, 3+3+2).
- In Tailwind (with a custom grid or arbitrary values), modules use e.g. `col-span-3`, `col-span-5`, etc. If you use a shared grid, you can add a small helper or convention, e.g. `grid-col-3` = span 3 columns.

---

## 3. Top alignment and spacing

- **Top alignment:**  
  - Use `align-items: start` (or `align-self: start` on items) on the grid so modules don’t stretch vertically and sit at the top of their row.
- **No extra top space:**  
  - Keep the main content’s top padding small (e.g. same as side padding or slightly more) so the first row of modules is shifted up and not pushed down by large top margin.
- **Spacing between modules:**  
  - Use only the **grid gap** (and optional internal card padding). Avoid extra margin on individual modules so the “space above” is minimized and the gap between modules stays consistent (e.g. 1.5rem on all sides of each module).

Result: content starts near the top of the viewport, modules align to the top of each row, and the only vertical space between rows is the grid gap.

---

## 4. Suggested column allocation (dashboard)

| Module                     | Columns | Notes                    |
|----------------------------|---------|--------------------------|
| Spending (charts)          | 5       | Main focus, wider        |
| Recent Transactions       | 3       | Fits beside spending     |
| Net Worth + Connections   | 4       | Left half of second row  |
| Investment Portfolio      | 4       | Right half of second row |
| (Future) Subscriptions    | e.g. 2–3| Can sit under spending or in a new row |

**Row 1:** `[Spending: 5] [Transactions: 3]`  
**Row 2:** `[Net Worth + Connections: 4] [Investment Portfolio: 4]`

If you add Subscriptions later, examples:  
- Row 1: Spending 5 + Transactions 3; Row 2: Subscriptions 2 + Net Worth 3 + Investments 3 (or Subscriptions 3 + Net Worth 2 + Investments 3), or  
- Keep Row 1 and 2 as above and add a third row with Subscriptions spanning 2–3 columns.

---

## 5. Responsive behavior

- **Desktop (e.g. ≥1024px):** Use the full 8-column grid and the spans above.
- **Tablet / narrow:** Either:
  - **Option A:** Same 8 columns, but some modules stack (e.g. full-width by giving them `col-span-8` below a breakpoint), or  
  - **Option B:** Reduce to 4 columns and map spans (e.g. 5→4, 3→4) so each “row” becomes a single column.
- **Mobile:** Single column; every module is full-width (span 8 or 4 depending on base grid).

---

## 6. Implementation checklist

- [ ] Add a single grid container for the dashboard content with `grid-template-columns: repeat(8, 1fr)` and a fixed `gap` (e.g. `gap-6`).
- [ ] Set `align-items: start` on the grid so all modules are top-aligned.
- [ ] Assign each module a `col-span-{n}` (n = 1–8) and remove any conflicting flex/max-width that would fight the grid.
- [ ] Reduce main content top padding so the first row sits higher (e.g. `pt-5` or `pt-6` instead of `py-8`), keeping horizontal padding for edge margin.
- [ ] Apply the same 8-column grid and top-alignment rules to other app views (e.g. Transactions, Investments, Accounts) so the whole app uses one layout system.
- [ ] (Optional) Add a small CSS class or Tailwind theme extension for `grid-cols-8` and `col-span-*` if not already available.

---

## 7. Files to touch

- **Dashboard:** `src/pages/LoggedInPage.jsx` — replace current flex layout with the grid wrapper and column spans for each module.
- **Global:** If you want a shared wrapper or layout component, consider `src/App.jsx` or a dedicated `DashboardLayout.jsx` that provides the 8-col grid and top alignment; then use it on other pages (Transactions, Investments, etc.) for consistency.

Once this is in place, any new module (e.g. Subscriptions) gets a column span (whole number 1–8) and sits in the grid with the same top alignment and gap.
