import { initializeApp } from "firebase/app";
import * as FirebaseAuth from "firebase/auth";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
    apiKey: "AIzaSyDgrgIoFNp9N2jd7lJsg3i1xgaZoGCM6SE",
    authDomain: "focusedcontext.firebaseapp.com",
    projectId: "focusedcontext",
    storageBucket: "focusedcontext.firebasestorage.app",
    messagingSenderId: "161204310551",
    appId: "1:161204310551:web:526ce4ef48376749e5c252",
    measurementId: "G-3LQDTWE1BR"
};

// OAuth "Web client" (client_type 3) from google-services.json — Google
// Sign-In needs it so the idToken it returns is accepted by Firebase Auth
export const GOOGLE_WEB_CLIENT_ID =
    "161204310551-uis698ooj6koph0qv9ftcidhtc62e99i.apps.googleusercontent.com";

const app = initializeApp(firebaseConfig);
const { initializeAuth } = FirebaseAuth;
const getReactNativePersistence = (
    FirebaseAuth as unknown as {
        getReactNativePersistence: (
            storage: typeof ReactNativeAsyncStorage
        ) => FirebaseAuth.Persistence;
    }
).getReactNativePersistence;

export const auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});
