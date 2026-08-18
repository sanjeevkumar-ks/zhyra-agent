import { create } from "zustand";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  setPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
  User as FirebaseUser,
} from "firebase/auth";
import { auth, googleProvider } from "../../firebase";

const BASE_URL = import.meta.env.VITE_API_URL || "https://zhyra-agent.vercel.app";

export interface AdminProfile {
  uid: string;
  email: string;
  displayName: string;
  role: "super_admin" | "support_admin" | "operations_admin";
  status: "active" | "inactive";
}

interface AdminAuthState {
  user: FirebaseUser | null;
  adminProfile: AdminProfile | null;
  permissions: string[];
  loading: boolean;
  isDenied: boolean;
  isUnverified: boolean;
  error: string | null;
  initialize: () => () => void;
  checkAdminStatus: (firebaseUser: FirebaseUser) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAdminAuthStore = create<AdminAuthState>((set, get) => ({
  user: null,
  adminProfile: null,
  permissions: [],
  loading: true,
  isDenied: false,
  isUnverified: false,
  error: null,

  clearError: () => set({ error: null }),

  checkAdminStatus: async (firebaseUser: FirebaseUser) => {
    set({ loading: true, error: null, isDenied: false, isUnverified: false });

    // If email/password user and email is not verified
    if (
      firebaseUser.providerData.some((p) => p.providerId === "password") &&
      !firebaseUser.emailVerified
    ) {
      set({
        user: firebaseUser,
        adminProfile: null,
        permissions: [],
        loading: false,
        isDenied: false,
        isUnverified: true,
        error: "Please verify your email address to access the Zhyra Admin Console.",
      });
      return;
    }

    try {
      const idToken = await firebaseUser.getIdToken(true);
      const res = await fetch(`${BASE_URL}/api/admin/auth/me`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (res.status === 403) {
        let errDetail = {};
        try {
          errDetail = await res.json();
        } catch {}
        const code = (errDetail as any)?.detail?.error?.code;
        if (code === "EMAIL_NOT_VERIFIED") {
          set({
            user: firebaseUser,
            adminProfile: null,
            permissions: [],
            loading: false,
            isDenied: false,
            isUnverified: true,
            error: "Please verify your email address to access the Zhyra Admin Console.",
          });
          return;
        }

        set({
          user: firebaseUser,
          adminProfile: null,
          permissions: [],
          loading: false,
          isDenied: true,
          isUnverified: false,
          error: "Your account does not have access to the Zhyra Admin Console.",
        });
        return;
      }

      if (!res.ok) {
        throw new Error(`Authentication check failed with status ${res.status}`);
      }

      const data = await res.json();
      if (data.authenticated && data.is_admin && data.admin) {
        set({
          user: firebaseUser,
          adminProfile: data.admin,
          permissions: data.permissions || [],
          loading: false,
          isDenied: false,
          isUnverified: false,
          error: null,
        });
      } else {
        set({
          user: firebaseUser,
          adminProfile: null,
          permissions: [],
          loading: false,
          isDenied: true,
          isUnverified: false,
          error: "You do not have access to the Zhyra Admin Console.",
        });
      }
    } catch (e: any) {
      console.error("Failed to verify admin status with backend", e);
      set({
        user: firebaseUser,
        adminProfile: null,
        permissions: [],
        loading: false,
        isDenied: true,
        isUnverified: false,
        error: e.message || "Failed to verify administrator status.",
      });
    }
  },

  initialize: () => {
    set({ loading: true });
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await get().checkAdminStatus(firebaseUser);
      } else {
        set({
          user: null,
          adminProfile: null,
          permissions: [],
          loading: false,
          isDenied: false,
          isUnverified: false,
          error: null,
        });
      }
    });
    return unsubscribe;
  },

  loginWithGoogle: async () => {
    set({ loading: true, error: null });
    try {
      await setPersistence(auth, browserLocalPersistence).catch(() => {});
      const res = await signInWithPopup(auth, googleProvider);
      if (res.user) {
        await get().checkAdminStatus(res.user);
      }
    } catch (e: any) {
      console.error("Google Admin Sign-in Error:", e);
      
      // Fallback 1: If auth.currentUser exists despite popup IndexedDB error
      if (auth.currentUser) {
        await get().checkAdminStatus(auth.currentUser);
        return;
      }

      // Fallback 2: Handle IndexedDB database closing/hidden error
      if (e?.message?.includes("closing") || e?.message?.includes("hidden") || e?.code === "auth/internal-error") {
        try {
          await setPersistence(auth, inMemoryPersistence);
          const resRetry = await signInWithPopup(auth, googleProvider);
          if (resRetry.user) {
            await get().checkAdminStatus(resRetry.user);
            return;
          }
        } catch (retryErr: any) {
          if (auth.currentUser) {
            await get().checkAdminStatus(auth.currentUser);
            return;
          }
        }
      }

      set({ loading: false, error: e.message || "Google sign-in failed." });
    }
  },

  loginWithEmail: async (email: string, pass: string) => {
    set({ loading: true, error: null });
    try {
      await setPersistence(auth, browserLocalPersistence).catch(() => {});
      const res = await signInWithEmailAndPassword(auth, email, pass);
      if (res.user) {
        await get().checkAdminStatus(res.user);
      }
    } catch (e: any) {
      console.error("Email Admin Sign-in Error:", e);

      if (auth.currentUser) {
        await get().checkAdminStatus(auth.currentUser);
        return;
      }

      if (e?.message?.includes("closing") || e?.message?.includes("hidden") || e?.code === "auth/internal-error") {
        try {
          await setPersistence(auth, inMemoryPersistence);
          const resRetry = await signInWithEmailAndPassword(auth, email, pass);
          if (resRetry.user) {
            await get().checkAdminStatus(resRetry.user);
            return;
          }
        } catch (retryErr: any) {
          if (auth.currentUser) {
            await get().checkAdminStatus(auth.currentUser);
            return;
          }
        }
      }

      set({ loading: false, error: e.message || "Invalid email or password." });
    }
  },

  signUpWithEmail: async (email: string, pass: string) => {
    set({ loading: true, error: null });
    try {
      await setPersistence(auth, browserLocalPersistence).catch(() => {});
      const res = await createUserWithEmailAndPassword(auth, email, pass);
      if (res.user) {
        await sendEmailVerification(res.user);
        set({
          user: res.user,
          adminProfile: null,
          permissions: [],
          loading: false,
          isDenied: false,
          isUnverified: true,
          error: "Verification email sent. Please check your inbox and verify your email address.",
        });
      }
    } catch (e: any) {
      console.error("Email Admin Sign-up Error:", e);

      if (auth.currentUser) {
        await sendEmailVerification(auth.currentUser).catch(() => {});
        set({
          user: auth.currentUser,
          adminProfile: null,
          permissions: [],
          loading: false,
          isDenied: false,
          isUnverified: true,
          error: "Verification email sent. Please check your inbox and verify your email address.",
        });
        return;
      }

      set({ loading: false, error: e.message || "Account creation failed." });
    }
  },

  logout: async () => {
    set({ loading: true });
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Admin signout error", e);
    }
    set({
      user: null,
      adminProfile: null,
      permissions: [],
      loading: false,
      isDenied: false,
      isUnverified: false,
      error: null,
    });
  },
}));
