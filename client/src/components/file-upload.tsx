import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFileUpload: (file: File) => void;
  onFileRemove?: () => void;
  uploadedFile?: File | null;
  documentType: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  className?: string;
}

export function FileUpload({
  onFileUpload,
  onFileRemove,
  uploadedFile,
  documentType,
  label,
  description,
  icon,
  className
}: FileUploadProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onFileUpload(acceptedFiles[0]);
    }
  }, [onFileUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.heic', '.heif']
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  if (uploadedFile) {
    return (
      <div className={cn("space-y-2", className)}>
        <label className="block text-sm font-medium text-foreground">{label}</label>
        <div className="border-2 border-border rounded-lg p-4 bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {/* SMART FILE BRIDGE: Display both current session and persistent files */}
              {(uploadedFile as any)?.isPersistent ? (
                // Display persistent file
                <img 
                  src={(uploadedFile as any).url} 
                  alt="Uploaded file"
                  className="h-16 w-16 object-cover rounded"
                  onError={(e) => {
                    console.log('Failed to load persistent image:', (uploadedFile as any).url);
                  }}
                />
              ) : (
                // Display current session file (existing logic)
                <img 
                  src={URL.createObjectURL(uploadedFile as File)} 
                  alt="Uploaded file"
                  className="h-16 w-16 object-cover rounded"
                />
              )}
              <div>
                <p className="text-sm font-medium text-foreground">
                  {(uploadedFile as any)?.displayName || (uploadedFile as File)?.name || documentType}
                  {(uploadedFile as any)?.isPersistent && <span className="text-green-600 ml-1">✓ Saved</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(uploadedFile as any)?.isPersistent 
                    ? 'Saved to cloud storage'
                    : `${((uploadedFile as File).size / 1024 / 1024).toFixed(2)} MB`
                  }
                </p>
              </div>
            </div>
            {onFileRemove && (
              <button
                onClick={onFileRemove}
                className="p-1 hover:bg-destructive/10 rounded-full transition-colors"
                data-testid={`remove-${documentType}`}
              >
                <X className="h-4 w-4 text-destructive" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <label className="block text-sm font-medium text-foreground">{label}</label>
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer transition-all duration-200",
          "hover:border-primary hover:bg-primary/5",
          isDragActive && "border-primary bg-primary/10",
          className
        )}
        data-testid={`upload-${documentType}`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center space-y-2">
          <div className="text-2xl text-muted-foreground">
            {icon}
          </div>
          <p className="text-sm text-muted-foreground">
            {isDragActive ? "Drop image here" : "Drag image here or click to upload"}
          </p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}
