import { type DealProcessingJob, type InsertDealProcessingJob } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  createDealProcessingJob(job: InsertDealProcessingJob): Promise<DealProcessingJob>;
  getDealProcessingJob(id: string): Promise<DealProcessingJob | undefined>;
  updateDealProcessingJob(id: string, updates: Partial<DealProcessingJob>): Promise<DealProcessingJob | undefined>;
  deleteDealProcessingJob(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private dealJobs: Map<string, DealProcessingJob>;

  constructor() {
    this.dealJobs = new Map();
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
}

export const storage = new MemStorage();
