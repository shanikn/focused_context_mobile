import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
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

const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});
