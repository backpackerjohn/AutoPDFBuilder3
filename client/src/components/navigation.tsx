import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Car, FileText, Home } from "lucide-react";

export function Navigation() {
  const [location] = useLocation();

  return (
    <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
      <div className="container mx-auto">
        <div className="flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 text-xl font-bold text-blue-600 dark:text-blue-400">
              <Car className="h-6 w-6" />
              Herrnstein Hyundai AI
            </div>
          </Link>
          
          <div className="flex items-center gap-2">
            <Button
              data-testid="nav-home"
              variant={location === "/" ? "default" : "ghost"}
              asChild
            >
              <Link href="/">
                <Home className="h-4 w-4 mr-2" />
                Deal Processing
              </Link>
            </Button>
            
            <Button
              data-testid="nav-vehicle-search"
              variant={location === "/vehicle-search" ? "default" : "ghost"}
              asChild
            >
              <Link href="/vehicle-search">
                <Car className="h-4 w-4 mr-2" />
                Vehicle Search
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}