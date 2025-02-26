import { create } from 'zustand'
import type { PropertyDetailsResponse } from 'types'
import { doc, onSnapshot, getFirestore } from "firebase/firestore";
import { firebaseApp } from "app";
import type { UserProfile } from "./firebase";

type MeasurementMode = 'none' | 'distance' | 'area';
type MeasurementUnits = 'metric' | 'imperial';

interface Measurement {
  id: string;
  type: 'distance' | 'area';
  value: number;
  coordinates: number[][];
}

interface AppState {
  // User Profile State
  userProfile: UserProfile | null
  isLoadingProfile: boolean
  profileError: Error | null
  initializeUserProfileListener: (userId: string) => () => void
  clearUserProfile: () => void
  
  isStyleLoading: boolean
  setIsStyleLoading: (isLoading: boolean) => void
  mapStyle: "custom" | "satellite"
  setMapStyle: (style: "custom" | "satellite" | ((prev: "custom" | "satellite") => "custom" | "satellite")) => void
  isPropertyCardVisible: boolean
  setPropertyCardVisible: (visible: boolean) => void
  selectedProperty: PropertyDetailsResponse | null
  setSelectedProperty: (property: PropertyDetailsResponse | null) => void
  isLoadingProperty: boolean
  setIsLoadingProperty: (isLoading: boolean) => void
  savedProperties: PropertyDetailsResponse[]
  setSavedProperties: (properties: PropertyDetailsResponse[]) => void
  shouldCenterMap: boolean
  setShouldCenterMap: (shouldCenter: boolean) => void
  // Measurement state
  measurementMode: MeasurementMode
  setMeasurementMode: (mode: MeasurementMode) => void
  measurementUnits: MeasurementUnits
  setMeasurementUnits: (units: MeasurementUnits) => void
  measurements: Measurement[]
  setMeasurements: (measurements: Measurement[]) => void
  addMeasurement: (measurement: Measurement) => void
  removeMeasurement: (id: string) => void
  clearMeasurements: () => void
  // New measurement states for drag-based interaction
  measurementPoints: [number, number][]
  currentMeasurement: number | null
  viewportCenter: [number, number]
  addMeasurementPoint: (point: [number, number]) => void
  setCurrentMeasurement: (measurement: number | null) => void
  setViewportCenter: (center: [number, number]) => void
  // Price generation state
  runningProperties: string[]
  addRunningProperty: (address: string) => void
  removeRunningProperty: (address: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  // Price generation state
  runningProperties: [],
  addRunningProperty: (address) => set((state) => ({
    runningProperties: [...state.runningProperties, address]
  })),
  removeRunningProperty: (address) => set((state) => ({
    runningProperties: state.runningProperties.filter((a) => a !== address)
  })),
  // User Profile State
  userProfile: null,
  isLoadingProfile: false,
  profileError: null,
  initializeUserProfileListener: (userId: string) => {
    set({ isLoadingProfile: true });
    const db = getFirestore(firebaseApp);
    
    const unsubscribe = onSnapshot(
      doc(db, "users", userId),
      (doc) => {
        if (doc.exists()) {
          set({ 
            userProfile: doc.data() as UserProfile,
            isLoadingProfile: false,
            profileError: null
          });
        } else {
          set({ 
            userProfile: null,
            isLoadingProfile: false,
            profileError: new Error("User profile not found")
          });
        }
      },
      (error) => {
        console.error("Error listening to user profile:", error);
        set({ 
          isLoadingProfile: false,
          profileError: error as Error
        });
      }
    );

    return unsubscribe;
  },
  clearUserProfile: () => set({ 
    userProfile: null,
    isLoadingProfile: false,
    profileError: null
  }),
  
  isStyleLoading: true,
  setIsStyleLoading: (isLoading) => set({ isStyleLoading: isLoading }),
  isPropertyCardVisible: true,
  setPropertyCardVisible: (visible) => set((state) => ({ 
    isPropertyCardVisible: visible,
    // Close measurement mode when property card is opened
    measurementMode: visible ? 'none' : state.measurementMode,
    // Clear measurements when property card is opened
    measurements: visible ? [] : state.measurements
  })),
  selectedProperty: null,
  setSelectedProperty: (property) => set({ selectedProperty: property }),
  isLoadingProperty: false,
  setIsLoadingProperty: (isLoading) => set({ isLoadingProperty: isLoading }),
  savedProperties: [],
  setSavedProperties: (properties) => set({ savedProperties: properties }),
  mapStyle: "custom",
  setMapStyle: (style) => set((state) => ({ 
    mapStyle: typeof style === "function" ? style(state.mapStyle) : style 
  })),
  shouldCenterMap: false,
  setShouldCenterMap: (shouldCenter) => set({ shouldCenterMap: shouldCenter }),
  // Measurement state initialization
  measurementMode: 'none',
  setMeasurementMode: (mode) => set((state) => ({ 
    measurementMode: mode,
    // Close property card when measurement mode is active
    isPropertyCardVisible: mode === 'none' ? state.isPropertyCardVisible : false,
    // Only clear points when exiting measurement mode
    measurementPoints: mode === 'none' ? [] : state.measurementPoints,
    // Recalculate measurement in useEffect
    currentMeasurement: null,
    selectedProperty: mode === 'none' ? state.selectedProperty : null
  })),
  measurementUnits: 'metric',
  setMeasurementUnits: (units) => set({ measurementUnits: units }),
  measurements: [],
  setMeasurements: (measurements) => set({ measurements }),
  addMeasurement: (measurement) => set((state) => ({
    measurements: [...state.measurements, measurement]
  })),
  removeMeasurement: (id) => set((state) => ({
    measurements: state.measurements.filter((m) => m.id !== id)
  })),
  clearMeasurements: () => set({ 
    measurements: [],
    measurementPoints: [],
    currentMeasurement: null
  }),
  // New measurement states
  measurementPoints: [] as [number, number][], // Initialize as empty array,
  currentMeasurement: null,
  viewportCenter: [-96.7970, 32.7767], // Default center
  addMeasurementPoint: (point) => set((state) => ({ 
    measurementPoints: state.measurementPoints ? [...state.measurementPoints, point] : [point]
  })),
  setCurrentMeasurement: (measurement) => set({ currentMeasurement: measurement }),
  setViewportCenter: (center) => set({ viewportCenter: center }),
}))
