"use client";

import { createContext, useContext } from "react";
import type { Role, TabId } from "@/lib/permissions";

export type PanelUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  works: { id: string; name: string }[];
};

type PanelContextValue = {
  user: PanelUser;
  tabs: TabId[];
  goToTab: (tab: TabId) => void;
};

export const PanelContext = createContext<PanelContextValue | null>(null);

export function usePanel() {
  const value = useContext(PanelContext);
  if (!value) {
    throw new Error("usePanel precisa estar dentro do PanelShell.");
  }
  return value;
}
