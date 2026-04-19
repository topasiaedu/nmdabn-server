# UI Design System

## Definition / scope

The complete visual design language for the NM Media Dashboard app. Applies to every page: dashboards, settings, empty states, modals, and toasts. Derived from the UI/UX audit (2026-04-14). Implemented using Tailwind CSS v4 and `lucide-react` icons.

**Install required:** `npm install lucide-react`

---

## Colour tokens

| Token | Tailwind class | Hex | Use |
|-------|---------------|-----|-----|
| Primary | `indigo-600` | #4F46E5 | Active nav, primary buttons, focus rings, links |
| Primary hover | `indigo-700` | #4338CA | Primary button hover |
| Primary light | `indigo-50` | #EEF2FF | Info banners, active sidebar items bg |
| Primary light border | `indigo-200` | #C7D2FE | Info banner border |
| Page background | `slate-50` | #F8FAFC | `<body>` background |
| Surface | `white` | #FFFFFF | Cards, nav, sidebar |
| Border | `slate-200` | #E2E8F0 | Card borders, dividers, input borders |
| Text primary | `slate-900` | #0F172A | Headings, body text |
| Text secondary | `slate-700` | #334155 | Table cells, form values |
| Text muted | `slate-500` | #64748B | Secondary labels |
| Text caption | `slate-400` | #94A3B8 | Section headers, helper text, timestamps |
| Success | `emerald-600` | #059669 | Positive rates, sync success, active badge |
| Success light | `emerald-50` | #ECFDF5 | Success banner background |
| Warning | `amber-500` | #F59E0B | Missing config banners |
| Warning light | `amber-50` | #FFFBEB | Warning banner background |
| Warning border | `amber-200` | #FDE68A | Warning banner border |
| Error | `red-600` | #DC2626 | Destructive buttons, error messages |
| Error light | `red-50` | #FEF2F2 | Error banner background |

### Dashboard accent colours (used for tab icons and KPI card icons)

| Dashboard | Tailwind class |
|-----------|---------------|
| Traffic | `sky-600` |
| Show Up | `violet-600` |
| Agency | `emerald-600` |
| Buyer Behavior | `orange-600` |

---

## Typography

| Element | Classes |
|---------|---------|
| Page title (H1) | `text-2xl font-bold text-slate-900` |
| Section title (H2) | `text-lg font-semibold text-slate-800` |
| Card heading | `text-base font-semibold text-slate-800` |
| Section label (eyebrow) | `text-xs font-semibold uppercase tracking-wide text-slate-400` |
| Body text | `text-sm text-slate-700` |
| Helper / caption | `text-xs text-slate-400` |
| KPI metric number | `text-3xl font-bold text-slate-900` |
| Monospace (IDs, numbers) | `font-mono` |

---

## Button variants

Three variants only. Never use unstyled `<button>` elements.

### Primary
```
bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium
hover:bg-indigo-700
focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
disabled:opacity-50 disabled:cursor-not-allowed
```
Use for: create, save, submit, primary CTA.

### Secondary
```
bg-white border border-slate-200 text-slate-700 rounded-lg px-4 py-2 text-sm font-medium
hover:bg-slate-50
focus:outline-none focus:ring-2 focus:ring-slate-300
disabled:opacity-50 disabled:cursor-not-allowed
```
Use for: cancel, back, secondary actions, sync trigger.

### Destructive
```
bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-medium
hover:bg-red-700
focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
```
Use for: delete, remove, sign out (in dropdown).

### Ghost / icon button
```
text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg p-2
focus:outline-none focus:ring-2 focus:ring-slate-300
```
Use for: icon-only actions (copy, close, toggle show/hide).

### Small variant modifier
Add `px-3 py-1.5 text-xs` in place of `px-4 py-2 text-sm` for compact contexts (table row actions, filter bar).

---

## Input fields

All form inputs (text, email, password, number, select, textarea):
```
bg-white border border-slate-200 rounded-lg px-3 py-2
text-sm text-slate-900 placeholder:text-slate-400
focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
w-full
```

**Label above input:**
```html
<label>
  <span class="text-sm font-medium text-slate-700 mb-1 block">Field name</span>
  <input class="..." />
  <p class="text-xs text-slate-400 mt-1">Helper text here.</p>
</label>
```

**Password field:** Add a show/hide toggle button (Eye / EyeOff from lucide-react) inside the input as an absolute-positioned ghost button.

**Toggle switch (replaces checkbox for Active/Inactive):**
Styled pill toggle: `w-10 h-6 rounded-full bg-slate-200 checked:bg-indigo-600 relative`. Use a custom CSS implementation or a library; do not use a plain `<input type="checkbox">` for Active fields.

---

## Cards

Standard card:
```
bg-white rounded-xl border border-slate-200 shadow-sm p-6
```

Compact card (table container, form section):
```
bg-white rounded-xl border border-slate-200 shadow-sm
```
(padding applied to inner header/body sections separately)

---

## Tables

```html
<div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
  <table class="w-full text-left">
    <thead class="bg-slate-50 border-b border-slate-200">
      <tr>
        <th class="text-xs font-semibold uppercase tracking-wide text-slate-500 py-3 px-4">Column</th>
      </tr>
    </thead>
    <tbody>
      <tr class="border-b border-slate-100 even:bg-slate-50/50 hover:bg-slate-50">
        <td class="text-sm text-slate-700 py-3 px-4">Value</td>
      </tr>
    </tbody>
  </table>
</div>
```

**Numeric columns:** `text-right font-mono`

**Rate/percentage badge:**
- `>= 70%`: `bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 text-xs font-medium`
- `40–70%`: `bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 text-xs font-medium`
- `< 40%`: `bg-red-100 text-red-700 rounded-full px-2 py-0.5 text-xs font-medium`
- Null / `—`: `text-slate-300`

---

## Banners (inline alerts)

### Warning (missing config, empty state)
```
bg-amber-50 border-l-4 border-amber-500 rounded-r-lg p-4 flex items-start gap-3
```
Icon: `AlertTriangle` (lucide-react, `text-amber-500`, 16px). Text: `text-sm text-amber-800`. Link: `text-amber-700 underline font-medium`.

### Info (explanatory context)
```
bg-indigo-50 border border-indigo-200 rounded-lg p-4
```
Text: `text-sm text-indigo-800`.

### Success (sync completed)
```
bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center gap-2
```
Icon: `CheckCircle` (lucide-react, `text-emerald-600`, 16px). Text: `text-sm text-emerald-800`.

### Error
```
bg-red-50 border border-red-200 rounded-lg p-4
```
Text: `text-sm text-red-800`.

---

## KPI stat cards

Used at the top of each dashboard page.

```html
<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
  <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
    <div class="flex items-center gap-2 mb-3">
      <!-- lucide icon, 20px, dashboard accent colour -->
    </div>
    <p class="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">TOTAL LEADS</p>
    <p class="text-3xl font-bold text-slate-900">1,248</p>
  </div>
</div>
```

---

## Icons

Library: `lucide-react` (install: `npm install lucide-react`).

| Usage | Icon name |
|-------|-----------|
| Settings / Setup link | `Settings` |
| Sync / Refresh | `RefreshCw` |
| Warning banner | `AlertTriangle` |
| Success state | `CheckCircle` |
| Traffic dashboard | `Users` |
| Show Up dashboard | `BarChart2` |
| Agency dashboard | `TrendingUp` |
| Buyer Behavior dashboard | `ShoppingCart` |
| Copy to clipboard | `Copy` |
| Show password | `Eye` |
| Hide password | `EyeOff` |
| User avatar dropdown | `ChevronDown` |
| Sidebar item — project | `Circle` (small, filled) |
| New project | `Plus` |
| Delete / remove | `Trash2` |
| Edit | `Pencil` |
| Close / dismiss | `X` |
| External link | `ExternalLink` |

---

## Loading states

- **Full page load:** Centre a `text-sm text-slate-500` "Loading…" with a `RefreshCw` icon spinning (`animate-spin`). Do not leave the content area blank.
- **Button loading:** Replace button label with `<RefreshCw class="animate-spin w-4 h-4" />` + "Loading…" text. Keep button disabled.
- **Table loading:** Show 3–5 skeleton rows: `<div class="h-4 bg-slate-100 rounded animate-pulse w-full" />` in place of cell content.

---

## Related

- [[UI-UX-Audit-And-Redesign-Spec]] — source audit
- [[App-Navigation-Structure]] — nav implementation using this system
- [[Settings-IA-Redesign]] — settings layout using this system
- [[Dashboard-UX-Patterns]] — filter bar and KPI cards using this system
