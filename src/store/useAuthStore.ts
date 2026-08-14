import { create } from "zustand";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../../firebase";
import { apiClient } from "../lib/apiClient";

export interface UserState {
  uid: string;
  email: string;
  name: string;
  avatar_url?: string;
  workspace_id?: string;
  onboarded?: boolean;
}

export interface WorkspaceState {
  id: string;
  name: string;
  industry: string;
  timezone: string;
  language: string;
  default_provider: string;
  default_model: string;
  temperature: number;
  max_output_tokens: number;
  streaming_enabled: boolean;
  knowledge_folders?: string[];
}

interface AuthStore {
  user: UserState | null;
  workspace: WorkspaceState | null;
  loading: boolean;
  theme: "light" | "dark";
  sidebarOpen: boolean;
  
  // Actions
  initialize: () => () => void;
  setUser: (user: UserState | null) => void;
  setWorkspace: (workspace: WorkspaceState | null) => void;
  updateWorkspaceState: (updates: Partial<WorkspaceState>) => void;
  setTheme: (theme: "light" | "dark") => void;
  toggleSidebar: () => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  workspace: null,
  loading: true,
  theme: "light",
  sidebarOpen: true,

  initialize: () => {
    // Listen for authentication state changes in Firebase
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      set({ loading: true });
      if (firebaseUser) {
        try {
          // Verify with FastAPI backend to register/fetch user profile
          const userProfile = await apiClient.post<UserState>("/api/auth/verify", {});
          set({ user: userProfile });
          
          if (userProfile.workspace_id) {
            // Load workspace settings
            const wsData = await apiClient.get<WorkspaceState>("/api/workspaces/me");
            set({ workspace: wsData });
          }
        } catch (e) {
          console.error("Failed to load user session profile on auth state change", e);
          // If server fails, set mock details to allow local offline execution
          set({
            user: {
              uid: firebaseUser.uid,
              email: firebaseUser.email || "offline@example.com",
              name: firebaseUser.displayName || "Offline Developer",
              workspace_id: "ws_offline_sandbox",
              onboarded: true
            },
            workspace: {
              id: "ws_offline_sandbox",
              name: "Offline Sandbox Clinic",
              industry: "Healthcare",
              timezone: "America/New_York",
              language: "English (US)",
              default_provider: "gemini",
              default_model: "gemini-3.5-flash",
              temperature: 0.7,
              max_output_tokens: 1000,
              streaming_enabled: true
            } as any
          });
        }
      } else {
        set({ user: null, workspace: null });
      }
      set({ loading: false });
    });

    return unsubscribe;
  },

  setUser: (user) => set({ user }),
  
  setWorkspace: (workspace) => set({ workspace }),
  
  updateWorkspaceState: (updates) => set((state) => ({
    workspace: state.workspace ? { ...state.workspace, ...updates } : null
  })),

  setTheme: (theme) => {
    set({ theme });
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  },

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  logout: async () => {
    await signOut(auth);
    set({ user: null, workspace: null });
  }
}));
