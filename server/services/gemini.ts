import { GoogleGenAI } from "@google/genai";
import { ExtractedData, ConfidenceLevel } from "@shared/schema";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface ExtractionResult {
  data: Partial<ExtractedData> & { vin?: string; odometer?: string };
  confidence: Record<string, ConfidenceLevel>;
}

export class GeminiService {
  
  async extractFromDriversLicense(imageBase64: string): Promise<ExtractionResult> {
    const systemPrompt = `You are an expert at extracting information from driver's licenses. 
Extract the following information and provide confidence scores:
- firstName (first name of license holder)
- lastName (last name of license holder) 
- address (full address from license)
- licenseNumber (driver's license number)
- licenseExpiration (expiration date)

Respond with JSON in this exact format:
{
  "data": {
    "firstName": "extracted_value_or_null",
    "lastName": "extracted_value_or_null", 
    "address": "extracted_value_or_null",
    "licenseNumber": "extracted_value_or_null",
    "licenseExpiration": "extracted_value_or_null"
  },
  "confidence": {
    "firstName": "high|medium|low",
    "lastName": "high|medium|low",
    "address": "high|medium|low", 
    "licenseNumber": "high|medium|low",
    "licenseExpiration": "high|medium|low"
  }
}

Only include fields where you can extract data. Use null for missing data.`;

    const contents = [
      {
        inlineData: {
          data: imageBase64,
          mimeType: "image/jpeg",
        },
      },
      systemPrompt,
    ];

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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
      model: process.env.GEMINI_MODEL || "gemini-1.5-pro",
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

  async extractFromInsuranceCard(imageBase64: string): Promise<ExtractionResult> {
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
          mimeType: "image/jpeg",
        },
      },
      systemPrompt,
    ];

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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

  async extractVinFromImage(imageBase64: string): Promise<ExtractionResult> {
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
          mimeType: "image/jpeg",
        },
      },
      systemPrompt,
    ];

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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

  async extractOdometerReading(imageBase64: string): Promise<ExtractionResult> {
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
          mimeType: "image/jpeg",
        },
      },
      systemPrompt,
    ];

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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
      model: "gemini-2.5-flash",
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
}

export const geminiService = new GeminiService();
