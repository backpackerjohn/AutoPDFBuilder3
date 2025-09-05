import type { Express } from "express";
import { createServer, type Server } from "http";
import { randomUUID } from "crypto";
import multer from "multer";
import { storage } from "./storage";
import { geminiService } from "./services/gemini";
import { pdfProcessor } from "./services/pdfProcessor";
import { objectStorageService } from "./objectStorage";
import { inventoryService } from "./services/inventoryService";
import { insertDealProcessingJobSchema, insertVehicleSearchJobSchema, insertPersistentDealSchema, DocumentType, PDFTemplate, ExtractedData, ConfidenceLevel } from "@shared/schema";
import { z } from "zod";

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit - no practical restriction
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'application/octet-stream' // HEIC files often come through as this
    ];
    
    // Check MIME type OR file extension for HEIC/image files
    const fileName = file.originalname?.toLowerCase() || '';
    const isImageExtension = fileName.match(/\.(jpe?g|png|webp|heic|heif)$/i);
    const isAllowedMimeType = allowedMimeTypes.includes(file.mimetype.toLowerCase());
    
    if (isAllowedMimeType || isImageExtension) {
      cb(null, true);
    } else {
      cb(new Error(`Only image files (JPEG, JPG, PNG, WEBP, HEIC) are allowed. Got: ${file.mimetype}, filename: ${file.originalname}`));
    }
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Create deal files storage for uploaded images
  const dealFilesStorage = new Map<string, Record<string, File>>();
  
  // Get list of available PDF templates
  app.get("/api/templates", async (req, res) => {
    try {
      const templates = await objectStorageService.listPDFTemplates();
      res.json({ templates });
    } catch (error) {
      console.error("Error listing templates:", error);
      res.status(500).json({ error: "Failed to list templates" });
    }
  });

  // Upload a new PDF template
  app.post("/api/templates/upload", upload.single('file'), async (req, res) => {
    try {
      const { templateName } = req.body;
      
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      if (!templateName || typeof templateName !== 'string') {
        return res.status(400).json({ error: "Template name is required" });
      }

      if (req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({ error: "Only PDF files are allowed" });
      }

      // Upload the PDF template to storage
      await objectStorageService.uploadPDFTemplate(templateName, req.file.buffer);
      
      res.json({ 
        success: true,
        message: `Template '${templateName}' uploaded successfully`,
        templateName
      });

    } catch (error) {
      console.error("Error uploading template:", error);
      res.status(500).json({ error: "Failed to upload template" });
    }
  });

  // Download a PDF template
  app.get("/api/templates/:templateName", async (req, res) => {
    try {
      const { templateName } = req.params;
      const file = await objectStorageService.searchPDFTemplate(templateName);
      
      if (!file) {
        return res.status(404).json({ error: "Template not found" });
      }

      await objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error downloading template:", error);
      res.status(500).json({ error: "Failed to download template" });
    }
  });
  
  // Create a new deal processing job
  app.post("/api/deals", async (req, res) => {
    try {
      const validatedData = insertDealProcessingJobSchema.parse(req.body);
      const job = await storage.createDealProcessingJob(validatedData);
      res.json(job);
    } catch (error) {
      console.error("Error creating deal:", error);
      res.status(400).json({ error: "Invalid deal data" });
    }
  });

  // Get a deal processing job
  app.get("/api/deals/:id", async (req, res) => {
    try {
      const job = await storage.getDealProcessingJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Deal not found" });
      }
      res.json(job);
    } catch (error) {
      console.error("Error fetching deal:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Upload and process a document image
  app.post("/api/deals/:id/upload", upload.single('file'), async (req, res) => {
    try {
      const { id } = req.params;
      const { documentType } = req.body;
      
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      if (!DocumentType.safeParse(documentType).success) {
        return res.status(400).json({ error: "Invalid document type" });
      }

      const job = await storage.getDealProcessingJob(id);
      if (!job) {
        return res.status(404).json({ error: "Deal not found" });
      }

      // Convert image to base64
      const imageBase64 = req.file.buffer.toString('base64');
      
      // Detect actual MIME type for proper Gemini processing
      let actualMimeType = req.file.mimetype;
      if (req.file.mimetype === 'application/octet-stream') {
        const fileName = req.file.originalname?.toLowerCase() || '';
        if (fileName.match(/\.heic$/i)) {
          actualMimeType = 'image/heic';
        } else if (fileName.match(/\.heif$/i)) {
          actualMimeType = 'image/heif';
        } else if (fileName.match(/\.jpe?g$/i)) {
          actualMimeType = 'image/jpeg';
        } else if (fileName.match(/\.png$/i)) {
          actualMimeType = 'image/png';
        } else if (fileName.match(/\.webp$/i)) {
          actualMimeType = 'image/webp';
        }
      }
      
      // Process with Gemini AI based on document type
      let extractionResult;
      
      switch (documentType as DocumentType) {
        case 'drivers-license':
          extractionResult = await geminiService.extractFromDriversLicense(imageBase64, actualMimeType);
          break;
        case 'insurance':
          extractionResult = await geminiService.extractFromInsuranceCard(imageBase64, actualMimeType);
          break;
        case 'new-car-vin':
          extractionResult = await geminiService.extractVinFromImage(imageBase64, actualMimeType);
          // Map generic 'vin' to specific field
          if (extractionResult.data.vin) {
            extractionResult.data.newCarVin = extractionResult.data.vin;
            extractionResult.confidence.newCarVin = extractionResult.confidence.vin;
            delete extractionResult.data.vin;
            delete extractionResult.confidence.vin;
          }
          break;
        case 'new-car-odometer':
          extractionResult = await geminiService.extractOdometerReading(imageBase64, actualMimeType);
          // Map generic 'odometer' to specific field
          if (extractionResult.data.odometer) {
            extractionResult.data.newCarOdometer = extractionResult.data.odometer;
            extractionResult.confidence.newCarOdometer = extractionResult.confidence.odometer;
            delete extractionResult.data.odometer;
            delete extractionResult.confidence.odometer;
          }
          break;
        case 'trade-in-vin':
          extractionResult = await geminiService.extractVinFromImage(imageBase64, actualMimeType);
          // Map generic 'vin' to specific field
          if (extractionResult.data.vin) {
            extractionResult.data.tradeInVin = extractionResult.data.vin;
            extractionResult.confidence.tradeInVin = extractionResult.confidence.vin;
            delete extractionResult.data.vin;
            delete extractionResult.confidence.vin;
          }
          break;
        case 'trade-in-odometer':
          extractionResult = await geminiService.extractOdometerReading(imageBase64, actualMimeType);
          // Map generic 'odometer' to specific field
          if (extractionResult.data.odometer) {
            extractionResult.data.tradeInOdometer = extractionResult.data.odometer;
            extractionResult.confidence.tradeInOdometer = extractionResult.confidence.odometer;
            delete extractionResult.data.odometer;
            delete extractionResult.confidence.odometer;
          }
          break;
        case 'spot-registration':
          // No data extraction for spot registration
          extractionResult = { data: {}, confidence: {} };
          break;
        default:
          extractionResult = { data: {}, confidence: {} };
      }

      // Store the uploaded file for later PDF generation
      if (!dealFilesStorage.has(id)) {
        dealFilesStorage.set(id, {});
      }
      const jobFiles = dealFilesStorage.get(id)!;
      jobFiles[documentType] = req.file as any;

      // Update job with extracted data
      const updatedJob = await storage.updateDealProcessingJob(id, {
        uploadedFiles: {
          ...job.uploadedFiles,
          [documentType]: `uploaded_${documentType}_${Date.now()}`
        },
        extractedData: {
          ...job.extractedData,
          ...extractionResult.data
        },
        confidenceScores: {
          ...job.confidenceScores,
          ...extractionResult.confidence
        }
      });

      res.json({
        success: true,
        extractedData: extractionResult.data,
        confidence: extractionResult.confidence,
        job: updatedJob
      });

    } catch (error) {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ error: "AI extraction disabled: missing GEMINI_API_KEY" });
      }
      console.error("Error processing upload:", error);
      
      // Handle Gemini API overload gracefully
      if (error instanceof Error && error.message.includes('overloaded')) {
        // Still store the file even if AI processing fails
        if (!dealFilesStorage.has(req.params.id)) {
          dealFilesStorage.set(req.params.id, {});
        }
        const jobFiles = dealFilesStorage.get(req.params.id)!;
        jobFiles[req.body.documentType] = req.file! as any;
        
        // Get the job first 
        const currentJob = await storage.getDealProcessingJob(req.params.id);
        if (!currentJob) {
          return res.status(404).json({ error: "Deal not found" });
        }
        
        // Update job with file stored but no extracted data
        const updatedJob = await storage.updateDealProcessingJob(req.params.id, {
          uploadedFiles: {
            ...currentJob.uploadedFiles,
            [req.body.documentType]: `uploaded_${req.body.documentType}_${Date.now()}`
          }
        });
        
        return res.json({
          success: true,
          extractedData: {},
          confidence: {},
          job: updatedJob,
          warning: "AI processing temporarily unavailable - file uploaded successfully"
        });
      }
      
      return res.status(500).json({ error: (error as Error).message || "Failed to process document" });
    }
  });

  // Process deal information for context analysis
  app.post("/api/deals/:id/analyze-context", async (req, res) => {
    try {
      const { id } = req.params;
      const { dealInformation } = req.body;

      if (!dealInformation || typeof dealInformation !== 'string') {
        return res.status(400).json({ error: "Deal information is required" });
      }

      const job = await storage.getDealProcessingJob(id);
      if (!job) {
        return res.status(404).json({ error: "Deal not found" });
      }

      // Analyze deal information for trade-in context
      const contextResult = await geminiService.analyzeContextForTradeIn(dealInformation);

      // Update job with context analysis results
      const updatedJob = await storage.updateDealProcessingJob(id, {
        dealInformation,
        extractedData: {
          ...job.extractedData,
          ...contextResult.data
        },
        confidenceScores: {
          ...job.confidenceScores,
          ...contextResult.confidence
        }
      });

      res.json({
        success: true,
        extractedData: contextResult.data,
        confidence: contextResult.confidence,
        job: updatedJob
      });

    } catch (error) {
      console.error("Error analyzing context:", error);
      res.status(500).json({ error: "Failed to analyze deal context" });
    }
  });

  // Generate PDF documents
  app.post("/api/deals/:id/generate", async (req, res) => {
    try {
      const { id } = req.params;
      const { selectedTemplates, reviewedData } = req.body;

      const job = await storage.getDealProcessingJob(id);
      if (!job) {
        return res.status(404).json({ error: "Deal not found" });
      }

      // Validate that templates exist (get available templates from object storage)
      const availableTemplates = await objectStorageService.listPDFTemplates();
      const templateNames = availableTemplates; // listPDFTemplates returns string array
      
      const validTemplates = selectedTemplates?.filter((template: string) => 
        templateNames.includes(template)
      ) || [];

      if (validTemplates.length === 0) {
        return res.status(400).json({ 
          error: "No valid templates selected",
          availableTemplates: templateNames 
        });
      }

      // Use reviewed data if provided, otherwise use extracted data
      const finalData = reviewedData || job.extractedData;

      // Generate PDFs for each selected template
      const generatedDocs = [];
      
      for (const template of validTemplates) {
        try {
          const result = await pdfProcessor.fillPDFTemplate(
            template,
            finalData,
            job.confidenceScores || {},
            job.dealInformation || undefined
          );
          
          // Store PDF temporarily and create download URL
          const downloadKey = objectStorageService.storeTempPDF(result.fileName, Buffer.from(result.pdfBytes));
          
          generatedDocs.push({
            template,
            fileName: result.fileName,
            fieldsProcessed: result.fieldsProcessed,
            fieldsTotal: result.fieldsTotal,
            downloadUrl: `/api/download/${downloadKey}`
          });
          
        } catch (error) {
          console.error(`Error generating PDF for template ${template}:`, error);
        }
      }

      // Update job status
      const updatedJob = await storage.updateDealProcessingJob(id, {
        selectedTemplates: validTemplates,
        status: 'completed',
        generatedDocuments: generatedDocs.map(doc => doc.fileName)
      });

      // Always generate combined PDF
      let combinedDownloadUrl = null;
      const uploadedFiles = dealFilesStorage.get(id) || {};
      
      try {
        const combinedResult = await pdfProcessor.createCombinedPDF(
          validTemplates,
          finalData,
          job.confidenceScores || {},
          uploadedFiles,
          job.dealInformation || undefined
        );
        
        const combinedDownloadKey = objectStorageService.storeTempPDF(
          combinedResult.fileName, 
          Buffer.from(combinedResult.pdfBytes)
        );
        
        combinedDownloadUrl = `/api/download/${combinedDownloadKey}`;
      } catch (error) {
        console.error("Error generating combined PDF:", error);
        // Log error but don't fail the request
      }

      res.json({
        success: true,
        documents: generatedDocs,
        combinedDownloadUrl,
        job: updatedJob
      });

    } catch (error) {
      console.error("Error generating documents:", error);
      res.status(500).json({ error: "Failed to generate documents" });
    }
  });

  // Check if any extracted data has medium or low confidence
  app.get("/api/deals/:id/needs-review", async (req, res) => {
    try {
      const { id } = req.params;
      const job = await storage.getDealProcessingJob(id);
      
      if (!job) {
        return res.status(404).json({ error: "Deal not found" });
      }

      const confidenceScores = job.confidenceScores || {};
      const needsReview = Object.values(confidenceScores).some(
        confidence => confidence === 'medium' || confidence === 'low'
      );

      res.json({
        needsReview,
        extractedData: job.extractedData,
        confidenceScores
      });

    } catch (error) {
      console.error("Error checking review status:", error);
      res.status(500).json({ error: "Failed to check review status" });
    }
  });

  // Download generated PDF endpoint
  app.get("/api/download/:downloadKey", async (req, res) => {
    try {
      const { downloadKey } = req.params;
      const pdfData = objectStorageService.getTempPDF(downloadKey);
      
      if (!pdfData) {
        return res.status(404).json({ error: "Document not found or expired" });
      }

      res.set({
        'Content-Type': pdfData.contentType,
        'Content-Disposition': `attachment; filename="${pdfData.fileName}"`,
        'Content-Length': pdfData.buffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });

      res.send(pdfData.buffer);
    } catch (error) {
      console.error("Error downloading document:", error);
      res.status(500).json({ error: "Failed to download document" });
    }
  });

  // Inventory stock lookup endpoint
  app.get("/api/inventory/:stockNumber", async (req, res) => {
    try {
      const { stockNumber } = req.params;
      
      if (!stockNumber || typeof stockNumber !== 'string') {
        return res.status(400).json({ error: "Stock number is required" });
      }

      // Trim whitespace and convert to uppercase for consistent lookup
      const cleanStockNumber = stockNumber.trim().toUpperCase();
      
      // Look up vehicle in inventory
      const vehicle = inventoryService.lookupByStock(cleanStockNumber);
      
      if (!vehicle) {
        return res.status(404).json({ 
          error: "Vehicle not found",
          stockNumber: cleanStockNumber 
        });
      }

      // Return vehicle data in expected format
      res.json({
        stockNumber: vehicle.stockNumber,
        vin: vehicle.vin,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim,
        color: vehicle.color
      });

    } catch (error) {
      console.error("Error looking up inventory:", error);
      res.status(500).json({ error: "Failed to lookup vehicle inventory" });
    }
  });

  // Get inventory statistics
  app.get("/api/inventory/stats", async (req, res) => {
    try {
      const stats = inventoryService.getInventoryStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting inventory stats:", error);
      res.status(500).json({ error: "Failed to get inventory statistics" });
    }
  });

  // Vehicle search API routes
  app.post("/api/vehicle-search", async (req, res) => {
    try {
      const validatedData = insertVehicleSearchJobSchema.parse(req.body);
      const job = await storage.createVehicleSearchJob(validatedData);
      res.json({ job });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error creating vehicle search job:", error);
      res.status(500).json({ error: "Failed to create vehicle search job" });
    }
  });

  app.get("/api/vehicle-search/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const job = await storage.getVehicleSearchJob(id);
      
      if (!job) {
        return res.status(404).json({ error: "Vehicle search job not found" });
      }

      res.json({ job });
    } catch (error) {
      console.error("Error getting vehicle search job:", error);
      res.status(500).json({ error: "Failed to get vehicle search job" });
    }
  });

  app.post("/api/vehicle-search/:id/search", async (req, res) => {
    try {
      const { id } = req.params;
      const { websiteUrl } = req.body;
      
      const job = await storage.getVehicleSearchJob(id);
      if (!job) {
        return res.status(404).json({ error: "Vehicle search job not found" });
      }

      // Update status to processing
      await storage.updateVehicleSearchJob(id, { status: 'processing' });

      // Here we would normally fetch the website content
      // For now, we'll use the mock data from the dealership website
      const mockWebsiteContent = `
        2025 Hyundai Venue Limited - $23,209 - 29/32 MPG - Stock: 5VU324
        2025 Hyundai Elantra SEL Sport - $22,949 - 30/39 MPG - Stock: 5EL432
        2025 Hyundai Santa Cruz XRT - $38,834 - 18/26 MPG - AWD - Stock: 5SC454
        2025 Hyundai Elantra Hybrid SEL Sport - $26,449 - 49/52 MPG - Stock: 5EL483
        2025 Hyundai Tucson Hybrid - AWD - Various trims available
        2025 Hyundai Palisade - 3-row SUV - Various trims available
        2025 Hyundai Ioniq 5 - Electric SUV - $7500 Federal Tax Credit
        2025 Hyundai Ioniq 6 - Electric Sedan - Various trims available
      `;

      // Parse website inventory using AI
      const vehicles = await geminiService.parseWebsiteInventory(mockWebsiteContent);

      // Match vehicles to customer query using AI
      const matchedVehicles = await geminiService.matchVehiclesToQuery(job.customerQuery, vehicles);

      // Update job with results
      const updatedJob = await storage.updateVehicleSearchJob(id, {
        websiteData: { url: websiteUrl, content: mockWebsiteContent },
        searchResults: matchedVehicles,
        status: 'completed'
      });

      res.json({ 
        success: true, 
        searchResults: matchedVehicles,
        job: updatedJob 
      });

    } catch (error) {
      console.error("Error performing vehicle search:", error);
      await storage.updateVehicleSearchJob(req.params.id, { status: 'failed' });
      res.status(500).json({ error: "Failed to perform vehicle search" });
    }
  });

  // Persistent deals API routes for cross-device functionality
  
  // Create new persistent deal
  app.post("/api/persistent-deals", async (req, res) => {
    try {
      const validatedData = insertPersistentDealSchema.parse(req.body);
      const deal = await storage.createPersistentDeal(validatedData);
      res.json({ deal });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error creating persistent deal:", error);
      res.status(500).json({ error: "Failed to create persistent deal" });
    }
  });

  // List recent persistent deals
  app.get("/api/persistent-deals", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const deals = await storage.listRecentPersistentDeals(limit);
      res.json({ deals });
    } catch (error) {
      console.error("Error listing persistent deals:", error);
      res.status(500).json({ error: "Failed to list persistent deals" });
    }
  });

  // Get specific persistent deal
  app.get("/api/persistent-deals/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deal = await storage.getPersistentDeal(id);
      
      if (!deal) {
        return res.status(404).json({ error: "Persistent deal not found" });
      }

      res.json({ deal });
    } catch (error) {
      console.error("Error getting persistent deal:", error);
      res.status(500).json({ error: "Failed to get persistent deal" });
    }
  });

  // Update persistent deal
  app.put("/api/persistent-deals/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Validate input data (allow partial updates)
      const validatedData = insertPersistentDealSchema.partial().parse(req.body);
      
      const deal = await storage.updatePersistentDeal(id, validatedData);
      
      if (!deal) {
        return res.status(404).json({ error: "Persistent deal not found" });
      }

      res.json({ deal });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error updating persistent deal:", error);
      res.status(500).json({ error: "Failed to update persistent deal" });
    }
  });

  // Upload and attach assets to persistent deal
  app.post("/api/persistent-deals/:id/assets", upload.single('file'), async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Fetch the persistent deal to verify it exists
      const deal = await storage.getPersistentDeal(id);
      if (!deal) {
        return res.status(404).json({ error: "Persistent deal not found" });
      }

      // Generate unique filename using Date.now() and randomUUID()
      const fileName = `${Date.now()}-${randomUUID()}-${req.file.originalname}`;
      
      // Upload file to object storage
      await objectStorageService.uploadDealFile(
        id,
        fileName,
        req.file.buffer,
        req.file.mimetype
      );

      // Generate signed URL for the uploaded file
      const downloadUrl = await objectStorageService.generateDealFileDownloadURL(id, fileName);
      
      if (!downloadUrl) {
        // Clean up the uploaded file since we can't generate a URL
        await objectStorageService.deleteDealFile(id, fileName);
        return res.status(500).json({ error: "Failed to generate download URL for uploaded file" });
      }

      // Update the deal's uploadedAssets array with the signed URL - wrap in try/catch for cleanup
      try {
        const updatedAssets = [...(deal.uploadedAssets || []), downloadUrl];
        const updatedDeal = await storage.updatePersistentDeal(id, {
          uploadedAssets: updatedAssets
        });

        res.json({ 
          success: true,
          fileName,
          downloadUrl,
          deal: updatedDeal
        });
      } catch (dbError) {
        // If DB update fails, clean up the orphaned object
        await objectStorageService.deleteDealFile(id, fileName);
        console.error("Database update failed, cleaned up orphaned file:", dbError);
        throw dbError; // Re-throw so client sees the error
      }

    } catch (error) {
      console.error("Error uploading asset to persistent deal:", error);
      res.status(500).json({ error: "Failed to upload asset" });
    }
  });

  // Get signed URLs for persistent deal files
  app.get("/api/persistent-deals/:id/files", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get the deal to verify it exists
      const deal = await storage.getPersistentDeal(id);
      if (!deal) {
        return res.status(404).json({ error: "Persistent deal not found" });
      }

      // Get list of files and generate download URLs
      const fileList = await objectStorageService.listDealFiles(id);
      const filesWithUrls = await Promise.all(
        fileList.map(async (file) => {
          const downloadURL = await objectStorageService.generateDealFileDownloadURL(id, file.fileName);
          return {
            ...file,
            downloadURL
          };
        })
      );

      res.json({ 
        files: filesWithUrls
      });

    } catch (error) {
      console.error("Error getting persistent deal files:", error);
      res.status(500).json({ error: "Failed to get deal files" });
    }
  });

  // Get upload URL for persistent deal file
  app.post("/api/persistent-deals/:id/upload-url", async (req, res) => {
    try {
      const { id } = req.params;
      const { fileName } = req.body;
      
      if (!fileName) {
        return res.status(400).json({ error: "File name is required" });
      }

      // Get the deal to verify it exists
      const deal = await storage.getPersistentDeal(id);
      if (!deal) {
        return res.status(404).json({ error: "Persistent deal not found" });
      }

      // Generate unique file name with timestamp
      const uniqueFileName = `${Date.now()}-${fileName}`;
      const uploadURL = await objectStorageService.generateDealFileUploadURL(id, uniqueFileName);

      res.json({ 
        uploadURL,
        fileName: uniqueFileName
      });

    } catch (error) {
      console.error("Error generating upload URL for persistent deal:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Health endpoint to verify environment readiness and configuration
  app.get("/api/health", async (req, res) => {
    res.json({
      ok: {
        geminiKey: !!process.env.GEMINI_API_KEY,
        publicPaths: !!process.env.PUBLIC_OBJECT_SEARCH_PATHS,
        privateDir: !!process.env.PRIVATE_OBJECT_DIR,
      },
      now: new Date().toISOString(),
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
