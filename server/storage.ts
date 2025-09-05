import { type DealProcessingJob, type InsertDealProcessingJob, type VehicleSearchJob, type InsertVehicleSearchJob, type PersistentDeal, type InsertPersistentDeal, dealProcessingJobs, vehicleSearchJobs, persistentDeals } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  createDealProcessingJob(job: InsertDealProcessingJob): Promise<DealProcessingJob>;
  getDealProcessingJob(id: string): Promise<DealProcessingJob | undefined>;
  updateDealProcessingJob(id: string, updates: Partial<DealProcessingJob>): Promise<DealProcessingJob | undefined>;
  deleteDealProcessingJob(id: string): Promise<boolean>;
  
  createVehicleSearchJob(job: InsertVehicleSearchJob): Promise<VehicleSearchJob>;
  getVehicleSearchJob(id: string): Promise<VehicleSearchJob | undefined>;
  updateVehicleSearchJob(id: string, updates: Partial<VehicleSearchJob>): Promise<VehicleSearchJob | undefined>;
  deleteVehicleSearchJob(id: string): Promise<boolean>;

  // Persistent deals for cross-device functionality
  createPersistentDeal(deal: InsertPersistentDeal): Promise<PersistentDeal>;
  getPersistentDeal(id: string): Promise<PersistentDeal | undefined>;
  updatePersistentDeal(id: string, updates: Partial<PersistentDeal>): Promise<PersistentDeal | undefined>;
  deletePersistentDeal(id: string): Promise<boolean>;
  listRecentPersistentDeals(limit?: number): Promise<PersistentDeal[]>;
}

export class MemStorage implements IStorage {
  private dealJobs: Map<string, DealProcessingJob>;
  private vehicleSearchJobs: Map<string, VehicleSearchJob>;
  private persistentDeals: Map<string, PersistentDeal>;

  constructor() {
    this.dealJobs = new Map();
    this.vehicleSearchJobs = new Map();
    this.persistentDeals = new Map();
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

  // Persistent deals for cross-device functionality
  async createPersistentDeal(insertDeal: InsertPersistentDeal): Promise<PersistentDeal> {
    const id = randomUUID();
    const now = new Date();
    const deal: PersistentDeal = {
      id,
      customerName: insertDeal.customerName || null,
      vehicleInfo: insertDeal.vehicleInfo as any || {},
      uploadedAssets: (insertDeal.uploadedAssets as string[]) || [],
      extractedData: insertDeal.extractedData as any || {},
      status: insertDeal.status || 'in_progress',
      createdAt: now,
      updatedAt: now,
    };
    this.persistentDeals.set(id, deal);
    return deal;
  }

  async getPersistentDeal(id: string): Promise<PersistentDeal | undefined> {
    return this.persistentDeals.get(id);
  }

  async updatePersistentDeal(id: string, updates: Partial<PersistentDeal>): Promise<PersistentDeal | undefined> {
    const existing = this.persistentDeals.get(id);
    if (!existing) return undefined;
    
    const updated = { 
      ...existing, 
      ...updates, 
      updatedAt: new Date() 
    };
    this.persistentDeals.set(id, updated);
    return updated;
  }

  async deletePersistentDeal(id: string): Promise<boolean> {
    return this.persistentDeals.delete(id);
  }

  async listRecentPersistentDeals(limit: number = 10): Promise<PersistentDeal[]> {
    const deals = Array.from(this.persistentDeals.values());
    return deals
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit);
  }
}

// DatabaseStorage implementation
export class DatabaseStorage implements IStorage {
  async createDealProcessingJob(insertJob: InsertDealProcessingJob): Promise<DealProcessingJob> {
    const [job] = await db
      .insert(dealProcessingJobs)
      .values(insertJob)
      .returning();
    return job;
  }

  async getDealProcessingJob(id: string): Promise<DealProcessingJob | undefined> {
    const [job] = await db.select().from(dealProcessingJobs).where(eq(dealProcessingJobs.id, id));
    return job || undefined;
  }

  async updateDealProcessingJob(id: string, updates: Partial<DealProcessingJob>): Promise<DealProcessingJob | undefined> {
    const [job] = await db
      .update(dealProcessingJobs)
      .set(updates)
      .where(eq(dealProcessingJobs.id, id))
      .returning();
    return job || undefined;
  }

  async deleteDealProcessingJob(id: string): Promise<boolean> {
    const result = await db.delete(dealProcessingJobs).where(eq(dealProcessingJobs.id, id));
    return (result.rowCount || 0) > 0;
  }

  async createVehicleSearchJob(insertJob: InsertVehicleSearchJob): Promise<VehicleSearchJob> {
    const [job] = await db
      .insert(vehicleSearchJobs)
      .values(insertJob)
      .returning();
    return job;
  }

  async getVehicleSearchJob(id: string): Promise<VehicleSearchJob | undefined> {
    const [job] = await db.select().from(vehicleSearchJobs).where(eq(vehicleSearchJobs.id, id));
    return job || undefined;
  }

  async updateVehicleSearchJob(id: string, updates: Partial<VehicleSearchJob>): Promise<VehicleSearchJob | undefined> {
    const [job] = await db
      .update(vehicleSearchJobs)
      .set(updates)
      .where(eq(vehicleSearchJobs.id, id))
      .returning();
    return job || undefined;
  }

  async deleteVehicleSearchJob(id: string): Promise<boolean> {
    const result = await db.delete(vehicleSearchJobs).where(eq(vehicleSearchJobs.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Persistent deals for cross-device functionality
  async createPersistentDeal(insertDeal: InsertPersistentDeal): Promise<PersistentDeal> {
    const [deal] = await db
      .insert(persistentDeals)
      .values(insertDeal)
      .returning();
    return deal;
  }

  async getPersistentDeal(id: string): Promise<PersistentDeal | undefined> {
    const [deal] = await db.select().from(persistentDeals).where(eq(persistentDeals.id, id));
    return deal || undefined;
  }

  async updatePersistentDeal(id: string, updates: Partial<PersistentDeal>): Promise<PersistentDeal | undefined> {
    const updatesWithTimestamp = {
      ...updates,
      updatedAt: new Date(),
    };
    
    const [deal] = await db
      .update(persistentDeals)
      .set(updatesWithTimestamp)
      .where(eq(persistentDeals.id, id))
      .returning();
    return deal || undefined;
  }

  async deletePersistentDeal(id: string): Promise<boolean> {
    const result = await db.delete(persistentDeals).where(eq(persistentDeals.id, id));
    return (result.rowCount || 0) > 0;
  }

  async listRecentPersistentDeals(limit: number = 10): Promise<PersistentDeal[]> {
    const deals = await db
      .select()
      .from(persistentDeals)
      .orderBy(desc(persistentDeals.updatedAt))
      .limit(limit);
    return deals;
  }
}

export const storage = new DatabaseStorage();
