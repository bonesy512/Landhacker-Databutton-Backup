import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CoinsIcon, Loader2, Check, DollarSign, AlertTriangle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import brain from "brain";
import type { PropertyDetailsResponse } from "types";
import { useAppStore } from "@/utils/store";
import { useUserGuardContext, firebaseApp, APP_BASE_PATH } from "app";
import { savePropertyQuery, decreaseCredits } from "@/utils/firebase";

// Helper functions for price calculations
const calculatePriceStats = (acrePrices: NonNullable<PropertyDetailsResponse['acre_prices']>) => {
  if (!acrePrices.length) return null;

  // Calculate price per acre for each property
  const pricesPerAcre = acrePrices
    .filter(p => p.price && p.acre) // Filter out invalid entries
    .map(p => p.price! / p.acre!);

  if (!pricesPerAcre.length) return null;

  // Similarity clustering with a threshold of 25%
  const similarityThreshold = 0.25; // 25% threshold for similarity
  const clusters: number[][] = [];

  // Create a copy of prices for processing
  const remainingPrices = [...pricesPerAcre];
  
  // Build clusters
  while (remainingPrices.length > 0) {
    const currentPrice = remainingPrices.shift()!;
    const currentCluster: number[] = [currentPrice];
    
    // Find all prices within threshold of current price
    for (let i = remainingPrices.length - 1; i >= 0; i--) {
      const price = remainingPrices[i];
      const percentDiff = Math.abs(price - currentPrice) / currentPrice;
      
      if (percentDiff <= similarityThreshold) {
        currentCluster.push(price);
        remainingPrices.splice(i, 1);
      }
    }
    
    clusters.push(currentCluster);
  }
  
  // Sort clusters by size (largest first)
  clusters.sort((a, b) => b.length - a.length);
  
  // Use the largest cluster for calculations
  const largestCluster = clusters[0];
  const otherCount = pricesPerAcre.length - largestCluster.length;
  
  // Calculate statistics using only the largest cluster
  const mean = largestCluster.reduce((a, b) => a + b, 0) / largestCluster.length;
  const variance = largestCluster.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / largestCluster.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean; // Coefficient of variation

  // Additional info about clusters
  const numClusters = clusters.length;
  const clusterSizes = clusters.map(c => c.length).join(', ');

  return {
    mean,
    stdDev,
    cv,
    min: Math.min(...largestCluster),
    max: Math.max(...largestCluster),
    count: largestCluster.length,
    totalCount: pricesPerAcre.length,
    outliers: otherCount,
    numClusters,
    clusterSizes
  };
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
};

interface PredictedPrice {
  predicted_price: string;
  confidence_score: string;
  reasoning: string;
}

export function GeneratePrice() {
  const { selectedProperty, runningProperties, addRunningProperty, removeRunningProperty, setSelectedProperty, userProfile, isLoadingProfile, initializeUserProfileListener } = useAppStore();
  const { user } = useUserGuardContext();

  const [isGenerating, setIsGenerating] = useState(false);
  // const [isFetchingPrices, setIsFetchingPrices] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  // const [priceEstimates, setPriceEstimates] = useState<FirecrawlPrice[]>([]);
  const [predictedPrice, setPredictedPrice] = useState<PredictedPrice | null>(null);
  const [isPredicting, setIsPredicting] = useState(false);
  const [savedDocId, setSavedDocId] = useState<string | null>(null);
  const [acrePrices, setAcrePrices] = useState<PropertyDetailsResponse['acre_prices']>([]);
  const [isFetchingAcrePrices, setIsFetchingAcrePrices] = useState(false);

  // Listen for user profile changes
  useEffect(() => {
    if (!user) return;
    const unsubscribe = initializeUserProfileListener(user.uid);
    return () => unsubscribe();
  }, [user, initializeUserProfileListener]);

  // Initialize state if property has existing price data
  useEffect(() => {

    if (selectedProperty?.acre_prices) {
      setShowAnalysis(true);
      setAcrePrices(selectedProperty.acre_prices);

      if (selectedProperty.predicted_price && selectedProperty.confidence_score && selectedProperty.price_reasoning) {
        setPredictedPrice({
          predicted_price: selectedProperty.predicted_price,
          confidence_score: selectedProperty.confidence_score,
          reasoning: selectedProperty.price_reasoning,
        });
      }
    }
  }, [selectedProperty]);

  if (!selectedProperty?.address) return null;

  const address = `${selectedProperty.address.streetAddress}, ${selectedProperty.address.city}, ${selectedProperty.address.state} ${selectedProperty.address.zipcode}`;
  const isPropertyInProgress = runningProperties.includes(address);

  const handleGenerate = async () => {
    addRunningProperty(address);
    setIsGenerating(true);
    // setIsFetchingPrices(true);
    setShowAnalysis(true);

    let finalAcrePrices = [];

    try {
      // Get acre prices for properties in the area
      setIsFetchingAcrePrices(true);
      if (!selectedProperty.address.zipcode) {
        throw new Error("Missing zip code for property");
      }

      const acrePricesResponse = await brain.get_acres_prices({
        city: selectedProperty.address.city,
        acres: selectedProperty.gisArea || 10, // Use GIS area or default to 10 acres
        zip_code: selectedProperty.address.zipcode
      });
      const acrePricesData = await acrePricesResponse.json();
      setAcrePrices(acrePricesData.prices);
      finalAcrePrices = acrePricesData.prices;
    } catch (error) {
      console.error("Error getting acre prices:", error);
    } finally {
      setIsFetchingAcrePrices(false);
      setIsGenerating(false);
    }

    // Calculate predicted price based on acre prices
    setIsPredicting(true);
    try {
      const stats = calculatePriceStats(finalAcrePrices);
      
      if (!stats || !selectedProperty.gisArea) {
        throw new Error("Insufficient data for prediction");
      }

      // Calculate predicted price
      const predictedValue = stats.mean * selectedProperty.gisArea;
      
      // Calculate confidence score (0-100)
      // Lower CV = higher confidence
      // CV of 0.5 or higher = 0% confidence
      // CV of 0 = 100% confidence
      const confidence = Math.max(0, Math.min(100, (1 - stats.cv * 2) * 100));
      
      // Generate reasoning
      const reasoning = `Analysis based on the largest cluster of similar properties (${stats.count} of ${stats.totalCount} properties) in ${selectedProperty.address.city.toUpperCase()}:  

• Average price per acre: ${formatCurrency(stats.mean)}  
• Range within cluster: ${formatCurrency(stats.min)} to ${formatCurrency(stats.max)} per acre  
• Price variation: ${(stats.cv * 100).toFixed(1)}%  
• Your property: ${selectedProperty.gisArea.toFixed(2)} acres  
• Outliers excluded: ${stats.outliers} properties  

This estimate uses similarity clustering to group properties with similar prices per acre (within 25% of each other) and selects the largest cluster for analysis. This ensures your estimate is based on the most common price pattern in the market, ignoring outliers. The coefficient of variation (${(stats.cv * 100).toFixed(1)}%) indicates the spread of prices within the cluster - a lower percentage suggests more consistent pricing.`;

      setPredictedPrice({
        predicted_price: formatCurrency(predictedValue),
        confidence_score: confidence.toFixed(0),
        reasoning: reasoning
      });
  
      // Update property with prediction and comparisons
      const updatedProperty = {
        ...selectedProperty,
        // priceComparisons: finalPriceEstimates,
        predicted_price: formatCurrency(predictedValue),
        confidence_score: confidence.toFixed(0),
        price_reasoning: reasoning,
        acre_prices: finalAcrePrices,
      };

      // Auto-save the property and decrease credits
      const docId = await savePropertyQuery(user.uid, updatedProperty);
      setSavedDocId(docId);
      await decreaseCredits(user.uid);
      setSelectedProperty(updatedProperty);
    } catch (error) {
      console.error("Error predicting price or saving property:", error);
      // Even if saving fails, update the state
      setSelectedProperty({
        ...selectedProperty,

      });
    } finally {
      setIsPredicting(false);
      removeRunningProperty(address);
    }
  };

  return (
    <div className="space-y-8 w-full max-w-[100%] overflow-hidden">
      {/* Market Value - Only show if exists */}
      {selectedProperty.marketValue && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
            <div className="flex items-center gap-2 p-4 border-b">
              <div className="h-6 w-6 flex items-center justify-center rounded-full bg-primary/10">
                <DollarSign className="h-4 w-4" />
              </div>
              <h4 className="text-base font-semibold">Market Value</h4>
            </div>
            <div className="p-6">
              <div className="text-3xl font-bold text-center">
                ${selectedProperty.marketValue.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Land Value - Only show if exists */}
      {selectedProperty.landValue && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
            <div className="flex items-center gap-2 p-4 border-b">
              <div className="h-6 w-6 flex items-center justify-center rounded-full bg-primary/10">
                <DollarSign className="h-4 w-4" />
              </div>
              <h4 className="text-base font-semibold">Land Value</h4>
            </div>
            <div className="p-6">
              <div className="text-3xl font-bold text-center">
                ${selectedProperty.landValue.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Generate Price</h3>
        {!showAnalysis && (
          <div className="flex flex-col items-center gap-4">
            {userProfile?.credits === 0 && (
              <Alert variant="destructive" className="max-w-sm">
                <CoinsIcon className="h-4 w-4" />
                <AlertDescription>
                  You're out of credits. Purchase more credits to continue analyzing properties.
                </AlertDescription>
              </Alert>
            )}
            {userProfile?.credits < 50 ? (
              <Alert variant="warning" className="max-w-sm bg-amber-500/20 text-amber-500 border-amber-500">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  You need at least 50 tokens to generate a price analysis. Please purchase more tokens.
                </AlertDescription>
              </Alert>
            ) : (
              <Button 
                onClick={handleGenerate} 
                disabled={isPropertyInProgress || userProfile?.credits === 0 || isLoadingProfile}
                className="w-full max-w-sm"
              >
                {isPropertyInProgress ? "Generating..." : "Generate"}
              </Button>
            )}
          </div>
        )}
      </div>



      {/* Acre Prices */}
      {showAnalysis && (
        isFetchingAcrePrices ? (
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
            <div className="flex items-center gap-2 p-4 border-b">
              <div className="h-6 w-6 flex items-center justify-center rounded-full bg-primary/10">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              <h4 className="text-base font-semibold">Loading Comparable Properties</h4>
            </div>
            <div className="p-6">
              <div className="overflow-x-auto w-[min(63vw,600px)]">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Address</TableHead>
                      <TableHead className="text-right text-muted-foreground">Size (Acres)</TableHead>
                      <TableHead className="text-right text-muted-foreground">Price (USD)</TableHead>
                      <TableHead className="text-right text-muted-foreground">Price/Acre</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[1, 2, 3].map((_, index) => (
                      <TableRow key={index} className="hover:bg-transparent">
                        <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        ) : !acrePrices ? null : acrePrices.length === 0 ? (
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
            <div className="flex items-center gap-2 p-4 border-b">
              <div className="h-6 w-6 flex items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
              <h4 className="text-base font-semibold">No Properties Found</h4>
            </div>
            <div className="p-6">
              <p className="text-sm text-muted-foreground">
                Unable to find properties for sale nearby to estimate price.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
            <div className="flex items-center gap-2 p-4 border-b">
              <div className="h-6 w-6 flex items-center justify-center rounded-full bg-primary/10">
                <Check className="h-4 w-4" />
              </div>
              <h4 className="text-base font-semibold">Comparable Properties</h4>
            </div>
            <div className="p-6">
              <div className="overflow-x-auto w-[min(63vw,400px)]">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Address</TableHead>
                      <TableHead className="text-right text-muted-foreground">Size (Acres)</TableHead>
                      <TableHead className="text-right text-muted-foreground">Price (USD)</TableHead>
                      <TableHead className="text-right text-muted-foreground">Price/Acre</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {acrePrices.map((property, index) => (
                      <TableRow key={index} className="hover:bg-transparent">
                        <TableCell className="font-medium break-words whitespace-normal">
                          {property.address || 'Unknown'}
                        </TableCell>
                        <TableCell className="text-right">
                          {property.acre?.toLocaleString() || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          ${property.price?.toLocaleString() || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {property.acre && property.price
                            ? `$${Math.round(property.price / property.acre).toLocaleString()}`
                            : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )
      )}



      {/* Predicted Price */}
      {showAnalysis && (
        isPredicting || isPropertyInProgress ? (
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
            <div className="flex items-center gap-2 p-4 border-b">
              <div className="h-6 w-6 flex items-center justify-center rounded-full bg-primary/10">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              <h4 className="text-base font-semibold">Predicting Price</h4>
            </div>
            <div className="p-6">
              <p className="text-sm text-muted-foreground">
                Analyzing market data and comparable properties...
              </p>
            </div>
          </div>
        ) : predictedPrice && (
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
            <div className="flex items-center gap-2 p-4 border-b">
              <div className="h-6 w-6 flex items-center justify-center rounded-full bg-primary/10">
                <DollarSign className="h-4 w-4" />
              </div>
              <h4 className="text-base font-semibold">Predicted Price</h4>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="text-3xl font-bold">{predictedPrice.predicted_price}</span>
                {/* Confidence score hidden
                <Badge variant={parseFloat(predictedPrice.confidence_score) > 0.7 ? "default" : "secondary"}>
                  {predictedPrice.confidence_score}% confidence
                </Badge>
                */}
              </div>
              <div className="prose prose-invert max-w-none text-sm overflow-x-auto overflow-y-visible break-words">
                <ReactMarkdown>{predictedPrice.reasoning}</ReactMarkdown>
              </div>
            </div>
          </div>
        )
      )}

      {/* Share and Regenerate Buttons */}
      {selectedProperty.predicted_price && !isPropertyInProgress && (
        <div className="flex justify-center gap-4">
          <Button
            variant="outline"
            onClick={handleGenerate}
            disabled={isPropertyInProgress || userProfile?.credits === 0 || isLoadingProfile}
          >
            {isPropertyInProgress ? "Regenerating..." : "Regenerate"}
          </Button>
          <Button
            onClick={async () => {
              const shareUrl = `${APP_BASE_PATH}?id=${selectedProperty.id}`;
              try {
                await navigator.share({
                  title: 'Landhacker',
                  text: address,
                  url: shareUrl,
                });
              } catch (error: any) {
                console.error('Error sharing:', error);
                // Fallback to copying to clipboard if sharing is not supported
                if (error.name === 'NotSupportedError') {
                  console.log('Share URL:', shareUrl);
                }
              }
            }}
          >
            Share Analysis
          </Button>
        </div>
      )}
    </div>
  );
}