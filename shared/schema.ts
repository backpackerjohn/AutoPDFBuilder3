import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const dealProcessingJobs = pgTable("deal_processing_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dealInformation: text("deal_information"),
  inventoryQuery: text("inventory_query"),
  uploadedFiles: jsonb("uploaded_files").$type<Record<string, string>>().default({}),
  selectedTemplates: jsonb("selected_templates").$type<string[]>().default([]),
  extractedData: jsonb("extracted_data").$type<Record<string, any>>().default({}),
  confidenceScores: jsonb("confidence_scores").$type<Record<string, 'high' | 'medium' | 'low'>>().default({}),
  status: varchar("status", { length: 50 }).notNull().default('pending'),
  generatedDocuments: jsonb("generated_documents").$type<string[]>().default([]),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

export const insertDealProcessingJobSchema = createInsertSchema(dealProcessingJobs).omit({
  id: true,
  createdAt: true,
});

export type InsertDealProcessingJob = z.infer<typeof insertDealProcessingJobSchema>;
export type DealProcessingJob = typeof dealProcessingJobs.$inferSelect;

// Confidence levels for extracted data
export const ConfidenceLevel = z.enum(['high', 'medium', 'low']);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevel>;

// Document types that can be uploaded
export const DocumentType = z.enum([
  'drivers-license',
  'insurance',
  'spot-registration',
  'new-car-vin',
  'new-car-odometer', 
  'trade-in-vin',
  'trade-in-odometer'
]);
export type DocumentType = z.infer<typeof DocumentType>;

// Available PDF templates
export const PDFTemplate = z.enum([
  'deal-check',
  'delivery-receipt',
  'we-owe',
  'trade-agreement',
  'bill-of-sale',
  'odometer-disclosure'
]);
export type PDFTemplate = z.infer<typeof PDFTemplate>;

// Extracted data structure
export const ExtractedDataSchema = z.object({
  // Customer information
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  address: z.string().optional(),
  licenseNumber: z.string().optional(),
  licenseExpiration: z.string().optional(),
  
  // Insurance
  insuranceCompany: z.string().optional(),
  
  // New car details
  newCarVin: z.string().optional(),
  newCarOdometer: z.string().optional(),
  
  // Trade-in details
  tradeInVin: z.string().optional(),
  tradeInOdometer: z.string().optional(),
  tradeInYear: z.string().optional(),
  tradeInMake: z.string().optional(),
  tradeInModel: z.string().optional(),
});

export type ExtractedData = z.infer<typeof ExtractedDataSchema>;

// Vehicle search and inventory data
export const vehicleSearchJobs = pgTable("vehicle_search_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerQuery: text("customer_query").notNull(),
  websiteData: jsonb("website_data").$type<Record<string, any>>().default({}),
  searchResults: jsonb("search_results").$type<VehicleSearchResult[]>().default([]),
  status: varchar("status", { length: 50 }).notNull().default('pending'),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

export const insertVehicleSearchJobSchema = createInsertSchema(vehicleSearchJobs).omit({
  id: true,
  createdAt: true,
});

export type InsertVehicleSearchJob = z.infer<typeof insertVehicleSearchJobSchema>;
export type VehicleSearchJob = typeof vehicleSearchJobs.$inferSelect;

// Vehicle search result structure
export const VehicleSearchResultSchema = z.object({
  id: z.string(),
  year: z.string(),
  make: z.string(),
  model: z.string(),
  trim: z.string().optional(),
  price: z.number(),
  mileage: z.number().optional(),
  color: z.string().optional(),
  features: z.array(z.string()).default([]),
  mpg: z.string().optional(),
  engine: z.string().optional(),
  transmission: z.string().optional(),
  drivetrain: z.string().optional(),
  imageUrl: z.string().optional(),
  detailsUrl: z.string(),
  matchScore: z.number().min(0).max(100),
  matchReasons: z.array(z.string()).default([]),
});

export type VehicleSearchResult = z.infer<typeof VehicleSearchResultSchema>;

// Persistent deals for cross-device functionality
export const persistentDeals = pgTable("persistent_deals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerName: text("customer_name"),
  vehicleInfo: jsonb("vehicle_info").$type<{
    stockNumber?: string;
    vin?: string;
    year?: string;
    make?: string;
    model?: string;
    trim?: string;
    color?: string;
  }>().default({}),
  uploadedAssets: jsonb("uploaded_assets").$type<string[]>().default([]),
  extractedData: jsonb("extracted_data").$type<ExtractedData>().default({}),
  status: varchar("status", { length: 50 }).notNull().default('in_progress'),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
});

export const insertPersistentDealSchema = createInsertSchema(persistentDeals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPersistentDeal = z.infer<typeof insertPersistentDealSchema>;
export type PersistentDeal = typeof persistentDeals.$inferSelect;
