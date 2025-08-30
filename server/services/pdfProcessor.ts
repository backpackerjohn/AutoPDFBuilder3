import { PDFDocument, PDFForm, PDFTextField, PDFCheckBox, PDFRadioGroup } from 'pdf-lib';
import { ExtractedData, PDFTemplate, ConfidenceLevel } from '@shared/schema';
import { objectStorageService } from '../objectStorage';

export interface PDFProcessingResult {
  fileName: string;
  pdfBytes: Uint8Array;
  fieldsProcessed: number;
  fieldsTotal: number;
}

export class PDFProcessor {
  
  async fillPDFTemplate(
    template: PDFTemplate, 
    extractedData: Partial<ExtractedData>,
    confidenceScores: Record<string, ConfidenceLevel>
  ): Promise<PDFProcessingResult> {
    
    // Add current date to extracted data
    const currentDate = new Date();
    const formattedDate = this.formatDateForPDF(currentDate);
    const enhancedData = {
      ...extractedData,
      currentDate: formattedDate,
      todaysDate: formattedDate,
      date: formattedDate,
    };
    
    // Try to load the actual PDF template from storage
    const templateBuffer = await objectStorageService.downloadPDFTemplate(template);
    
    let pdfDoc: PDFDocument;
    let fieldsProcessed = 0;
    let fieldsTotal = 0;
    
    if (templateBuffer) {
      // Load the actual fillable PDF template
      pdfDoc = await PDFDocument.load(templateBuffer);
      const form = pdfDoc.getForm();
      
      if (form) {
        const fields = form.getFields();
        fieldsTotal = fields.length;
        
        // Fill out the form fields with extracted data
        for (const field of fields) {
          const fieldName = field.getName();
          const mappedDataKey = this.mapFieldNameToDataKey(fieldName, template);
          
          if (mappedDataKey && enhancedData[mappedDataKey as keyof ExtractedData]) {
            const value = String(enhancedData[mappedDataKey as keyof ExtractedData]);
            
            try {
              if (field.constructor.name === 'PDFTextField') {
                (field as PDFTextField).setText(value);
                fieldsProcessed++;
              } else if (field.constructor.name === 'PDFCheckBox') {
                // Handle checkbox fields - check if value indicates true/yes
                const shouldCheck = ['true', 'yes', '1', 'checked', 'x'].includes(value.toLowerCase());
                if (shouldCheck) {
                  (field as PDFCheckBox).check();
                } else {
                  (field as PDFCheckBox).uncheck();
                }
                fieldsProcessed++;
              } else if (field.constructor.name === 'PDFRadioGroup') {
                // Handle radio button groups
                const radioGroup = field as PDFRadioGroup;
                const options = radioGroup.getOptions();
                if (options.includes(value)) {
                  radioGroup.select(value);
                  fieldsProcessed++;
                }
              }
            } catch (error) {
              console.warn(`Could not fill field ${fieldName}:`, error);
            }
          }
        }
      }
    } else {
      // Fallback to creating a basic document if template not found
      console.warn(`PDF template ${template} not found in storage, creating basic document`);
      pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([612, 792]);
      const { width, height } = page.getSize();
      
      page.drawText(`${this.getTemplateTitle(template)}`, {
        x: 50,
        y: height - 50,
        size: 18,
      });
      
      let yPosition = height - 100;
      const fieldMappings = this.getFieldMappings(template);
      fieldsTotal = Object.keys(fieldMappings).length;
      
      for (const [fieldName, dataKey] of Object.entries(fieldMappings)) {
        const value = enhancedData[dataKey as keyof ExtractedData];
        const confidence = confidenceScores[dataKey] || 'low';
        
        if (value) {
          page.drawText(`${fieldName}: ${value} (${confidence} confidence)`, {
            x: 50,
            y: yPosition,
            size: 12,
          });
          fieldsProcessed++;
        } else {
          page.drawText(`${fieldName}: [NOT PROVIDED]`, {
            x: 50,
            y: yPosition,
            size: 12,
          });
        }
        
        yPosition -= 25;
      }
    }
    
    const pdfBytes = await pdfDoc.save();
    const fileName = this.generateFileName(template, extractedData);
    
    return {
      fileName,
      pdfBytes,
      fieldsProcessed,
      fieldsTotal
    };
  }

  // Map PDF form field names to our extracted data keys
  private mapFieldNameToDataKey(fieldName: string, template: PDFTemplate): string | null {
    const normalizedFieldName = fieldName.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Common field name mappings
    const mappings: Record<string, string> = {
      'firstname': 'firstName',
      'lastname': 'lastName',
      'customerfirstname': 'firstName',
      'customerlastname': 'lastName',
      'buyerfirstname': 'firstName',
      'buyerlastname': 'lastName',
      'address': 'address',
      'customeraddress': 'address',
      'buyeraddress': 'address',
      'licenseNumber': 'licenseNumber',
      'drivinglicensenumber': 'licenseNumber',
      'dllicense': 'licenseNumber',
      'licenseexpiration': 'licenseExpiration',
      'licenseexp': 'licenseExpiration',
      'insurancecompany': 'insuranceCompany',
      'insurance': 'insuranceCompany',
      'insurer': 'insuranceCompany',
      'vin': 'newCarVin',
      'vehiclevin': 'newCarVin',
      'newcarvin': 'newCarVin',
      'vehicleidentificationnumber': 'newCarVin',
      'odometer': 'newCarOdometer',
      'mileage': 'newCarOdometer',
      'newcarodometer': 'newCarOdometer',
      'vehiclemileage': 'newCarOdometer',
      'tradeinvin': 'tradeInVin',
      'tradevin': 'tradeInVin',
      'tradeinodometer': 'tradeInOdometer',
      'tradeodometer': 'tradeInOdometer',
      'tradeinmileage': 'tradeInOdometer',
      'tradeinyear': 'tradeInYear',
      'tradeyear': 'tradeInYear',
      'tradeinmake': 'tradeInMake',
      'trademake': 'tradeInMake',
      'tradeinmodel': 'tradeInModel',
      'trademodel': 'tradeInModel',
    };

    return mappings[normalizedFieldName] || null;
  }

  // Format date for PDF forms (MM/DD/YY format)
  private formatDateForPDF(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${month}/${day}/${year}`;
  }
  
  private getTemplateTitle(template: PDFTemplate): string {
    const titles: Record<PDFTemplate, string> = {
      'deal-check': 'Deal Check List',
      'delivery-receipt': 'Delivery Receipt',
      'we-owe': 'We Owe Form',
      'trade-agreement': 'Trade Agreement',
      'bill-of-sale': 'Bill of Sale',
      'odometer-disclosure': 'Odometer Disclosure Statement'
    };
    return titles[template];
  }
  
  private getFieldMappings(template: PDFTemplate): Record<string, string> {
    // Define which extracted data fields map to which PDF form fields
    // This would be customized for each actual PDF template
    const baseMappings = {
      'Customer First Name': 'firstName',
      'Customer Last Name': 'lastName',
      'Customer Address': 'address',
      'Driver License Number': 'licenseNumber',
      'License Expiration': 'licenseExpiration',
      'Insurance Company': 'insuranceCompany'
    };
    
    const vehicleMappings = {
      'New Vehicle VIN': 'newCarVin',
      'New Vehicle Odometer': 'newCarOdometer'
    };
    
    const tradeInMappings = {
      'Trade-in VIN': 'tradeInVin',
      'Trade-in Odometer': 'tradeInOdometer',
      'Trade-in Year': 'tradeInYear',
      'Trade-in Make': 'tradeInMake',
      'Trade-in Model': 'tradeInModel'
    };
    
    switch (template) {
      case 'deal-check':
      case 'delivery-receipt':
      case 'bill-of-sale':
        return { ...baseMappings, ...vehicleMappings };
      case 'trade-agreement':
        return { ...baseMappings, ...vehicleMappings, ...tradeInMappings };
      case 'odometer-disclosure':
        return { ...baseMappings, ...vehicleMappings };
      case 'we-owe':
        return baseMappings;
      default:
        return baseMappings;
    }
  }
  
  private generateFileName(template: PDFTemplate, extractedData: Partial<ExtractedData>): string {
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const customerName = extractedData.firstName && extractedData.lastName 
      ? `_${extractedData.firstName}_${extractedData.lastName}`
      : '';
    
    const templateName = this.getTemplateTitle(template).replace(/\s+/g, '_');
    return `${templateName}${customerName}_${date}.pdf`;
  }
}

export const pdfProcessor = new PDFProcessor();
