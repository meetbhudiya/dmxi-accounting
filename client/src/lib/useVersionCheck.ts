import { useEffect, useRef, useState } from "react";

const POLL_MS = 30_000; // check every 30 seconds

export function useVersionCheck() {
  const baseline = useRef<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { token } = await res.json() as { token: string };

        if (baseline.current === null) {
          // First fetch — store as the baseline
          baseline.current = token;
        } else if (token !== baseline.current) {
          // Server was restarted with a new build
          setUpdateAvailable(true);
        }
      } catch {
        // Network error — ignore, will retry next poll
      }
    }

    check();
    const id = setInterval(check, POLL_MS);
    return () => clearInterval(id);
  }, []);

  return updateAvailable;
}
