import { GoogleGenAI } from "@google/genai";
import { ExtractedData, ConfidenceLevel, VehicleSearchResult } from "@shared/schema";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface ExtractionResult {
  data: Partial<ExtractedData> & { vin?: string; odometer?: string };
  confidence: Record<string, ConfidenceLevel>;
}

export class GeminiService {
  
  async extractFromDriversLicense(imageBase64: string, mimeType: string = "image/jpeg"): Promise<ExtractionResult> {
    const systemPrompt = `You are an expert OCR system specializing in US driver's licenses, especially Ohio licenses. 

CRITICAL: Carefully read ALL text on this driver's license and extract these 5 specific fields:

1. FIRST NAME: The person's first/given name only (no middle names)
2. LAST NAME: The person's family/surname only (IMPORTANT: On Ohio licenses, this is often the LAST word in the name line, not the middle name)
3. FULL ADDRESS: Complete street address, city, state, zip code
4. LICENSE NUMBER: The driver's license ID number (alphanumeric, varies by state)
5. EXPIRATION DATE: When the license expires (look for "EXP", "EXPIRES", or similar)

NAME EXTRACTION RULES:
- For names like "JOHN MICHAEL SMITH": firstName="JOHN", lastName="SMITH" (NOT "MICHAEL")
- Skip middle names/initials when extracting lastName
- Ohio licenses: The LAST word in the name section is usually the surname
- Look for patterns: "FIRST MIDDLE LAST" → extract FIRST and LAST only

Look carefully at:
- Large name text at the top (identify FIRST and LAST names only)
- Address sections (street, city, state, zip)
- License ID numbers (often with "DL" prefix or in dedicated sections)
- Date fields (especially expiration dates)

Respond with JSON in this exact format:
{
  "data": {
    "firstName": "extracted_first_name_or_null",
    "lastName": "extracted_last_name_or_null", 
    "address": "full_street_address_city_state_zip_or_null",
    "licenseNumber": "license_id_number_or_null",
    "licenseExpiration": "expiration_date_or_null"
  },
  "confidence": {
    "firstName": "high|medium|low",
    "lastName": "high|medium|low",
    "address": "high|medium|low", 
    "licenseNumber": "high|medium|low",
    "licenseExpiration": "high|medium|low"
  }
}

IMPORTANT: Include ALL fields even if some are null. For lastName, always extract the actual surname, not middle names.`;

    const contents = [
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType,
        },
      },
      systemPrompt,
    ];

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
      },
      contents: contents,
    });

    const rawJson = response.text;
    if (!rawJson) {
      throw new Error("Empty response from Gemini");
    }

    return JSON.parse(rawJson) as ExtractionResult;
  }

  async mapFormFields(
    templateName: string,
    fieldNames: string[],
    extractedData: any,
    contextText?: string
  ): Promise<Record<string, string | boolean>> {
    const systemPrompt = `You are an expert at mapping extracted data to PDF form fields.

Template: ${templateName}
Available extracted data: ${JSON.stringify(extractedData)}
${contextText ? `Context: ${contextText}` : ''}

Map the following PDF form field names to appropriate values from the extracted data:
${fieldNames.map(name => `- ${name}`).join('\n')}

Rules:
- Format dates as MM/DD/YY (e.g., 03/15/25)
- Format phone numbers as ###-###-#### 
- Return boolean true/false for checkbox fields
- Only include fields you can confidently map
- Use extracted data values when available

Respond with JSON: { "fieldName": "value" }`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
      },
      contents: systemPrompt,
    });

    const rawJson = response.text;
    if (!rawJson) {
      return {};
    }

    try {
      return JSON.parse(rawJson) as Record<string, string | boolean>;
    } catch (error) {
      console.error("Failed to parse Gemini form mapping response:", error);
      return {};
    }
  }

  async extractFromInsuranceCard(imageBase64: string, mimeType: string = "image/jpeg"): Promise<ExtractionResult> {
    const systemPrompt = `You are an expert at extracting information from insurance cards.
Extract only the insurance company name. Ignore policy numbers, VINs, and other details.

Respond with JSON in this exact format:
{
  "data": {
    "insuranceCompany": "extracted_company_name_or_null"
  },
  "confidence": {
    "insuranceCompany": "high|medium|low"
  }
}`;

    const contents = [
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType,
        },
      },
      systemPrompt,
    ];

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
      },
      contents: contents,
    });

    const rawJson = response.text;
    if (!rawJson) {
      throw new Error("Empty response from Gemini");
    }

    return JSON.parse(rawJson) as ExtractionResult;
  }

  async extractVinFromImage(imageBase64: string, mimeType: string = "image/jpeg"): Promise<ExtractionResult> {
    const systemPrompt = `You are an expert at reading Vehicle Identification Numbers (VINs) from images.
Extract the 17-character alphanumeric VIN code. VINs are exactly 17 characters long.

Respond with JSON in this exact format:
{
  "data": {
    "vin": "extracted_17_character_vin_or_null"
  },
  "confidence": {
    "vin": "high|medium|low"
  }
}`;

    const contents = [
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType,
        },
      },
      systemPrompt,
    ];

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
      },
      contents: contents,
    });

    const rawJson = response.text;
    if (!rawJson) {
      throw new Error("Empty response from Gemini");
    }

    return JSON.parse(rawJson) as ExtractionResult;
  }

  async extractOdometerReading(imageBase64: string, mimeType: string = "image/jpeg"): Promise<ExtractionResult> {
    const systemPrompt = `You are an expert at reading odometer displays from vehicle dashboards.
Extract the mileage reading from the odometer. Look for the main mileage number, ignore trip meters.

Respond with JSON in this exact format:
{
  "data": {
    "odometer": "extracted_mileage_number_or_null"
  },
  "confidence": {
    "odometer": "high|medium|low"
  }
}`;

    const contents = [
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType,
        },
      },
      systemPrompt,
    ];

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
      },
      contents: contents,
    });

    const rawJson = response.text;
    if (!rawJson) {
      throw new Error("Empty response from Gemini");
    }

    return JSON.parse(rawJson) as ExtractionResult;
  }

  async analyzeContextForTradeIn(dealInfo: string): Promise<ExtractionResult> {
    const systemPrompt = `You are an expert at extracting trade-in vehicle information from deal context.
Look for trade-in vehicle details like year, make, and model in the provided text.

Respond with JSON in this exact format:
{
  "data": {
    "tradeInYear": "extracted_year_or_null",
    "tradeInMake": "extracted_make_or_null", 
    "tradeInModel": "extracted_model_or_null"
  },
  "confidence": {
    "tradeInYear": "high|medium|low",
    "tradeInMake": "high|medium|low",
    "tradeInModel": "high|medium|low"
  }
}

Only include fields where you can extract data. Use null for missing data.`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
      },
      contents: dealInfo,
    });

    const rawJson = response.text;
    if (!rawJson) {
      throw new Error("Empty response from Gemini");
    }

    return JSON.parse(rawJson) as ExtractionResult;
  }

  async parseWebsiteInventory(websiteContent: string): Promise<VehicleSearchResult[]> {
    const systemPrompt = `You are an expert at extracting vehicle inventory information from dealership websites.

Extract all available vehicles from this website content. For each vehicle, extract:
- Year, make, model, trim
- Price (numeric value only)
- Mileage (if used vehicle)
- Color/exterior color
- Key features (array of strings)
- Engine specifications
- Transmission type
- Drivetrain (FWD/AWD/4WD)
- Image URL (if available)
- Details page URL

Respond with JSON array in this exact format:
[
  {
    "id": "unique_identifier_from_vin_or_stock",
    "year": "2025",
    "make": "Hyundai",
    "model": "Elantra",
    "trim": "SEL Sport",
    "price": 23209,
    "mileage": 0,
    "color": "Ecotronic Gray",
    "features": ["Apple CarPlay", "Android Auto", "Backup Camera"],
    "mpg": "30/39",
    "engine": "4 Cyl - 2.0 L",
    "transmission": "CVT",
    "drivetrain": "FWD",
    "imageUrl": "https://example.com/image.jpg",
    "detailsUrl": "https://example.com/vehicle-details",
    "matchScore": 0,
    "matchReasons": []
  }
]

Only include vehicles with clear pricing information. Skip any vehicles with missing essential data.`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
      },
      contents: websiteContent,
    });

    const rawJson = response.text;
    if (!rawJson) {
      return [];
    }

    try {
      const vehicles = JSON.parse(rawJson);
      return Array.isArray(vehicles) ? vehicles : [];
    } catch (error) {
      console.error("Failed to parse vehicle inventory:", error);
      return [];
    }
  }

  async matchVehiclesToQuery(customerQuery: string, vehicles: VehicleSearchResult[]): Promise<VehicleSearchResult[]> {
    const systemPrompt = `You are an expert automotive sales assistant. A customer is looking for a vehicle with these requirements:

"${customerQuery}"

Analyze each vehicle in the inventory and:
1. Assign a match score from 0-100 based on how well it fits their needs
2. Provide specific reasons why it matches or doesn't match
3. Consider factors like: price range, fuel efficiency, features, size, style preferences

Available vehicles:
${JSON.stringify(vehicles, null, 2)}

Respond with the same JSON array but with updated matchScore and matchReasons for each vehicle:
[
  {
    "id": "vehicle_id",
    "year": "2025",
    "make": "Hyundai",
    "model": "Elantra",
    "trim": "SEL Sport",
    "price": 23209,
    "mileage": 0,
    "color": "Ecotronic Gray",
    "features": ["Apple CarPlay", "Android Auto"],
    "mpg": "30/39",
    "engine": "4 Cyl - 2.0 L",
    "transmission": "CVT",
    "drivetrain": "FWD",
    "imageUrl": "https://example.com/image.jpg",
    "detailsUrl": "https://example.com/vehicle-details",
    "matchScore": 85,
    "matchReasons": ["Excellent fuel economy matches efficiency needs", "Affordable price point", "Modern tech features"]
  }
]

Sort by matchScore descending (best matches first).`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
      },
      contents: systemPrompt,
    });

    const rawJson = response.text;
    if (!rawJson) {
      return vehicles;
    }

    try {
      const matchedVehicles = JSON.parse(rawJson);
      return Array.isArray(matchedVehicles) ? matchedVehicles : vehicles;
    } catch (error) {
      console.error("Failed to parse vehicle matches:", error);
      return vehicles;
    }
  }
}

export const geminiService = new GeminiService();
