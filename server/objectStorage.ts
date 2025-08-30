import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// The object storage client is used to interact with the object storage service.
export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// The object storage service is used to interact with the object storage service.
export class ObjectStorageService {
  constructor() {}

  // Gets the public object search paths.
  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  // Gets the private object directory.
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  // Search for a PDF template from the public paths
  async searchPDFTemplate(templateName: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/templates/${templateName}.pdf`;

      // Full path format: /<bucket_name>/<object_name>
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      // Check if file exists
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  // List all available PDF templates
  async listPDFTemplates(): Promise<string[]> {
    const templates: string[] = [];
    
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const templatesPath = `${searchPath}/templates/`;
      const { bucketName, objectName } = parseObjectPath(templatesPath);
      const bucket = objectStorageClient.bucket(bucketName);

      try {
        const [files] = await bucket.getFiles({
          prefix: objectName,
          delimiter: '/'
        });

        for (const file of files) {
          if (file.name.endsWith('.pdf')) {
            const templateName = file.name.split('/').pop()?.replace('.pdf', '');
            if (templateName) {
              templates.push(templateName);
            }
          }
        }
      } catch (error) {
        console.warn(`Could not list templates from ${searchPath}:`, error);
      }
    }

    return templates;
  }

  // Download a PDF template as buffer
  async downloadPDFTemplate(templateName: string): Promise<Buffer | null> {
    const file = await this.searchPDFTemplate(templateName);
    if (!file) {
      return null;
    }

    try {
      const [buffer] = await file.download();
      return buffer;
    } catch (error) {
      console.error(`Error downloading template ${templateName}:`, error);
      return null;
    }
  }

  // Downloads an object to the response.
  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600) {
    try {
      // Get file metadata
      const [metadata] = await file.getMetadata();
      
      // Set appropriate headers
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `public, max-age=${cacheTtlSec}`,
      });

      // Stream the file to the response
      const stream = file.createReadStream();

      stream.on("error", (err: any) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  // Upload a PDF template to storage
  async uploadPDFTemplate(templateName: string, pdfBuffer: Buffer): Promise<void> {
    const publicPaths = this.getPublicObjectSearchPaths();
    if (publicPaths.length === 0) {
      throw new Error("No public paths configured for template storage");
    }

    // Use the first public path for uploads
    const uploadPath = `${publicPaths[0]}/templates/${templateName}.pdf`;
    const { bucketName, objectName } = parseObjectPath(uploadPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    await file.save(pdfBuffer, {
      metadata: {
        contentType: 'application/pdf',
      },
    });
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

export const objectStorageService = new ObjectStorageService();