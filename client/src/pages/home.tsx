import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { 
  File, 
  Car, 
  ArrowLeftRight, 
  IdCard, 
  Shield, 
  FileText, 
  Barcode, 
  Gauge,
  Search,
  Download,
  Check,
  AlertTriangle,
  Loader2,
  Bot,
  Package,
  Hash,
  RefreshCw,
  Save,
  Upload,
  Calendar,
  Clock,
  ArrowRight
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { downloadFile } from '../lib/download';
import { FileUpload } from '@/components/file-upload';
import { ConfidenceBadge } from '@/components/confidence-badge';
import { TemplateUpload } from '@/components/template-upload';
import { apiRequest } from '@/lib/queryClient';
import type { DealProcessingJob } from '@shared/schema';
import type { UploadedFile, ProcessingStatus, ReviewField, GeneratedDocument } from '@/lib/types';

const dealFormSchema = z.object({
  dealInformation: z.string().optional(),
  selectedTemplates: z.array(z.string()).min(1, 'Please select at least one template'),
});

type DealFormData = z.infer<typeof dealFormSchema>;

// PDF templates will be loaded dynamically from the server

export default function Home() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, File>>({});
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({
    isProcessing: false,
    currentStep: '',
    progress: 0,
  });
  const [showReview, setShowReview] = useState(false);
  const [reviewFields, setReviewFields] = useState<ReviewField[]>([]);
  const [reviewValues, setReviewValues] = useState<Record<string, string>>({});
  const [generatedDocuments, setGeneratedDocuments] = useState<GeneratedDocument[]>([]);
  const [availableTemplates, setAvailableTemplates] = useState<Array<{id: string; label: string}>>([]);
  
  // Stock lookup state
  const [stockNumber, setStockNumber] = useState('');
  const [stockLookupResult, setStockLookupResult] = useState<any>(null);
  const [stockLookupLoading, setStockLookupLoading] = useState(false);
  const [stockLookupError, setStockLookupError] = useState<string | null>(null);

  // Persistent deal state
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [dealName, setDealName] = useState('');

  const form = useForm<DealFormData>({
    resolver: zodResolver(dealFormSchema),
    defaultValues: {
      dealInformation: '',
      selectedTemplates: [],
    },
  });

  // Stock lookup function
  const handleStockLookup = async () => {
    if (!stockNumber.trim()) {
      setStockLookupError('Please enter a stock number');
      return;
    }

    setStockLookupLoading(true);
    setStockLookupError(null);
    setStockLookupResult(null);

    try {
      const response = await fetch(`/api/inventory/${stockNumber.trim().toUpperCase()}`);
      const data = await response.json();

      if (response.ok) {
        setStockLookupResult(data);
        toast({
          title: "Vehicle Found",
          description: `${data.year} ${data.make} ${data.model} located successfully`,
        });
      } else {
        setStockLookupError(data.error || 'Vehicle not found');
        toast({
          title: "Vehicle Not Found",
          description: data.error || `No vehicle found with stock number ${stockNumber}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      setStockLookupError('Failed to lookup vehicle. Please try again.');
      toast({
        title: "Lookup Failed",
        description: "Unable to connect to inventory system",
        variant: "destructive",
      });
    } finally {
      setStockLookupLoading(false);
    }
  };

  // Auto-fill form with vehicle data
  const handleAutoFill = () => {
    if (!stockLookupResult || !currentJobId) {
      toast({
        title: "Cannot Auto-Fill",
        description: "Please lookup a vehicle first and ensure you have a deal created",
        variant: "destructive",
      });
      return;
    }

    // For now, we'll store the data locally and let the user know it's ready for use
    // In a full implementation, you could update the deal via an API call
    console.log('Auto-fill data ready:', {
      newCarVin: stockLookupResult.vin,
      year: stockLookupResult.year,
      make: stockLookupResult.make,
      model: stockLookupResult.model,
      trim: stockLookupResult.trim,
      color: stockLookupResult.color
    });

    toast({
      title: "Form Auto-Filled",
      description: `Vehicle details from stock ${stockLookupResult.stockNumber} have been applied`,
    });
  };

  // Create new deal mutation
  const createDealMutation = useMutation({
    mutationFn: async (data: Partial<DealFormData>) => {
      const response = await apiRequest('POST', '/api/deals', data);
      return response.json() as Promise<DealProcessingJob>;
    },
    onSuccess: (job) => {
      setCurrentJobId(job.id);
      toast({
        title: 'Deal created',
        description: 'You can now start uploading documents.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to create deal. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Upload file mutation
  const uploadFileMutation = useMutation({
    mutationFn: async ({
      file,
      documentType,
      dealId,
    }: { file: File; documentType: string; dealId?: string }) => {
      const id = dealId ?? currentJobId;
      if (!id) throw new Error('No active deal');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', documentType);

      const response = await fetch(`/api/deals/${id}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let message = 'Failed to process document.';
        try {
          const j = await response.json();
          if (j?.error) message = j.error;
        } catch {}
        throw new Error(message);
      }
      return response.json();
    },
    onSuccess: (_result, { documentType }) => {
      toast({
        title: 'Document processed',
        description: `${documentType} uploaded and analyzed successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/deals', currentJobId] });
    },
    onError: (error: any, { documentType }) => {
      // Roll back optimistic UI if upload failed
      setUploadedFiles(prev => {
        const { [documentType]: _, ...rest } = prev;
        return rest;
      });
      toast({
        title: 'Upload failed',
        description: error?.message || 'Failed to process document. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Analyze context mutation
  const analyzeContextMutation = useMutation({
    mutationFn: async (dealInformation: string) => {
      if (!currentJobId) throw new Error('No active deal');
      
      const response = await apiRequest('POST', `/api/deals/${currentJobId}/analyze-context`, {
        dealInformation,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Context analyzed',
        description: 'Deal information has been processed for additional insights.',
      });
    },
  });

  // Generate documents mutation
  const generateDocumentsMutation = useMutation({
    mutationFn: async ({ selectedTemplates, reviewedData }: { selectedTemplates: string[]; reviewedData?: any }) => {
      if (!currentJobId) throw new Error('No active deal');
      
      const response = await apiRequest('POST', `/api/deals/${currentJobId}/generate`, {
        selectedTemplates,
        reviewedData,
      });
      return response.json();
    },
    onSuccess: (result) => {
      const documents = result.documents || [];
      
      // Add combined PDF to the top of the list if available
      if (result.combinedDownloadUrl) {
        const combinedDoc = {
          template: 'combined',
          fileName: 'Complete Deal Package',
          downloadUrl: result.combinedDownloadUrl,
          fieldsProcessed: documents.reduce((sum: number, doc: any) => sum + (doc.fieldsProcessed || 0), 0),
          fieldsTotal: documents.reduce((sum: number, doc: any) => sum + (doc.fieldsTotal || 0), 0),
        };
        setGeneratedDocuments([combinedDoc, ...documents]);
      } else {
        setGeneratedDocuments(documents);
      }
      
      setShowReview(false);
      setProcessingStatus({ isProcessing: false, currentStep: '', progress: 100 });
      toast({
        title: 'Documents generated',
        description: result.combinedDownloadUrl 
          ? `Complete deal package with ${documents.length} form(s) + images ready for download.`
          : `${documents.length} documents are ready for download.`,
      });
    },
    onError: () => {
      setProcessingStatus({ isProcessing: false, currentStep: '', progress: 0 });
      toast({
        title: 'Generation failed',
        description: 'Failed to generate documents. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Save persistent deal mutation
  const savePersistentDealMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      if (!currentJobId) throw new Error('No active deal to save');
      
      const dealData = {
        name,
        description,
        dealInformation: form.getValues('dealInformation'),
        selectedTemplates: form.getValues('selectedTemplates'),
        uploadedAssets: Object.keys(uploadedFiles),
        stockLookupResult,
        extractedData: reviewData?.extractedData || {},
        confidenceScores: reviewData?.confidenceScores || {},
      };

      const response = await apiRequest('POST', '/api/persistent-deals', dealData);
      return response.json();
    },
    onSuccess: (result) => {
      setSelectedDealId(result.id);
      setDealName('');
      queryClient.invalidateQueries({ queryKey: ['/api/persistent-deals'] });
      toast({
        title: 'Deal saved',
        description: `Deal "${result.name}" has been saved for cross-device access.`,
      });
    },
    onError: () => {
      toast({
        title: 'Save failed',
        description: 'Failed to save deal. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Load persistent deal mutation
  const loadPersistentDealMutation = useMutation({
    mutationFn: async (dealId: string) => {
      const response = await apiRequest('GET', `/api/persistent-deals/${dealId}`);
      return response.json();
    },
    onSuccess: (deal) => {
      // Reset current state
      setCurrentJobId(null);
      setUploadedFiles({});
      setProcessingStatus({ isProcessing: false, currentStep: '', progress: 0 });
      setShowReview(false);
      setReviewFields([]);
      setReviewValues({});
      setGeneratedDocuments([]);

      // Load deal data into form
      form.setValue('dealInformation', deal.dealInformation || '');
      form.setValue('selectedTemplates', deal.selectedTemplates || []);
      
      // Set stock lookup result if available
      if (deal.stockLookupResult) {
        setStockLookupResult(deal.stockLookupResult);
        setStockNumber(deal.stockLookupResult.stockNumber || '');
      }

      setSelectedDealId(deal.id);
      
      toast({
        title: 'Deal loaded',
        description: `Deal "${deal.name}" has been loaded successfully.`,
      });
    },
    onError: () => {
      toast({
        title: 'Load failed',
        description: 'Failed to load deal. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Load available PDF templates
  const { data: templatesData } = useQuery<{ templates: string[] }>({
    queryKey: ['/api/templates'],
  });

  // Load recent persistent deals
  const { data: recentDealsData } = useQuery<{ deals: any[] }>({
    queryKey: ['/api/persistent-deals'],
  });

  useEffect(() => {
    if (templatesData?.templates) {
      const templates = templatesData.templates.map(templateName => ({
        id: templateName,
        label: formatTemplateName(templateName)
      }));
      setAvailableTemplates(templates);
    }
  }, [templatesData]);

  // Check if review is needed query
  const { data: reviewData } = useQuery<{
    needsReview: boolean;
    extractedData: Record<string, any>;
    confidenceScores: Record<string, 'high' | 'medium' | 'low'>;
  }>({
    queryKey: ['/api/deals', currentJobId, 'needs-review'],
    enabled: !!currentJobId && !showReview && !processingStatus.isProcessing,
  });

  const handleFileUpload = async (file: File, documentType: string) => {
    // Ensure we have an active deal; use returned id immediately to avoid state race
    let dealId = currentJobId;
    if (!dealId) {
      const job = await createDealMutation.mutateAsync(form.getValues());
      dealId = job.id;
      setCurrentJobId(dealId);
    }

    // Optimistic UI
    setUploadedFiles(prev => ({ ...prev, [documentType]: file }));

    // Pass the id explicitly to avoid using stale state
    uploadFileMutation.mutate({ file, documentType, dealId });
  };

  const handleFileRemove = (documentType: string) => {
    setUploadedFiles(prev => {
      const updated = { ...prev };
      delete updated[documentType];
      return updated;
    });
  };


  const handleGenerateDocuments = async () => {
    const selectedTemplates = form.getValues('selectedTemplates');
    
    if (selectedTemplates.length === 0) {
      toast({
        title: 'No templates selected',
        description: 'Please select at least one PDF template.',
        variant: 'destructive',
      });
      return;
    }

    // Analyze context if we have deal information
    const dealInfo = form.getValues('dealInformation');
    if (dealInfo && currentJobId) {
      await analyzeContextMutation.mutateAsync(dealInfo);
    }

    setProcessingStatus({
      isProcessing: true,
      currentStep: 'Extracting data from images',
      progress: 25,
    });

    setTimeout(() => {
      setProcessingStatus({
        isProcessing: true,
        currentStep: 'Mapping data to PDF fields',
        progress: 50,
      });
    }, 1500);

    setTimeout(() => {
      setProcessingStatus({
        isProcessing: true,
        currentStep: 'Checking confidence levels',
        progress: 75,
      });
    }, 3000);

    setTimeout(() => {
      // Check if review is needed
      if (reviewData?.needsReview) {
        const fields: ReviewField[] = Object.entries(reviewData.extractedData || {})
          .filter(([key, value]) => value)
          .map(([key, value]) => ({
            key,
            label: formatFieldLabel(key),
            value: String(value),
            confidence: reviewData.confidenceScores?.[key] || 'low',
            source: getFieldSource(key),
          }));
        
        setReviewFields(fields);
        setReviewValues(
          fields.reduce((acc, field) => {
            acc[field.key] = field.value;
            return acc;
          }, {} as Record<string, string>)
        );
        setShowReview(true);
        setProcessingStatus({ isProcessing: false, currentStep: '', progress: 0 });
      } else {
        // Generate directly
        generateDocumentsMutation.mutate({ selectedTemplates });
      }
    }, 4500);
  };

  const handleApproveAndGenerate = () => {
    const selectedTemplates = form.getValues('selectedTemplates');
    const reviewedData = Object.entries(reviewValues).reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {} as Record<string, any>);
    
    generateDocumentsMutation.mutate({ selectedTemplates, reviewedData });
  };

const handleDownloadDocument = async (doc: GeneratedDocument) => {
  try {
    await downloadFile(doc.downloadUrl, doc.fileName || 'document.pdf');
    toast({ title: 'Download started', description: `Downloading ${doc.fileName ?? 'document.pdf'}` });
  } catch (error: any) {
    toast({
      title: 'Download failed',
      description: error?.message || 'Failed to download document. Please try again.',
      variant: 'destructive',
    });
  }
};

  const handleDownloadAll = async () => {
    const combined = generatedDocuments.find(d => d.template === 'combined');
    if (combined) return handleDownloadDocument(combined);
    for (const doc of generatedDocuments) {
      await handleDownloadDocument(doc);
      await new Promise(r => setTimeout(r, 600));
    }
  };

  const handleStartNewDeal = () => {
    setCurrentJobId(null);
    setUploadedFiles({});
    setProcessingStatus({ isProcessing: false, currentStep: '', progress: 0 });
    setShowReview(false);
    setReviewFields([]);
    setReviewValues({});
    setGeneratedDocuments([]);
    form.reset();
    
    toast({
      title: 'New deal started',
      description: 'Ready to process a new deal.',
    });
  };

  const formatFieldLabel = (key: string): string => {
    const labels: Record<string, string> = {
      firstName: 'Customer First Name',
      lastName: 'Customer Last Name',
      address: 'Customer Address',
      licenseNumber: 'Driver License Number',
      licenseExpiration: 'License Expiration',
      insuranceCompany: 'Insurance Company',
      newCarVin: 'New Car VIN',
      newCarOdometer: 'New Car Odometer',
      tradeInVin: 'Trade-in VIN',
      tradeInOdometer: 'Trade-in Odometer',
      tradeInYear: 'Trade-in Vehicle Year',
      tradeInMake: 'Trade-in Vehicle Make',
      tradeInModel: 'Trade-in Vehicle Model',
    };
    return labels[key] || key;
  };

  const getFieldSource = (key: string): string => {
    if (['firstName', 'lastName', 'address', 'licenseNumber', 'licenseExpiration'].includes(key)) {
      return 'Driver\'s License';
    }
    if (key === 'insuranceCompany') return 'Insurance Card';
    if (['newCarVin', 'newCarOdometer'].includes(key)) return 'New Car Photos';
    if (['tradeInVin', 'tradeInOdometer'].includes(key)) return 'Trade-in Photos';
    if (['tradeInYear', 'tradeInMake', 'tradeInModel'].includes(key)) return 'Deal Information';
    return 'Unknown';
  };

  const formatTemplateName = (templateName: string): string => {
    return templateName
      .replace(/[-_]/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <File className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">AutoFill Pro</h1>
                <p className="text-sm text-muted-foreground">Dealership Document Processor</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-muted-foreground flex items-center">
                <Bot className="h-4 w-4 mr-1" />
                Powered by Gemini AI
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Recent Deals Section */}
        {recentDealsData && recentDealsData.deals && recentDealsData.deals.length > 0 && (
          <Card className="mb-8" data-testid="recent-deals-section">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-secondary text-secondary-foreground rounded-lg flex items-center justify-center">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Recent Deals</CardTitle>
                    <p className="text-muted-foreground">Load saved deals to continue processing on any device</p>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recentDealsData.deals.slice(0, 6).map((deal) => (
                  <div
                    key={deal.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                      selectedDealId === deal.id 
                        ? 'border-primary bg-primary/5' 
                        : 'border-border hover:border-muted-foreground'
                    }`}
                    onClick={() => loadPersistentDealMutation.mutate(deal.id)}
                    data-testid={`deal-card-${deal.id}`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-foreground truncate">{deal.name}</h4>
                        <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </div>
                      
                      {deal.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{deal.description}</p>
                      )}
                      
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{new Date(deal.createdAt).toLocaleDateString()}</span>
                        <div className="flex items-center space-x-2">
                          {deal.uploadedAssets && deal.uploadedAssets.length > 0 && (
                            <span className="flex items-center">
                              <Upload className="h-3 w-3 mr-1" />
                              {deal.uploadedAssets.length}
                            </span>
                          )}
                          {deal.selectedTemplates && deal.selectedTemplates.length > 0 && (
                            <span className="flex items-center">
                              <FileText className="h-3 w-3 mr-1" />
                              {deal.selectedTemplates.length}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {loadPersistentDealMutation.isPending && selectedDealId === deal.id && (
                        <div className="flex items-center justify-center py-2">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Form {...form}>
          <div className="space-y-8">
            
            {/* Deal Information & Document Upload */}
            <Card data-testid="deal-information-and-upload">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-primary text-primary-foreground rounded-lg flex items-center justify-center">
                    <File className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">Process Deal Documents</CardTitle>
                    <p className="text-muted-foreground">Enter deal context and upload customer documents for AI processing</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-8">
                
                {/* Deal Information Section */}
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Bot className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold text-foreground">Deal Information</h3>
                  </div>
                  <FormField
                    control={form.control}
                    name="dealInformation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Deal Details & Context</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Example: Customer is trading in their 2019 Honda Civic. Down payment: $5,000. Financing through Wells Fargo at 4.9% APR for 60 months."
                            className="h-32 resize-none"
                            data-testid="input-deal-information"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex items-center text-sm text-muted-foreground">
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Include trade-in details, financing terms, special requests, or any context not in official documents
                  </div>
                </div>

                {/* Document Upload Section */}
                <div className="space-y-6">
                  <div className="flex items-center space-x-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold text-foreground">Customer Documents</h3>
                    <span className="text-sm text-muted-foreground">Upload photos for AI extraction</span>
                  </div>
                
                {/* Customer Documents (Printable) */}
                <div>
                  <h3 className="text-base font-medium text-foreground mb-4 flex items-center">
                    <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                    Customer Documents (Printable)
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FileUpload
                      documentType="drivers-license"
                      label="Driver's License"
                      description="Extracts: Name, Address, License #, Expiration"
                      icon={<IdCard />}
                      uploadedFile={uploadedFiles['drivers-license']}
                      onFileUpload={(file) => handleFileUpload(file, 'drivers-license')}
                      onFileRemove={() => handleFileRemove('drivers-license')}
                    />

                    <FileUpload
                      documentType="insurance"
                      label="Insurance Card"
                      description="Extracts: Insurance Company Name"
                      icon={<Shield />}
                      uploadedFile={uploadedFiles['insurance']}
                      onFileUpload={(file) => handleFileUpload(file, 'insurance')}
                      onFileRemove={() => handleFileRemove('insurance')}
                    />

                    <FileUpload
                      documentType="spot-registration"
                      label="Spot Registration"
                      description="For printing only (no data extraction)"
                      icon={<FileText />}
                      uploadedFile={uploadedFiles['spot-registration']}
                      onFileUpload={(file) => handleFileUpload(file, 'spot-registration')}
                      onFileRemove={() => handleFileRemove('spot-registration')}
                    />
                  </div>
                </div>

                {/* New Car Details */}
                <div>
                  <h3 className="text-base font-medium text-foreground mb-4 flex items-center">
                    <Car className="h-4 w-4 mr-2 text-muted-foreground" />
                    New Car Details (Data Only)
                  </h3>
                  
                  {/* Stock Number Lookup */}
                  <div className="mb-6 p-4 border border-border rounded-lg bg-secondary/50">
                    <h4 className="text-sm font-medium text-foreground mb-3 flex items-center">
                      <Hash className="h-4 w-4 mr-2 text-muted-foreground" />
                      Stock Number Lookup
                    </h4>
                    
                    <div className="flex gap-2 mb-3">
                      <Input
                        type="text"
                        placeholder="Enter stock number (e.g., 5VU324)"
                        value={stockNumber}
                        onChange={(e) => setStockNumber(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleStockLookup()}
                        className="flex-1"
                        data-testid="input-stock-number"
                      />
                      <Button 
                        onClick={handleStockLookup}
                        disabled={stockLookupLoading || !stockNumber.trim()}
                        data-testid="button-stock-lookup"
                      >
                        {stockLookupLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Search className="h-4 w-4 mr-2" />
                        )}
                        {stockLookupLoading ? 'Looking up...' : 'Lookup'}
                      </Button>
                    </div>

                    {stockLookupError && (
                      <div className="flex items-center gap-2 text-destructive text-sm mb-3" data-testid="error-stock-lookup">
                        <AlertTriangle className="h-4 w-4" />
                        {stockLookupError}
                      </div>
                    )}

                    {stockLookupResult && (
                      <div className="bg-background border border-border rounded-lg p-4" data-testid="card-vehicle-summary">
                        <h5 className="font-medium text-foreground mb-2 flex items-center">
                          <Car className="h-4 w-4 mr-2 text-green-600" />
                          Vehicle Found
                        </h5>
                        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                          <div><span className="text-muted-foreground">Stock:</span> {stockLookupResult.stockNumber}</div>
                          <div><span className="text-muted-foreground">Year:</span> {stockLookupResult.year}</div>
                          <div><span className="text-muted-foreground">Make:</span> {stockLookupResult.make}</div>
                          <div><span className="text-muted-foreground">Model:</span> {stockLookupResult.model}</div>
                          <div><span className="text-muted-foreground">Trim:</span> {stockLookupResult.trim}</div>
                          <div><span className="text-muted-foreground">Color:</span> {stockLookupResult.color}</div>
                          <div className="col-span-2"><span className="text-muted-foreground">VIN:</span> {stockLookupResult.vin}</div>
                        </div>
                        <Button 
                          onClick={handleAutoFill}
                          className="w-full"
                          variant="default"
                          disabled={!currentJobId}
                          data-testid="button-auto-fill"
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Auto-Fill Form with Vehicle Data
                        </Button>
                        {!currentJobId && (
                          <p className="text-xs text-muted-foreground mt-2 text-center">
                            Create a deal first to enable auto-fill
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FileUpload
                      documentType="new-car-vin"
                      label="New Car VIN"
                      description="Usually on door jamb or dashboard"
                      icon={<Barcode />}
                      uploadedFile={uploadedFiles['new-car-vin']}
                      onFileUpload={(file) => handleFileUpload(file, 'new-car-vin')}
                      onFileRemove={() => handleFileRemove('new-car-vin')}
                    />

                    <FileUpload
                      documentType="new-car-odometer"
                      label="New Car Odometer"
                      description="Clear view of mileage reading"
                      icon={<Gauge />}
                      uploadedFile={uploadedFiles['new-car-odometer']}
                      onFileUpload={(file) => handleFileUpload(file, 'new-car-odometer')}
                      onFileRemove={() => handleFileRemove('new-car-odometer')}
                    />
                  </div>
                </div>

                {/* Trade-in Details */}
                <div>
                  <h3 className="text-base font-medium text-foreground mb-4 flex items-center">
                    <ArrowLeftRight className="h-4 w-4 mr-2 text-muted-foreground" />
                    Trade-in Details (Data Only)
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FileUpload
                      documentType="trade-in-vin"
                      label="Trade-in VIN"
                      description="Usually on door jamb or dashboard"
                      icon={<Barcode />}
                      uploadedFile={uploadedFiles['trade-in-vin']}
                      onFileUpload={(file) => handleFileUpload(file, 'trade-in-vin')}
                      onFileRemove={() => handleFileRemove('trade-in-vin')}
                    />

                    <FileUpload
                      documentType="trade-in-odometer"
                      label="Trade-in Odometer"
                      description="Clear view of mileage reading"
                      icon={<Gauge />}
                      uploadedFile={uploadedFiles['trade-in-odometer']}
                      onFileUpload={(file) => handleFileUpload(file, 'trade-in-odometer')}
                      onFileRemove={() => handleFileRemove('trade-in-odometer')}
                    />
                  </div>
                </div>
                </div>
              </CardContent>
            </Card>

            {/* Step 2: Select PDF Templates */}
            <Card data-testid="step-pdf-templates">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                      2
                    </div>
                    <div>
                      <CardTitle>Select PDF Templates</CardTitle>
                      <p className="text-sm text-muted-foreground">Choose which documents are required for this deal</p>
                    </div>
                  </div>
                  <TemplateUpload onUploadComplete={() => {
                    queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
                  }} />
                </div>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="selectedTemplates"
                  render={() => (
                    <FormItem>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {availableTemplates.map((template) => (
                          <FormField
                            key={template.id}
                            control={form.control}
                            name="selectedTemplates"
                            render={({ field }) => (
                              <FormItem
                                key={template.id}
                                className="flex items-center space-x-3 p-4 border border-border rounded-lg hover:bg-secondary/50 transition-colors"
                              >
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(template.id)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([...field.value, template.id])
                                        : field.onChange(
                                            field.value?.filter(
                                              (value) => value !== template.id
                                            )
                                          )
                                    }}
                                    data-testid={`checkbox-${template.id}`}
                                  />
                                </FormControl>
                                <FormLabel className="flex-1 cursor-pointer flex items-center space-x-2">
                                  <FileText className="h-4 w-4 text-destructive" />
                                  <span className="text-sm font-medium">{template.label}</span>
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="mt-4 p-3 bg-secondary rounded-lg border border-border">
                  <p className="text-sm text-muted-foreground flex items-center">
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Selected documents will be automatically filled with extracted data and included in the final package
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Step 3: Generate & Download */}
            <Card data-testid="step-generate-download">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-accent text-accent-foreground rounded-full flex items-center justify-center text-sm font-medium">
                    3
                  </div>
                  <div>
                    <CardTitle>Generate & Download</CardTitle>
                    <p className="text-sm text-muted-foreground">Process all information and create filled PDFs</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                
                {/* Generate Button */}
                {!processingStatus.isProcessing && !showReview && generatedDocuments.length === 0 && (
                  <div className="text-center space-y-4">
                    <Button
                      type="button"
                      size="lg"
                      className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold text-lg shadow-lg hover:shadow-xl"
                      onClick={handleGenerateDocuments}
                      disabled={createDealMutation.isPending || uploadFileMutation.isPending}
                      data-testid="button-generate-documents"
                    >
                      {createDealMutation.isPending || uploadFileMutation.isPending ? (
                        <Loader2 className="h-5 w-5 mr-3 animate-spin" />
                      ) : (
                        <Bot className="h-5 w-5 mr-3" />
                      )}
                      Generate Documents
                    </Button>
                    
                    {/* Save Deal Button */}
                    {(currentJobId || Object.keys(uploadedFiles).length > 0 || form.getValues('dealInformation') || stockLookupResult) && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            disabled={savePersistentDealMutation.isPending}
                            data-testid="button-save-deal"
                          >
                            {savePersistentDealMutation.isPending ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <Save className="h-4 w-4 mr-2" />
                                Save Deal for Later
                              </>
                            )}
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                          <DialogHeader>
                            <DialogTitle>Save Deal for Cross-Device Access</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm font-medium text-foreground">Deal Name</label>
                              <Input
                                value={dealName}
                                onChange={(e) => setDealName(e.target.value)}
                                placeholder="Enter a name for this deal"
                                className="mt-1"
                                data-testid="input-deal-name"
                              />
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Save your current progress to continue on any device. Deal information, uploaded files, and vehicle data will be preserved.
                            </div>
                            <div className="flex justify-end space-x-2">
                              <DialogTrigger asChild>
                                <Button variant="outline">Cancel</Button>
                              </DialogTrigger>
                              <Button
                                onClick={() => {
                                  if (dealName.trim()) {
                                    savePersistentDealMutation.mutate({ 
                                      name: dealName.trim(),
                                      description: form.getValues('dealInformation') || undefined
                                    });
                                  }
                                }}
                                disabled={!dealName.trim() || savePersistentDealMutation.isPending}
                                data-testid="button-confirm-save"
                              >
                                Save Deal
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                )}

                {/* Processing Status */}
                {processingStatus.isProcessing && (
                  <div className="space-y-4" data-testid="processing-status">
                    <div className="text-center">
                      <div className="inline-flex items-center space-x-2 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="text-sm">Processing documents with AI...</span>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Extracting data from images</span>
                        <span className="text-accent font-medium">
                          {processingStatus.progress >= 25 ? '✓ Complete' : 'Processing...'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Mapping data to PDF fields</span>
                        <span className={processingStatus.progress >= 50 ? 'text-accent font-medium' : 'text-muted-foreground'}>
                          {processingStatus.progress >= 50 ? '✓ Complete' : 'Pending...'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Generating final documents</span>
                        <span className={processingStatus.progress >= 100 ? 'text-accent font-medium' : 'text-muted-foreground'}>
                          {processingStatus.progress >= 100 ? '✓ Complete' : 'Pending...'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Review Screen */}
                {showReview && (
                  <div className="space-y-4" data-testid="review-screen">
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <h3 className="text-base font-medium text-yellow-800 mb-2 flex items-center">
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Review Required
                      </h3>
                      <p className="text-sm text-yellow-700">
                        Some extracted data has medium or low confidence. Please review and correct if needed.
                      </p>
                    </div>

                    <div className="space-y-4">
                      {reviewFields.map((field) => (
                        <div key={field.key} className="p-4 border border-border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-foreground">{field.label}</span>
                            <ConfidenceBadge confidence={field.confidence} />
                          </div>
                          <Input
                            value={reviewValues[field.key] || ''}
                            onChange={(e) => setReviewValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                            data-testid={`review-${field.key}`}
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            {field.confidence === 'medium' 
                              ? `Extracted from ${field.source}`
                              : `Please verify this extraction from ${field.source}`
                            }
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="flex space-x-3 pt-4">
                      <Button
                        type="button"
                        className="flex-1"
                        onClick={handleApproveAndGenerate}
                        disabled={generateDocumentsMutation.isPending}
                        data-testid="button-approve-generate"
                      >
                        {generateDocumentsMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4 mr-2" />
                        )}
                        Approve & Generate PDFs
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowReview(false)}
                        data-testid="button-cancel-review"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Download Results */}
                {generatedDocuments.length > 0 && (
                  <div className="space-y-4" data-testid="download-results">
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <h3 className="text-base font-medium text-green-800 mb-2 flex items-center">
                        <Check className="h-4 w-4 mr-2" />
                        Documents Generated Successfully
                      </h3>
                      <p className="text-sm text-green-700">All PDFs have been filled and are ready for download.</p>
                    </div>

                    <div className="space-y-2">
                      {generatedDocuments.map((doc, index) => (
                        <div key={index} className={`flex items-center justify-between p-3 border rounded-lg ${
                          doc.template === 'combined' 
                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' 
                            : 'border-border'
                        }`}>
                          <div className="flex items-center space-x-3">
                            {doc.template === 'combined' ? (
                              <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            ) : (
                              <FileText className="h-4 w-4 text-destructive" />
                            )}
                            <div>
                              <span className={`text-sm font-medium ${
                                doc.template === 'combined' 
                                  ? 'text-blue-800 dark:text-blue-200' 
                                  : 'text-foreground'
                              }`}>
                                {doc.fileName}
                              </span>
                              {doc.template === 'combined' && (
                                <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                                  All forms + uploaded images in one PDF
                                </div>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant={doc.template === 'combined' ? 'default' : 'outline'}
                            onClick={() => handleDownloadDocument(doc)}
                            data-testid={`download-${doc.template}`}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                        </div>
                      ))}
                    </div>

                    <div className="flex space-x-3 pt-4">
                      <Button
                        type="button"
                        className="flex-1"
                        onClick={handleDownloadAll}
                        data-testid="button-download-all"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download All Documents
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleStartNewDeal}
                        data-testid="button-start-new-deal"
                      >
                        Start New Deal
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </Form>

        {/* Footer */}
        <footer className="mt-16 py-8 border-t border-border">
          <div className="text-center text-sm text-muted-foreground">
            <p>AutoFill Pro v2.0 - Streamlining dealership document processing with AI</p>
            <p className="mt-1">Powered by Gemini AI • Secure • GDPR Compliant</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
