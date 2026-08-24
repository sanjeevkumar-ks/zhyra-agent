import { useEffect } from "react";
import { useAuthStore, applyTheme } from "../store/useAuthStore";

/**
 * Hook to enforce Light Mode on specific pages (e.g. Auth / Signin / Signup / Onboarding)
 * as requested by platform rules. Automatically restores user's chosen theme on unmount.
 */
export function useLightModeOnly() {
  const theme = useAuthStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.classList.remove("dark");

    return () => {
      applyTheme(theme);
    };
  }, [theme]);
}
