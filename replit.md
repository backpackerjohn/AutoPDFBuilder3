# Overview

This is a dealership document processing application that automates car deal paperwork. The application allows users to input deal information, upload customer documents (driver's license, insurance, VIN photos, etc.), select PDF templates, and automatically generate filled-out documents using AI. The system uses OCR and AI to extract data from uploaded images and intelligently maps that data to fillable PDF forms with confidence scoring.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite for build tooling
- **UI Components**: Shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens and CSS variables
- **State Management**: React Hook Form for form handling, TanStack Query for server state
- **Routing**: Wouter for lightweight client-side routing
- **File Handling**: React Dropzone for drag-and-drop file uploads

## Backend Architecture
- **Framework**: Express.js with TypeScript
- **File Processing**: Multer for handling multipart file uploads with memory storage
- **API Design**: RESTful endpoints for deal processing operations
- **Error Handling**: Centralized error middleware with proper HTTP status codes
- **Development**: Vite integration for hot reloading in development mode

## Data Storage Solutions
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Schema**: Single table design for deal processing jobs with JSONB fields for flexible data storage
- **Migrations**: Drizzle Kit for database schema management
- **Connection**: Neon Database serverless PostgreSQL integration
- **Development Storage**: In-memory storage implementation for development/testing

## Authentication and Authorization
- **Session Management**: PostgreSQL session store with connect-pg-simple
- **Security**: Basic session-based authentication (implementation details not fully visible in codebase)

## External Dependencies

### AI and Document Processing
- **Google Generative AI**: Gemini API for OCR and data extraction from document images
- **PDF Processing**: PDF-lib for reading and filling PDF templates
- **Image Processing**: Supports JPEG, PNG, WebP formats with 10MB file size limits

### Database and Infrastructure
- **Neon Database**: Serverless PostgreSQL hosting
- **Drizzle ORM**: Type-safe database operations with PostgreSQL dialect
- **Database URL**: Environment variable configuration for database connections

### Development Tools
- **Replit Integration**: Vite plugins for Replit-specific development features
- **Error Overlays**: Runtime error modal for development debugging
- **Cartographer**: Code mapping tool for Replit environment

### UI and User Experience
- **Radix UI**: Comprehensive primitive component library for accessibility
- **Lucide React**: Icon library for consistent iconography
- **React Dropzone**: File upload handling with validation
- **Date Functions**: date-fns library for date manipulation

The application follows a clear separation of concerns with the frontend handling user interactions and file uploads, the backend processing documents through AI services, and the database storing job states and extracted data. The confidence scoring system allows for manual review of uncertain extractions before final document generation.