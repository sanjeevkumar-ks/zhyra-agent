import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, RefreshCw, Check } from "lucide-react";

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false);
      setJustReconnected(true);
      setTimeout(() => setJustReconnected(false), 3000);
    }
    function handleOffline() {
      setIsOffline(true);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 rounded-full border border-amber-500/30 bg-[#0F172A]/95 px-4 py-2 text-[12.5px] font-medium text-amber-300 shadow-xl backdrop-blur-md"
        >
          <WifiOff size={15} className="animate-pulse text-amber-400" />
          <span>You are currently offline. Retrying workspace connections...</span>
        </motion.div>
      )}

      {justReconnected && !isOffline && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border border-emerald-500/30 bg-[#0F172A]/95 px-4 py-2 text-[12.5px] font-medium text-emerald-300 shadow-xl backdrop-blur-md"
        >
          <Check size={15} className="text-emerald-400" />
          <span>Network re-established. Workspace synced.</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
