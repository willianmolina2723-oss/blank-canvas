import { useState, createContext, useContext, ReactNode } from 'react';

interface SidebarState {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarState>({ collapsed: false, setCollapsed: () => {} });

export function useSidebarState() {
  return useContext(SidebarContext);
}

export function SidebarStateProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}
