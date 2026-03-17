import React from "react";
import AuthProvider from "./src/context/AuthContext";
import LoginScreen from "./src/screens/LoginScreen";

export default function App() {
  return (
    <AuthProvider>
      <LoginScreen />
    </AuthProvider>
  );
}
