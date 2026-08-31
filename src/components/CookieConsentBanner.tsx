import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Cookie, X } from "lucide-react";

export interface CookiePreferences {
  essential: boolean;
  analytics: boolean;
  functional: boolean;
  marketing: boolean;
}

const STORAGE_KEY = "zhyra_cookie_preferences";

export function getStoredCookiePreferences(): CookiePreferences | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function saveCookiePreferences(prefs: CookiePreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.error("Failed to save cookie preferences", e);
  }
}

const CATEGORIES: {
  key: keyof CookiePreferences;
  label: string;
  description: string;
  locked?: boolean;
}[] = [
  {
    key: "essential",
    label: "Essential",
    description: "Required for authentication, security, and core functionality.",
    locked: true,
  },
  {
    key: "analytics",
    label: "Analytics",
    description: "Helps us understand usage patterns and improve performance.",
  },
  {
    key: "functional",
    label: "Functional",
    description: "Remembers your preferences and workspace settings.",
  },
  {
    key: "marketing",
    label: "Marketing",
    description: "Used to deliver relevant updates and announcements.",
  },
];

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
        disabled
          ? "cursor-not-allowed bg-white/10"
          : checked
          ? "bg-white"
          : "bg-white/15 hover:bg-white/20"
      }`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={`absolute top-0.5 h-4 w-4 rounded-full ${
          disabled ? "bg-white/40" : checked ? "bg-black" : "bg-white"
        }`}
        style={{ left: checked ? "calc(100% - 18px)" : "2px" }}
      />
    </button>
  );
}

export function CookieConsentBanner({
  isOpenExternal,
  onCloseExternal,
}: {
  isOpenExternal?: boolean;
  onCloseExternal?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [prefs, setPrefs] = useState<CookiePreferences>({
    essential: true,
    analytics: true,
    functional: true,
    marketing: false,
  });

  useEffect(() => {
    setMounted(true);
    const stored = getStoredCookiePreferences();
    if (!stored) {
      setShowBanner(true);
    } else {
      setPrefs(stored);
    }
  }, []);

  useEffect(() => {
    if (isOpenExternal !== undefined) {
      setShowModal(isOpenExternal);
    }
  }, [isOpenExternal]);

  const close = () => {
    setShowBanner(false);
    setShowModal(false);
    onCloseExternal?.();
  };

  const handleAcceptAll = () => {
    const all: CookiePreferences = {
      essential: true,
      analytics: true,
      functional: true,
      marketing: true,
    };
    setPrefs(all);
    saveCookiePreferences(all);
    close();
  };

  const handleSavePreferences = () => {
    saveCookiePreferences(prefs);
    close();
  };

  const handleRejectNonEssential = () => {
    const minimal: CookiePreferences = {
      essential: true,
      analytics: false,
      functional: false,
      marketing: false,
    };
    setPrefs(minimal);
    saveCookiePreferences(minimal);
    close();
  };

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Bottom Banner */}
      <AnimatePresence>
        {showBanner && !showModal && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            style={{ position: "fixed" }}
            className="bottom-5 left-5 right-5 z-[9999] w-auto rounded-2xl border border-white/10 bg-[#0A0A0A] p-5 shadow-2xl sm:left-auto sm:right-5 sm:w-full sm:max-w-sm"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5">
                <Cookie size={15} className="text-white/70" />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-medium text-white">
                  We use cookies
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-white/50">
                  To improve your experience and keep things secure. Choose what you're comfortable with.
                </p>
              </div>
              <button
                onClick={() => setShowBanner(false)}
                className="text-white/30 transition-colors hover:text-white/60"
              >
                <X size={15} />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={handleAcceptAll}
                className="flex-1 rounded-lg bg-white py-2 text-[12.5px] font-medium text-black transition-opacity hover:opacity-90"
              >
                Accept all
              </button>
              <button
                onClick={handleRejectNonEssential}
                className="flex-1 rounded-lg border border-white/10 py-2 text-[12.5px] font-medium text-white/70 transition-colors hover:bg-white/5"
              >
                Reject
              </button>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="mt-3 w-full text-center text-[12px] text-white/40 transition-colors hover:text-white/70"
            >
              Customize preferences
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preferences Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ position: "fixed" }}
            className="inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={close}
          >
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0A0A0A] shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5">
                <h3 className="text-[15px] font-medium text-white">
                  Cookie preferences
                </h3>
                <button
                  onClick={close}
                  className="text-white/30 transition-colors hover:text-white/60"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="h-px bg-white/5" />

              {/* Categories */}
              <div className="max-h-[55vh] overflow-y-auto px-6 py-2">
                {CATEGORIES.map((cat, i) => (
                  <div key={cat.key}>
                    <div className="flex items-start justify-between gap-4 py-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-white">
                            {cat.label}
                          </span>
                          {cat.locked && (
                            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/40">
                              Required
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[12px] leading-relaxed text-white/40">
                          {cat.description}
                        </p>
                      </div>
                      <div className="pt-0.5">
                        <Toggle
                          checked={prefs[cat.key]}
                          disabled={cat.locked}
                          onChange={(v) =>
                            setPrefs((p) => ({ ...p, [cat.key]: v }))
                          }
                        />
                      </div>
                    </div>
                    {i < CATEGORIES.length - 1 && (
                      <div className="h-px bg-white/5" />
                    )}
                  </div>
                ))}
              </div>

              <div className="h-px bg-white/5" />

              {/* Footer */}
              <div className="flex items-center gap-2 px-6 py-4">
                <button
                  onClick={handleRejectNonEssential}
                  className="flex-1 rounded-lg border border-white/10 py-2.5 text-[12.5px] font-medium text-white/60 transition-colors hover:bg-white/5"
                >
                  Reject optional
                </button>
                <button
                  onClick={handleSavePreferences}
                  className="flex-1 rounded-lg bg-white py-2.5 text-[12.5px] font-medium text-black transition-opacity hover:opacity-90"
                >
                  Save preferences
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body
  );
}