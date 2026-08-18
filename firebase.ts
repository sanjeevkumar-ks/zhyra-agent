import { initializeApp } from "firebase/app";
import {
  initializeAuth,
  getAuth,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
} from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBx7wX97cK9bN50plC95ngnFXxv4-mj9jo",
  authDomain: "zhyra-e0d80.firebaseapp.com",
  projectId: "zhyra-e0d80",
  storageBucket: "zhyra-e0d80.firebasestorage.app",
  messagingSenderId: "517923074552",
  appId: "1:517923074552:web:eff1a6e25a820c76dfa60d",
  measurementId: "G-Q8XQK5XHNV",
};

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);

// Safe Auth Initialization with fallback persistence to prevent "Database is closing/hidden" errors
let authInstance;
try {
  authInstance = initializeAuth(app, {
    persistence: [
      indexedDBLocalPersistence,
      browserLocalPersistence,
      browserSessionPersistence,
      inMemoryPersistence,
    ],
  });
} catch (e) {
  authInstance = getAuth(app);
}

export const auth = authInstance;
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });