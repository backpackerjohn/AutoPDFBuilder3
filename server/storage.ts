import { type DealProcessingJob, type InsertDealProcessingJob, type VehicleSearchJob, type InsertVehicleSearchJob } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  createDealProcessingJob(job: InsertDealProcessingJob): Promise<DealProcessingJob>;
  getDealProcessingJob(id: string): Promise<DealProcessingJob | undefined>;
  updateDealProcessingJob(id: string, updates: Partial<DealProcessingJob>): Promise<DealProcessingJob | undefined>;
  deleteDealProcessingJob(id: string): Promise<boolean>;
  
  createVehicleSearchJob(job: InsertVehicleSearchJob): Promise<VehicleSearchJob>;
  getVehicleSearchJob(id: string): Promise<VehicleSearchJob | undefined>;
  updateVehicleSearchJob(id: string, updates: Partial<VehicleSearchJob>): Promise<VehicleSearchJob | undefined>;
  deleteVehicleSearchJob(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private dealJobs: Map<string, DealProcessingJob>;
  private vehicleSearchJobs: Map<string, VehicleSearchJob>;

  constructor() {
    this.dealJobs = new Map();
    this.vehicleSearchJobs = new Map();
  }

  async createDealProcessingJob(insertJob: InsertDealProcessingJob): Promise<DealProcessingJob> {
    const id = randomUUID();
    const job: DealProcessingJob = {
      id,
      dealInformation: insertJob.dealInformation || null,
      inventoryQuery: insertJob.inventoryQuery || null,
      uploadedFiles: insertJob.uploadedFiles || {},
      selectedTemplates: (insertJob.selectedTemplates as string[]) || [],
      extractedData: insertJob.extractedData || {},
      confidenceScores: (insertJob.confidenceScores as Record<string, 'high' | 'medium' | 'low'>) || {},
      status: insertJob.status || 'pending',
      generatedDocuments: (insertJob.generatedDocuments as string[]) || [],
      createdAt: new Date(),
    };
    this.dealJobs.set(id, job);
    return job;
  }

  async getDealProcessingJob(id: string): Promise<DealProcessingJob | undefined> {
    return this.dealJobs.get(id);
  }

  async updateDealProcessingJob(id: string, updates: Partial<DealProcessingJob>): Promise<DealProcessingJob | undefined> {
    const existing = this.dealJobs.get(id);
    if (!existing) return undefined;
    
    const updated = { ...existing, ...updates };
    this.dealJobs.set(id, updated);
    return updated;
  }

  async deleteDealProcessingJob(id: string): Promise<boolean> {
    return this.dealJobs.delete(id);
  }

  async createVehicleSearchJob(insertJob: InsertVehicleSearchJob): Promise<VehicleSearchJob> {
    const id = randomUUID();
    const job: VehicleSearchJob = {
      id,
      customerQuery: insertJob.customerQuery,
      websiteData: insertJob.websiteData || {},
      searchResults: (insertJob.searchResults as any[]) || [],
      status: insertJob.status || 'pending',
      createdAt: new Date(),
    };
    this.vehicleSearchJobs.set(id, job);
    return job;
  }

  async getVehicleSearchJob(id: string): Promise<VehicleSearchJob | undefined> {
    return this.vehicleSearchJobs.get(id);
  }

  async updateVehicleSearchJob(id: string, updates: Partial<VehicleSearchJob>): Promise<VehicleSearchJob | undefined> {
    const existing = this.vehicleSearchJobs.get(id);
    if (!existing) return undefined;
    
    const updated = { ...existing, ...updates };
    this.vehicleSearchJobs.set(id, updated);
    return updated;
  }

  async deleteVehicleSearchJob(id: string): Promise<boolean> {
    return this.vehicleSearchJobs.delete(id);
  }
}

export const storage = new MemStorage();
