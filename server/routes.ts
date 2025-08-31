import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { geminiService } from "./services/gemini";
import { pdfProcessor } from "./services/pdfProcessor";
import { objectStorageService } from "./objectStorage";
import { insertDealProcessingJobSchema, DocumentType, PDFTemplate, ExtractedData, ConfidenceLevel } from "@shared/schema";
import { z } from "zod";

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
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
      
      // Process with Gemini AI based on document type
      let extractionResult;
      
      switch (documentType as DocumentType) {
        case 'drivers-license':
          extractionResult = await geminiService.extractFromDriversLicense(imageBase64);
          break;
        case 'insurance':
          extractionResult = await geminiService.extractFromInsuranceCard(imageBase64);
          break;
        case 'new-car-vin':
          extractionResult = await geminiService.extractVinFromImage(imageBase64);
          // Map generic 'vin' to specific field
          if (extractionResult.data.vin) {
            extractionResult.data.newCarVin = extractionResult.data.vin;
            extractionResult.confidence.newCarVin = extractionResult.confidence.vin;
            delete extractionResult.data.vin;
            delete extractionResult.confidence.vin;
          }
          break;
        case 'new-car-odometer':
          extractionResult = await geminiService.extractOdometerReading(imageBase64);
          // Map generic 'odometer' to specific field
          if (extractionResult.data.odometer) {
            extractionResult.data.newCarOdometer = extractionResult.data.odometer;
            extractionResult.confidence.newCarOdometer = extractionResult.confidence.odometer;
            delete extractionResult.data.odometer;
            delete extractionResult.confidence.odometer;
          }
          break;
        case 'trade-in-vin':
          extractionResult = await geminiService.extractVinFromImage(imageBase64);
          // Map generic 'vin' to specific field
          if (extractionResult.data.vin) {
            extractionResult.data.tradeInVin = extractionResult.data.vin;
            extractionResult.confidence.tradeInVin = extractionResult.confidence.vin;
            delete extractionResult.data.vin;
            delete extractionResult.confidence.vin;
          }
          break;
        case 'trade-in-odometer':
          extractionResult = await geminiService.extractOdometerReading(imageBase64);
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
      jobFiles[documentType] = req.file;

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
      console.error("Error processing upload:", error);
      
      // Handle Gemini API overload gracefully
      if (error instanceof Error && error.message.includes('overloaded')) {
        // Still store the file even if AI processing fails
        if (!dealFilesStorage.has(req.params.id)) {
          dealFilesStorage.set(req.params.id, {});
        }
        const jobFiles = dealFilesStorage.get(req.params.id)!;
        jobFiles[req.body.documentType] = req.file!;
        
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
      
      res.status(500).json({ error: "Failed to process document" });
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
            job.confidenceScores || {}
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

      // Also generate combined PDF if there are uploaded files
      let combinedDownloadUrl = null;
      const uploadedFiles = dealFilesStorage.get(id);
      
      if (uploadedFiles && Object.keys(uploadedFiles).length > 0) {
        try {
          const combinedResult = await pdfProcessor.createCombinedPDF(
            validTemplates,
            finalData,
            job.confidenceScores || {},
            uploadedFiles
          );
          
          const combinedDownloadKey = objectStorageService.storeTempPDF(
            combinedResult.fileName, 
            Buffer.from(combinedResult.pdfBytes)
          );
          
          combinedDownloadUrl = `/api/download/${combinedDownloadKey}`;
        } catch (error) {
          console.error("Error generating combined PDF:", error);
        }
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

  const httpServer = createServer(app);
  return httpServer;
}
