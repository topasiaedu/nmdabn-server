import { createContext, useContext } from "react";

export type SettingsContextValue = {
  accessToken: string;
  workspaceId: string;
};

export const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * Consume SettingsContext inside any child of SettingsShell.
 * Throws if called outside a SettingsShell provider.
 */
export function useSettingsContext(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (ctx === null) {
    throw new Error("useSettingsContext must be used inside a SettingsShell component.");
  }
  return ctx;
}
