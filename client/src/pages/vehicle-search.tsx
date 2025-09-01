import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Search, Car, Fuel, Settings, DollarSign, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface VehicleSearchResult {
  id: string;
  year: string;
  make: string;
  model: string;
  trim?: string;
  price: number;
  mileage?: number;
  color?: string;
  features: string[];
  mpg?: string;
  engine?: string;
  transmission?: string;
  drivetrain?: string;
  imageUrl?: string;
  detailsUrl: string;
  matchScore: number;
  matchReasons: string[];
}

interface VehicleSearchJob {
  id: string;
  customerQuery: string;
  websiteData: any;
  searchResults: VehicleSearchResult[];
  status: string;
  createdAt: string;
}

export default function VehicleSearch() {
  const [query, setQuery] = useState("");
  const [searchJobId, setSearchJobId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createSearchMutation = useMutation({
    mutationFn: async (customerQuery: string) => {
      const response = await fetch("/api/vehicle-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerQuery }),
      });
      if (!response.ok) {
        throw new Error("Failed to create search");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setSearchJobId(data.job.id);
      performSearch(data.job.id);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to start vehicle search",
        variant: "destructive",
      });
    },
  });

  const searchMutation = useMutation({
    mutationFn: async ({ jobId, websiteUrl }: { jobId: string; websiteUrl: string }) => {
      const response = await fetch(`/api/vehicle-search/${jobId}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl }),
      });
      if (!response.ok) {
        throw new Error("Failed to perform search");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicle-search", searchJobId] });
      toast({
        title: "Search Complete",
        description: "Found matching vehicles based on your preferences",
      });
    },
    onError: () => {
      toast({
        title: "Search Failed",
        description: "Unable to search for vehicles at this time",
        variant: "destructive",
      });
    },
  });

  const { data: searchJob } = useQuery({
    queryKey: ["/api/vehicle-search", searchJobId],
    enabled: !!searchJobId,
    refetchInterval: (data: any) => {
      return data?.job?.status === "processing" ? 2000 : false;
    },
  });

  const handleSearch = () => {
    if (!query.trim()) {
      toast({
        title: "Please enter a search query",
        description: "Tell us what kind of vehicle you're looking for",
        variant: "destructive",
      });
      return;
    }
    createSearchMutation.mutate(query);
  };

  const performSearch = (jobId: string) => {
    searchMutation.mutate({
      jobId,
      websiteUrl: "https://www.herrnsteinhyundai.com/",
    });
  };

  const results = (searchJob as any)?.job?.searchResults || [];
  const isSearching = createSearchMutation.isPending || searchMutation.isPending || (searchJob as any)?.job?.status === "processing";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              AI Vehicle Search
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              Tell us what you're looking for and our AI will find the perfect vehicle for you
            </p>
          </div>

          {/* Search Box */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                What vehicle are you looking for?
              </CardTitle>
              <CardDescription>
                Describe your ideal vehicle - include features, budget, fuel efficiency, or any other preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <Input
                  data-testid="input-vehicle-query"
                  placeholder="e.g., 'I need a fuel-efficient sedan under $25,000 with good safety features'"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                  className="flex-1"
                />
                <Button 
                  data-testid="button-search"
                  onClick={handleSearch} 
                  disabled={isSearching}
                  className="px-8"
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Search
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Search Status */}
          {(searchJob as any)?.job && (
            <Card className="mb-8">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Search Query:</p>
                    <p className="font-medium">{(searchJob as any).job.customerQuery}</p>
                  </div>
                  <Badge variant={
                    (searchJob as any).job.status === "completed" ? "default" :
                    (searchJob as any).job.status === "processing" ? "secondary" :
                    (searchJob as any).job.status === "failed" ? "destructive" : "outline"
                  }>
                    {(searchJob as any).job.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                Found {results.length} matching vehicles
              </h2>
              <div className="grid gap-6 md:grid-cols-2">
                {results
                  .sort((a: VehicleSearchResult, b: VehicleSearchResult) => b.matchScore - a.matchScore)
                  .map((vehicle: VehicleSearchResult) => (
                    <Card key={vehicle.id} className="overflow-hidden">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg">
                              {vehicle.year} {vehicle.make} {vehicle.model}
                              {vehicle.trim && ` ${vehicle.trim}`}
                            </CardTitle>
                            <CardDescription className="flex items-center gap-2 mt-2">
                              <DollarSign className="h-4 w-4" />
                              ${vehicle.price.toLocaleString()}
                              {vehicle.mileage !== undefined && vehicle.mileage > 0 && (
                                <>
                                  <Separator orientation="vertical" className="h-4" />
                                  <span>{vehicle.mileage.toLocaleString()} miles</span>
                                </>
                              )}
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-1">
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                            <span className="font-medium">{vehicle.matchScore}%</span>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {/* Vehicle specs */}
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          {vehicle.mpg && (
                            <div className="flex items-center gap-2">
                              <Fuel className="h-4 w-4 text-green-600" />
                              <span className="text-sm">{vehicle.mpg} MPG</span>
                            </div>
                          )}
                          {vehicle.engine && (
                            <div className="flex items-center gap-2">
                              <Settings className="h-4 w-4 text-blue-600" />
                              <span className="text-sm">{vehicle.engine}</span>
                            </div>
                          )}
                          {vehicle.transmission && (
                            <div className="flex items-center gap-2">
                              <Car className="h-4 w-4 text-gray-600" />
                              <span className="text-sm">{vehicle.transmission}</span>
                            </div>
                          )}
                          {vehicle.drivetrain && (
                            <div className="flex items-center gap-2">
                              <Car className="h-4 w-4 text-purple-600" />
                              <span className="text-sm">{vehicle.drivetrain}</span>
                            </div>
                          )}
                        </div>

                        {/* Match reasons */}
                        {vehicle.matchReasons.length > 0 && (
                          <div className="mb-4">
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Why this matches your needs:
                            </p>
                            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                              {vehicle.matchReasons.map((reason: string, index: number) => (
                                <li key={index} className="flex items-start gap-2">
                                  <span className="text-green-500 mt-0.5">•</span>
                                  {reason}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Features */}
                        {vehicle.features.length > 0 && (
                          <div className="mb-4">
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Key Features:
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {vehicle.features.slice(0, 6).map((feature: string, index: number) => (
                                <Badge key={index} variant="outline" className="text-xs">
                                  {feature}
                                </Badge>
                              ))}
                              {vehicle.features.length > 6 && (
                                <Badge variant="outline" className="text-xs">
                                  +{vehicle.features.length - 6} more
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}

                        <Button 
                          data-testid={`button-view-details-${vehicle.id}`}
                          className="w-full" 
                          onClick={() => window.open(vehicle.detailsUrl, '_blank')}
                        >
                          View Details
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!searchJob && !isSearching && (
            <Card className="text-center py-12">
              <CardContent>
                <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Start your vehicle search
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Enter your preferences above to find vehicles that match your needs
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}