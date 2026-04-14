/**

 * Builds Authorization and workspace headers for settings UI `fetch` calls from localStorage.

 *

 * @returns Empty object during SSR or when `auth_token` / `workspace_id` are missing.

 */

export function getAuthHeaders(): Record<string, string> {

  if (typeof window === "undefined") {

    return {};

  }

  const token = window.localStorage.getItem("auth_token");

  const workspaceId = window.localStorage.getItem("workspace_id");

  if (

    token === null ||

    token === "" ||

    workspaceId === null ||

    workspaceId === ""

  ) {

    return {};

  }

  return {

    Authorization: `Bearer ${token}`,

    "X-Workspace-Id": workspaceId,

  };

}


