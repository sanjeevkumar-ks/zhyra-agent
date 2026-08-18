import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

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

// Initialize Firebase App & Auth
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });