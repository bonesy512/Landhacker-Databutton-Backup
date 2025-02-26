import { SignInOrUpForm } from "app"
import { createUserProfile, getUserProfile } from "@/utils/firebase"
import { User } from "firebase/auth"
import { useEffect } from "react"
import { firebaseAuth } from "app"

export default function Login() {
  useEffect(() => {
    const unsubscribe = firebaseAuth.onAuthStateChanged(async (user) => {
      if (user) {
        console.log("Auth state changed - user signed in:", user.uid);
        try {
          console.log("Checking if profile exists for user:", user.uid);
          const profile = await getUserProfile(user.uid);
          console.log("Profile exists?", !!profile);
          if (!profile) {
            console.log("Creating new profile for user:", user.uid);
            await createUserProfile(user);
          }
        } catch (error) {
          console.error("Error checking/creating user profile:", error);
        }
      } else {
        console.log("Auth state changed - user signed out");
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-zinc-900">
      <div className="w-full max-w-md space-y-8 p-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-white">Welcome to Landhacker</h1>
          <p className="text-lg text-zinc-400">Sign in to continue your journey</p>
        </div>
        <SignInOrUpForm signInOptions={{ google: true }} />
      </div>
    </div>
  );
};