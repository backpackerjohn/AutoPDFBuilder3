import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface InventoryItem {
  stockNumber: string;
  year: string;
  make: string;
  model: string;
  vin: string;
  trim: string;
  color: string; // Maps from 'Exterior' column
}

export interface InventoryStats {
  totalVehicles: number;
  uniqueMakes: number;
  uniqueModels: number;
  yearRange: { min: number; max: number } | null;
  lastLoaded: Date | null;
}

class InventoryService {
  private inventory: Map<string, InventoryItem> = new Map();
  private stats: InventoryStats = {
    totalVehicles: 0,
    uniqueMakes: 0,
    uniqueModels: 0,
    yearRange: null,
    lastLoaded: null
  };

  /**
   * Load inventory from CSV file and build in-memory lookup table
   * Expected CSV columns: Stock Number, Year, Make, Model, VIN, Trim, Exterior
   */
  async loadInventoryCSV(filePath: string): Promise<void> {
    try {
      if (!existsSync(filePath)) {
        throw new Error(`Inventory CSV file not found: ${filePath}`);
      }

      const csvContent = readFileSync(filePath, 'utf-8');
      const lines = csvContent.split('\n').filter(line => line.trim().length > 0);
      
      if (lines.length === 0) {
        throw new Error('CSV file is empty');
      }

      // Parse header row to map column positions
      const headerLine = lines[0];
      const headers = this.parseCSVLine(headerLine);
      const columnMap = this.buildColumnMap(headers);

      // Validate required columns exist
      this.validateRequiredColumns(columnMap);

      // Clear existing inventory
      this.inventory.clear();

      // Parse data rows
      const inventoryItems: InventoryItem[] = [];
      for (let i = 1; i < lines.length; i++) {
        try {
          const item = this.parseInventoryRow(lines[i], columnMap);
          if (item) {
            // Use trimmed stock number as key for fast lookup
            const stockKey = item.stockNumber.trim().toLowerCase();
            this.inventory.set(stockKey, item);
            inventoryItems.push(item);
          }
        } catch (error) {
          console.warn(`Error parsing row ${i + 1}: ${error}`);
          // Continue processing other rows
        }
      }

      // Update statistics
      this.updateStats(inventoryItems);

      console.log(`Successfully loaded ${this.inventory.size} vehicles from ${filePath}`);
      
    } catch (error) {
      console.error('Failed to load inventory CSV:', error);
      throw error;
    }
  }

  /**
   * Look up vehicle by stock number
   * @param stockNumber - Stock number to search for (case insensitive, whitespace trimmed)
   * @returns InventoryItem if found, null otherwise
   */
  lookupByStock(stockNumber: string): InventoryItem | null {
    if (!stockNumber || typeof stockNumber !== 'string') {
      return null;
    }

    const stockKey = stockNumber.trim().toLowerCase();
    return this.inventory.get(stockKey) || null;
  }

  /**
   * Get current inventory statistics
   */
  getInventoryStats(): InventoryStats {
    return { ...this.stats };
  }

  /**
   * Get all inventory items (useful for debugging or displaying full inventory)
   */
  getAllInventory(): InventoryItem[] {
    return Array.from(this.inventory.values());
  }

  /**
   * Search inventory by multiple criteria
   */
  searchInventory(criteria: {
    make?: string;
    model?: string;
    year?: string;
    color?: string;
  }): InventoryItem[] {
    const results: InventoryItem[] = [];

    const allItems = Array.from(this.inventory.values());
    for (const item of allItems) {
      let matches = true;

      if (criteria.make && !item.make.toLowerCase().includes(criteria.make.toLowerCase())) {
        matches = false;
      }
      if (criteria.model && !item.model.toLowerCase().includes(criteria.model.toLowerCase())) {
        matches = false;
      }
      if (criteria.year && item.year !== criteria.year) {
        matches = false;
      }
      if (criteria.color && !item.color.toLowerCase().includes(criteria.color.toLowerCase())) {
        matches = false;
      }

      if (matches) {
        results.push(item);
      }
    }

    return results;
  }

  /**
   * Parse a single CSV line, handling quoted fields and commas within quotes
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote within quoted field
          current += '"';
          i += 2;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        result.push(current.trim());
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }

    // Add the last field
    result.push(current.trim());
    return result;
  }

  /**
   * Build mapping from column names to indices
   */
  private buildColumnMap(headers: string[]): Record<string, number> {
    const map: Record<string, number> = {};
    
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].trim().toLowerCase();
      
      // Map variations of column names to standard keys
      if (header.includes('stock') && header.includes('number')) {
        map.stockNumber = i;
      } else if (header === 'year') {
        map.year = i;
      } else if (header === 'make') {
        map.make = i;
      } else if (header === 'model') {
        map.model = i;
      } else if (header === 'vin') {
        map.vin = i;
      } else if (header === 'trim') {
        map.trim = i;
      } else if (header === 'exterior' || header === 'color') {
        map.exterior = i;
      }
    }

    return map;
  }

  /**
   * Validate that all required columns are present
   */
  private validateRequiredColumns(columnMap: Record<string, number>): void {
    const required = ['stockNumber', 'year', 'make', 'model', 'vin'];
    const missing = required.filter(col => columnMap[col] === undefined);
    
    if (missing.length > 0) {
      throw new Error(`Missing required columns: ${missing.join(', ')}`);
    }
  }

  /**
   * Parse a single inventory row from CSV
   */
  private parseInventoryRow(line: string, columnMap: Record<string, number>): InventoryItem | null {
    const fields = this.parseCSVLine(line);
    
    // Extract required fields
    const stockNumber = fields[columnMap.stockNumber]?.trim();
    const year = fields[columnMap.year]?.trim();
    const make = fields[columnMap.make]?.trim();
    const model = fields[columnMap.model]?.trim();
    const vin = fields[columnMap.vin]?.trim();
    
    // Skip rows missing critical data
    if (!stockNumber || !year || !make || !model || !vin) {
      return null;
    }

    // Extract optional fields
    const trim = fields[columnMap.trim]?.trim() || '';
    const color = fields[columnMap.exterior]?.trim() || '';

    return {
      stockNumber,
      year,
      make,
      model,
      vin,
      trim,
      color
    };
  }

  /**
   * Update inventory statistics
   */
  private updateStats(items: InventoryItem[]): void {
    const makes = new Set<string>();
    const models = new Set<string>();
    const years: number[] = [];

    for (const item of items) {
      makes.add(item.make.toLowerCase());
      models.add(`${item.make} ${item.model}`.toLowerCase());
      
      const year = parseInt(item.year);
      if (!isNaN(year)) {
        years.push(year);
      }
    }

    this.stats = {
      totalVehicles: items.length,
      uniqueMakes: makes.size,
      uniqueModels: models.size,
      yearRange: years.length > 0 ? {
        min: Math.min(...years),
        max: Math.max(...years)
      } : null,
      lastLoaded: new Date()
    };
  }
}

// Export singleton instance
export const inventoryService = new InventoryService();