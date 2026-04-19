# Project Context — Global State

## Definition / scope

`ProjectContext` is a React Context that holds the globally selected **workspace** and
**project** for the entire app. It was introduced in the 2026-04-13 dashboard architecture
redesign, replacing the per-dashboard workspace/project dropdown selectors that lived inside
`DashboardShell`.

File: `src/lib/project-context.tsx`

---

## How it works here

### Provider placement

`<ProjectProvider>` wraps the root layout in `app/layout.tsx`:

```tsx
<ProjectProvider>
  <NavTabs />
  <main>{children}</main>
</ProjectProvider>
```

This makes `workspaceId`, `projectId`, and `selectedProject` available to every page including
dashboard pages, settings pages, and the nav bar.

### State lifecycle

1. `useSupabaseSession()` provides `accessToken` and `loggedIn`.
2. On login: fetch `GET /api/workspaces` → take the first workspace (Phase 1 assumption: one workspace per account).
3. Fetch `GET /api/projects?workspace_id=…` for that workspace.
4. Restore previously selected `projectId` from `localStorage` key `nmdabn_project_id`; default to first project if not set or not found.
5. On `setProjectId(id)`: update state + write to `localStorage`.

### Exported interface

```typescript
export interface ProjectContextValue {
  workspaceId: string | null;
  workspaceName: string | null;
  projects: ProjectItem[];
  projectId: string | null;
  setProjectId: (id: string) => void;
  selectedProject: ProjectItem | null;
  loading: boolean;
  error: string | null;
}
```

`ProjectItem` is a lean subset of the project row: `{ id, name, ghl_location_id, traffic_agency_line_tags, traffic_breakdown_fields }`.

### Hook

```typescript
import { useProjectContext } from "@/lib/project-context";
const { projectId, selectedProject, workspaceId } = useProjectContext();
```

---

## Project selector in nav bar

`NavTabs.tsx` renders a project `<select>` dropdown in the center of the nav bar.
- Visible when `loggedIn && !isSettingsRoute`.
- Options sourced from `useProjectContext().projects`.
- On change: calls `setProjectId(selected)` → persisted to `localStorage`.

---

## Relationship to DashboardContext

`DashboardShell` reads from `useProjectContext()` and passes a derived `DashboardContext` to
each dashboard page via React Context. `DashboardContext` now carries:
- `workspaceId`, `workspaceName`
- `projectId`, `projectName`
- `projectAgencyLineTags`, `projectBreakdownFields`
- `ghlLocationId`

No run or date fields remain in `DashboardContext`.

---

## Assumptions and limitations

- **Single workspace per account** (Phase 1): the context takes the first workspace from the
  list. Multi-workspace support would require a workspace selector similar to the old
  `DashboardShell` dropdown.
- `localStorage` is used for persistence. On SSR (server components), the initial render
  always has `projectId = null`; hydration resolves on the client.

---

## Related

- [[Dashboard-Architecture-Redesign-All-Runs]] — implementation source note
- [[All-Runs-Column-Table]] — consumes `projectId` + `workspaceId` for dashboard data fetches
- [[App-Navigation-Structure]] — nav bar where the project selector lives
- `../src/lib/project-context.tsx`
- `../src/components/NavTabs.tsx`
- `../src/components/DashboardShell.tsx`
- `../src/components/DashboardContext.ts`
- `../app/layout.tsx`

## Contradictions / history

- The previous `DashboardShell.tsx` managed workspace + project + run selection locally via
  component state. That state has been fully removed and replaced by `ProjectContext`.
