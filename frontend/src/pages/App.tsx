import { SearchBar } from "@/components/SearchBar";
import { PropertyDialog } from "@/components/PropertyDialog";
import { PropertyCard } from "@/components/PropertyCard";
import brain from "brain";
import { toast, Toaster } from "sonner";
import { useState, useEffect, useRef } from "react";
import { createUserProfile, getUserProfile } from "@/utils/firebase";
import { useUserGuardContext } from "app";
import { useSearchParams } from "react-router-dom";
import { getDoc, doc } from "firebase/firestore";
import { db } from "@/utils/firebase";
import { getSavedQueries, savePropertyQuery, deleteSavedQuery } from "@/utils/firebase";
import { Button } from "@/components/ui/button";
import { ListIcon, MapIcon, SatelliteIcon, UserIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppStore } from "@/utils/store";
import { MapView } from "@/components/Map";
import { UserDialog } from "@/components/UserDialog";

export default function App() {
  const mapRef = useRef<mapboxgl.Map>();
  const { user } = useUserGuardContext();
  const [searchParams] = useSearchParams();

  // Check and create user profile if needed
  useEffect(() => {
    const checkProfile = async () => {
      try {
        const profile = await getUserProfile(user.uid);
        console.log("Profile exists?", !!profile);
        if (!profile) {
          console.log("Creating new profile for user:", user.uid);
          await createUserProfile(user);
        }
      } catch (error) {
        console.error("Error checking/creating user profile:", error);
      }
    };
    
    checkProfile();
  }, [user]);

  const { selectedProperty, setSelectedProperty, savedProperties, setSavedProperties, isPropertyCardVisible, setPropertyCardVisible, mapStyle, setMapStyle, setShouldCenterMap } = useAppStore();
  const isStyleLoading = useAppStore(state => state.isStyleLoading);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [userDialogOpen, setUserDialogOpen] = useState(false);

  // Fetch property from Firestore if id is in URL
  useEffect(() => {
    const queryId = searchParams.get('id');
    if (!queryId) return;

    const fetchProperty = async () => {
      try {
        const docRef = doc(db, 'queries', queryId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
if (data && data.address && data.zpid) {
            setSelectedProperty(data);
          }
          setShouldCenterMap(true);
          setDialogOpen(true); // Open the PropertyDialog
        } else {
          console.log('No property found with this ID');
        }
      } catch (error) {
        console.error('Error fetching property:', error);
      }
    };

    fetchProperty();
  }, [searchParams, setSelectedProperty, setShouldCenterMap, setDialogOpen]);

  // Load saved properties whenever selectedProperty changes
  // Show property card whenever a property is selected
  useEffect(() => {
    if (selectedProperty) {
      setPropertyCardVisible(true);
    }
  }, [selectedProperty, setPropertyCardVisible]);

  useEffect(() => {
    const fetchSavedProperties = async () => {
      try {
        const queries = await getSavedQueries(user.uid);
        setSavedProperties(queries);
      } catch (error) {
        console.error('Error loading saved properties:', error);
      }
    };

    fetchSavedProperties();
  }, [user.uid, selectedProperty, setSavedProperties]);
  
  // Add event listener for opening user dialog from PropertyCard
  useEffect(() => {
    const handleOpenUserDialog = () => {
      setUserDialogOpen(true);
    };
    
    window.addEventListener("open-user-dialog", handleOpenUserDialog);
    
    return () => {
      window.removeEventListener("open-user-dialog", handleOpenUserDialog);
    };
  }, []);

  return (
    <div className="flex flex-col w-full h-screen bg-background overflow-hidden app-container">
      {/* Toaster for notifications */}
      <Toaster position="top-center" richColors />
      
      {/* Map Container */}
      <div className="flex-1 relative">
        <MapView mapRef={mapRef} />
      </div>

      {/* Floating Controls */}
      <div className="absolute w-[90%] max-w-2xl top-4 left-1/2 -translate-x-1/2 flex items-start gap-2">
        <SearchBar mapRef={mapRef} />
        <Button
          variant="ghost"
          size="icon"
          className="bg-background backdrop-blur-sm border shadow-sm rounded-full w-12 h-10 p-0"
          disabled={isStyleLoading}
          onClick={() => setMapStyle(prev => prev === "custom" ? "satellite" : "custom")}
        >
          {mapStyle === "custom" ? (
            <SatelliteIcon className="h-4 w-4" />
          ) : (
            <MapIcon className="h-4 w-4" />
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="bg-background backdrop-blur-sm border shadow-sm rounded-full w-12 h-10 p-0 relative z-50"
              title="Saved Properties"
            >
              <ListIcon className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[300px] max-h-[60vh] overflow-y-auto">

            {savedProperties?.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                No saved properties
              </div>
            ) : (
              savedProperties?.map((property) => (
                <DropdownMenuItem
                  key={property.zpid}
                  className="cursor-pointer"
                  onClick={() => {
                    setSelectedProperty(property);
                    // Always pan to location when selecting from saved properties
                    setShouldCenterMap(true);
                  }}
                >
                  {property.address.streetAddress}, {property.address.city}, {property.address.state}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon"
          className="bg-background backdrop-blur-sm border shadow-sm rounded-full w-12 h-10 p-0 relative z-50"
          title="Profile"
          onClick={() => setUserDialogOpen(true)}
        >
          <UserIcon className="w-4 h-4" />
        </Button>
      </div>

      {/* Property Info Card */}
      {isPropertyCardVisible && <div className="absolute bottom-4 left-1/2 pl-8 -translate-x-1/2 w-[90%] max-w-2xl">
        <PropertyCard
          onViewMore={() => setDialogOpen(true)}
        />
      </div>}

      {selectedProperty && (
        <PropertyDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}

      <UserDialog
        open={userDialogOpen}
        onOpenChange={setUserDialogOpen}
      />
    </div>
  );
}
