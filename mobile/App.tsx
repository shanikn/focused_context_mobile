import React, { useEffect, useRef } from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import AuthProvider, { useAuth } from "./src/context/AuthContext";
import LoginScreen from "./src/screens/LoginScreen";
import NotesListScreen from "./src/screens/NotesListScreen";
import AddEditNoteScreen from "./src/screens/AddEditNoteScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { checkAndNotifyReminders } from "./src/services/reminderNotifier";
import { Note } from "./src/types/notes";

export type NotesStackParamList = {
  NotesList: undefined;
  AddEditNote: { note?: Note } | undefined;
};

const Stack = createNativeStackNavigator<NotesStackParamList>();
const Tab = createBottomTabNavigator();
const REMINDER_POLL_MS = 60 * 1000;

function NotesStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="NotesList"
        component={NotesListScreen}
        options={{ title: "My Notes" }}
      />
      <Stack.Screen
        name="AddEditNote"
        component={AddEditNoteScreen}
        options={({ route }) => ({
          title: route.params?.note?._id ? "Edit Note" : "New Note",
        })}
      />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = "document-text";
          if (route.name === "Notes") iconName = "document-text";
          else if (route.name === "Settings") iconName = "settings";
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: "#2E7D32",
        tabBarInactiveTintColor: "#999",
      })}
    >
      <Tab.Screen
        name="Notes"
        component={NotesStack}
        options={{ headerShown: false }}
      />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { user, loading } = useAuth();
  const isCheckingRef = useRef(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    let mounted = true;

    const runReminderCheck = async () => {
      if (!mounted || isCheckingRef.current) {
        return;
      }

      isCheckingRef.current = true;
      try {
        await checkAndNotifyReminders();
      } catch (error) {
        console.log("Reminder check failed", error);
      } finally {
        isCheckingRef.current = false;
      }
    };

    runReminderCheck();

    const interval = setInterval(runReminderCheck, REMINDER_POLL_MS);
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        runReminderCheck();
      }
    });

    return () => {
      mounted = false;
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [user]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? <MainTabs /> : <LoginScreen />}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
