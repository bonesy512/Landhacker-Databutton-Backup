import { firebaseApp } from "app";
import { collection, addDoc, getDocs, getFirestore, query, where, deleteDoc, doc, setDoc, getDoc, onSnapshot } from "firebase/firestore";
import { User } from "firebase/auth";
import type { PropertyDetailsResponse } from "types";

export const db = getFirestore(firebaseApp);

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  createdAt: Date;
  lastLoginAt: Date;
  credits: number;
  stripeCustomerId?: string;
  subscriptionStatus?: 'active' | 'cancelled_active' | 'expired' | null;
  subscriptionTier?: 'monthly' | null;
}

export const createUserProfile = async (user: User) => {
  try {
    const userProfile: UserProfile = {
      uid: user.uid,
      email: user.email!,
      displayName: user.displayName,
      photoURL: user.photoURL,
      createdAt: new Date(),
      lastLoginAt: new Date(),
      credits: 0, // Initial credit
      stripeCustomerId: null,
      subscriptionStatus: null,
      subscriptionTier: null,
    };

    const x = await setDoc(doc(db, "users", user.uid), userProfile);
    return userProfile;
  } catch (error) {
    console.error("Error creating user profile:", error);
    throw error;
  }
};

export interface SavedQuery extends PropertyDetailsResponse {
  id?: string;
  userId: string;
  savedAt: Date;
}

// Replace undefined values with null recursively
const replaceUndefinedWithNull = (obj: any): any => {
  const clean: any = {};
  
  Object.entries(obj).forEach(([key, value]) => {
    if (value === undefined) {
      clean[key] = null;
      return;
    }
    
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      clean[key] = replaceUndefinedWithNull(value);
    } else if (Array.isArray(value)) {
      clean[key] = value.map(item => 
        item && typeof item === 'object' ? replaceUndefinedWithNull(item) : (item === undefined ? null : item)
      );
    } else {
      clean[key] = value;
    }
  });
  
  return clean;
};

export const savePropertyQuery = async (userId: string, property: PropertyDetailsResponse) => {
  try {
    // Replace undefined values with null in the property object
    const cleanProperty = replaceUndefinedWithNull(property);
    
    const queryData = {
      userId,
      savedAt: new Date(),
      ...cleanProperty,
    };

    // Check if a document with this zpid already exists for this user
    const q = query(
      collection(db, "queries"), 
      where("userId", "==", userId),
      where("zpid", "==", property.zpid)
    );
    const querySnapshot = await getDocs(q);
    
    let docId;
    if (!querySnapshot.empty) {
      // Update existing document
      docId = querySnapshot.docs[0].id;
      await setDoc(doc(db, "queries", docId), queryData);
    } else {
      // Create new document
      const docRef = await addDoc(collection(db, "queries"), queryData);
      docId = docRef.id;
    }
    
    return docId;
  } catch (error) {
    console.error("Error saving property query:", error);
    throw error;
  }
};

export const getSavedQueries = async (userId: string) => {
  try {
    const q = query(collection(db, "queries"), where("userId", "==", userId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
      } as SavedQuery;
    });
  } catch (error) {
    console.error("Error getting saved queries:", error);
    throw error;
  }
};

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  try {
    const docRef = doc(db, "users", userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error("Error getting user profile:", error);
    throw error;
  }
};

export const decreaseCredits = async (userId: string, amount: number = 50): Promise<void> => {
  try {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      throw new Error("User profile not found");
    }
    const userData = userSnap.data() as UserProfile;
    if (userData.credits < amount) {
      throw new Error("Insufficient credits");
    }
    await setDoc(userRef, {
      ...userData,
      credits: userData.credits - amount,
    });
  } catch (error) {
    console.error("Error decreasing credits:", error);
    throw error;
  }
};

export const deleteSavedQuery = async (queryId: string) => {
  try {
    await deleteDoc(doc(db, "queries", queryId));
  } catch (error) {
    console.error("Error deleting saved query:", error);
    throw error;
  }
};
