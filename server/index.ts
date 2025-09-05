import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { inventoryService } from "./services/inventoryService";
import { join } from "path";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Sanity warnings for required environment variables
if (!process.env.GEMINI_API_KEY) {
  console.warn('[WARN] GEMINI_API_KEY is not set; image/chat extraction will not work.');
}
if (!process.env.PUBLIC_OBJECT_SEARCH_PATHS) {
  console.warn('[WARN] PUBLIC_OBJECT_SEARCH_PATHS is not set; templates will not be found.');
}
if (!process.env.PRIVATE_OBJECT_DIR) {
  console.warn('[WARN] PRIVATE_OBJECT_DIR is not set; combined downloads may fail.');
}
if (process.env.USE_GEMINI_FORM_FILL === '1' && !process.env.GEMINI_API_KEY) {
  console.warn('[WARN] USE_GEMINI_FORM_FILL enabled but GEMINI_API_KEY missing; form filling will use fallback mapping.');
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Load inventory CSV at startup if it exists
  const inventoryPath = join(process.cwd(), 'data', 'inventory.csv');
  try {
    await inventoryService.loadInventoryCSV(inventoryPath);
    const stats = inventoryService.getInventoryStats();
    log(`✓ Loaded inventory: ${stats.totalVehicles} vehicles, ${stats.uniqueMakes} makes`);
  } catch (error) {
    log(`⚠ Inventory CSV not found at ${inventoryPath} - stock lookup will be unavailable`);
    log(`  Upload your inventory.csv file to the data/ directory to enable stock lookup`);
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
