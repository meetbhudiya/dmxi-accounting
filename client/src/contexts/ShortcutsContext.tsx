import { createContext, useContext, useRef, useEffect } from "react";

type Ctx = { setNewAction: (fn: (() => void) | null) => void };

export const ShortcutsContext = createContext<Ctx>({ setNewAction: () => {} });

export function useRegisterNewShortcut(fn: () => void) {
  const { setNewAction } = useContext(ShortcutsContext);
  const ref = useRef(fn);
  ref.current = fn;

  useEffect(() => {
    setNewAction(() => ref.current());
    return () => setNewAction(null);
  }, [setNewAction]);
}
