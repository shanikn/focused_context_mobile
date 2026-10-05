import React, { createContext, useContext, useState, useEffect } from "react";
import { auth } from "../config/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { connectApiToFirebase } from "../services/apiAuth";

// authcontext- auth logic layer, conects auth and firebase


interface AuthContextType {
    user: User | null ;
    token: string | null;
    loading: boolean;
}


const AuthContext = createContext<AuthContextType>({
    user: null,
    token: null,
    loading: true,
});


export default function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);


    useEffect(() => {
        // every API request asks Firebase for a fresh ID token (they expire after an hour)
        connectApiToFirebase();
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                const idToken = await firebaseUser.getIdToken();
                setUser(firebaseUser);
                setToken(idToken);
            }
            else {
                setUser(null);
                setToken(null);
            }
            setLoading(false);
        });
        return unsubscribe;
    }, []);


    return (
        <AuthContext.Provider value={{ user, token, loading}}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
