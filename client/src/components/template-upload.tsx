import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface TemplateUploadProps {
  onUploadComplete?: () => void;
}

export function TemplateUpload({ onUploadComplete }: TemplateUploadProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async ({ file, name }: { file: File; name: string }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('templateName', name);

      const response = await fetch('/api/templates/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: 'Template uploaded',
        description: `${result.templateName} is now available for document generation.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      setIsOpen(false);
      setTemplateName('');
      setSelectedFile(null);
      onUploadComplete?.();
    },
    onError: (error: Error) => {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setSelectedFile(acceptedFiles[0]);
      }
    },
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB
  });

  const handleUpload = () => {
    if (!selectedFile || !templateName.trim()) {
      toast({
        title: 'Missing information',
        description: 'Please provide both a template name and PDF file.',
        variant: 'destructive',
      });
      return;
    }

    uploadMutation.mutate({ file: selectedFile, name: templateName.trim() });
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Upload Template
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload PDF Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Template Name</label>
            <Input
              placeholder="e.g., bill-of-sale, trade-agreement"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              data-testid="input-template-name"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use lowercase with hyphens (will be formatted automatically)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">PDF File</label>
            {selectedFile ? (
              <div className="border-2 border-border rounded-lg p-4 bg-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <File className="h-8 w-8 text-red-600" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveFile}
                    data-testid="remove-template-file"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-200 ${
                  isDragActive 
                    ? 'border-primary bg-primary/10' 
                    : 'border-border hover:border-primary hover:bg-primary/5'
                }`}
                data-testid="upload-template-dropzone"
              >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center space-y-2">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {isDragActive ? 'Drop PDF here' : 'Drag PDF here or click to upload'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Fillable PDF templates only, up to 50MB
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-2">
            <Button 
              variant="outline" 
              onClick={() => setIsOpen(false)}
              disabled={uploadMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpload}
              disabled={!selectedFile || !templateName.trim() || uploadMutation.isPending}
              data-testid="button-upload-template"
            >
              {uploadMutation.isPending ? 'Uploading...' : 'Upload Template'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}