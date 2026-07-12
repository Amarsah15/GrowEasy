# GrowEasy AI CSV Lead Importer

An AI-powered CSV Ingest Hub designed to intelligently extract and standardize CRM lead information from any valid CSV format.

This repository implements the assignment for the **Software Developer** role at GrowEasy.

## Overview

The system allows uploading CSV files of any structure (e.g. Facebook Lead Exports, Google Ads Exports, real estate sheets, or raw marketing files). The AI intelligently handles column mapping collisions, messy inputs, ambiguous headers, and missing details to align data with the target GrowEasy CRM schema.

### Core Features

- **Drag & Drop CSV Upload** and file picker with size and type validations.
- **Client-Side Preview Table** with vertical/horizontal scrolling and sticky headers. Shows the first 50 rows for fast rendering on large files — the full file is still sent for import. No AI processing is executed during preview.
- **Real-Time Stream Processing**: Uses Server-Sent Events (SSE) to stream batch parsing progress and lead records incrementally to the frontend.
- **AI Schema Mapping & Normalization**: Integrates Gemini (`gemini-2.5-flash` / `gemini-1.5-flash`) via a single structured-output call per batch.
- **Robust Heuristics Fallback**: Runs a regex + value-scanning heuristic extractor if no Gemini key is provided, allowing the application to work out-of-the-box for evaluation. An "AI Engine" badge in the UI always shows which mode is actually active, so this is never silently unclear.
- **Leads Database & Controls**: Full-featured Leads dashboard showing active leads with search queries, status/source filters (with specific red formatting for the `BAD_LEAD` status value), sorting, and manual record deletion.
- **Theme Engine**: Toggle between custom Cyberpunk Dark Mode (default) and Light Mode.
- **API Settings**: Change backend server endpoint URL and save your own Gemini API key to the browser's `localStorage` directly in the UI.
- **Mobile & Tablet Responsiveness**: A fully adaptive navigation drawer (hamburger menu) and responsive fluid layout scaling ensure premium visual design and usability across all devices (mobile, tablet, and desktop).

---

## Tech Stack

- **Frontend**: Next.js (App Router), TypeScript (strict mode), Vanilla CSS Modules, Lucide Icons.
- **Backend**: Node.js, Express, Multer, PapaParse, TypeScript, Jest (testing via `ts-jest` and ES6 modules). Completely written in TypeScript for end-to-end type safety!
- **Orchestration**: Docker & Docker Compose.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20.9.0 or later (Required for Next.js build engine)
- [npm](https://www.npmjs.com/)
- [Docker & Docker Desktop](https://www.docker.com/) (Optional, for containerized run)

### Environment Configuration

1. **Backend**: Navigate to the `/backend` folder. Create a `.env` file (or copy the `/backend/.env.example` template):

   ```env
   PORT=5000
   GEMINI_API_KEY=your_gemini_api_key_here
   GEMINI_MODEL=gemini-2.5-flash
   BATCH_SIZE=25
   ```

   _Note: If `GEMINI_API_KEY` is not set, the server automatically degrades to the local Heuristic Mapping Mode — the UI's "AI Engine" badge will show "Fallback Mode" in that case. For evaluating the real AI extraction quality, make sure a valid Gemini key is set._

2. **Frontend**: Navigate to the `/frontend` folder. Create a `.env.local` file:
   ```env
   NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:5000
   ```

---

## Running Locally

### 1. Launch the Backend Server

```bash
cd backend
npm install
npm run build   # Compiles TypeScript files into the dist/ directory
npm run dev     # Runs dev server using tsx on-the-fly execution
```

_The server will start listening at `http://localhost:5000`._

#### Running Backend Tests

To run unit tests verifying heuristic mapping, parsing, and SSE streaming (fully compiled on-the-fly using `ts-jest`):

```bash
cd backend
npm test
```

### 2. Launch the Frontend App

```bash
cd frontend
npm install
npm run dev
```

_The Next.js application will launch at `http://localhost:3000`._

---

## Running with Docker Compose

To build and launch both services simultaneously:

1. Configure your `.env` in the root or set the environment variables in your terminal.
2. Execute the following command from the root folder:
   ```bash
   docker compose up -d --build
   ```
3. Access the frontend app at `http://localhost:3000` and the backend at `http://localhost:5000`.

---

## Target CRM Schema

| Field                         | Description                | Constraints / Formats                                                                                |
| :---------------------------- | :------------------------- | :--------------------------------------------------------------------------------------------------- |
| `created_at`                  | Lead creation timestamp    | Standardized parseable date format                                                                   |
| `name`                        | Lead's full name           | Combined if split in CSV columns                                                                     |
| `email`                       | Primary email              | Multiples appended to notes                                                                          |
| `country_code`                | Telephone country code     | e.g., `+91`, `+1`                                                                                    |
| `mobile_without_country_code` | Mobile number              | Extracted without country code                                                                       |
| `company`                     | Company name               | Mapped                                                                                               |
| `city`                        | City location              | Mapped                                                                                               |
| `state`                       | State location             | Mapped                                                                                               |
| `country`                     | Country location           | Mapped                                                                                               |
| `lead_owner`                  | Lead owner email           | Mapped                                                                                               |
| `crm_status`                  | Current pipeline status    | `GOOD_LEAD_FOLLOW_UP`, `DID_NOT_CONNECT`, `BAD_LEAD` (Red), `SALE_DONE`                              |
| `crm_note`                    | Remarks & overflow details | Contains secondary contacts and unmapped details                                                     |
| `data_source`                 | Lead source name           | Mapped to allowed: `leads_on_demand`, `meridian_tower`, `eden_park`, `varah_swamy`, `sarjapur_plots` |
| `possession_time`             | Property possession time   | Mapped                                                                                               |
| `description`                 | Additional description     | Mapped                                                                                               |

---

## Folder Structure

```text
GrowEasy/
├── backend/
│   ├── src/
│   │   ├── controllers/      # Express controllers (importController.ts)
│   │   ├── routes/           # Routing definitions (importRoutes.ts)
│   │   ├── services/         # AI API integrations (aiService.ts)
│   │   └── server.ts         # Entry point
│   ├── tests/                # Unit test suites (import.test.ts)
│   ├── tsconfig.json         # TypeScript configuration
│   ├── Dockerfile            # Multi-stage production build Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/              # Next.js App Router and pages
│   │   └── components/       # Custom modular view components
│   ├── Dockerfile            # Multi-stage production build Dockerfile
│   └── package.json
├── samples/           # Consolidated CSV sample files for evaluation
├── docker-compose.yml
└── README.md
```

---

## Sample Files for Testing

To make testing and evaluation easier, all sample CSV files are consolidated in the `/samples` folder:

1. **[facebook_leads_export.csv](file:///d:/Projects/GrowEasy/samples/facebook_leads_export.csv)**: Mock Facebook Ads lead export.
   - *Columns*: `form_name`, `ad_name`, `full_name`, `phone_number`, `email_address`, `alternate_phone`, `alternate_email`, `city_town`, `budget_range`, `project_interest`, `notes_remarks`, `lead_status`, `submitted_on`.
   - *Test Scenario*: Evaluates standard social lead gen data, multiple emails/phones extraction (primary vs backup), and status conversion.

2. **[google_ads_generic_export.csv](file:///d:/Projects/GrowEasy/samples/google_ads_generic_export.csv)**: A dense, abbreviated column structure.
   - *Columns*: `Cust`, `Ph`, `E-mail`, `Loc`, `St`, `Cty`, `Src`, `Owner_Email`, `Stat`, `Rmks`, `Dt`, `Poss`.
   - *Test Scenario*: Tests AI mapping on short headers, empty rows skipping, and multiple location string components merging.

3. **[manual_sales_rep_sheet.csv](file:///d:/Projects/GrowEasy/samples/manual_sales_rep_sheet.csv)**: Messy, unstructured rep data.
   - *Columns*: `Lead Details`, `Contact Info`, `Where From`, `Project`, `Current Status of Lead`, `Sales Person Comments`, `Date Added`.
   - *Test Scenario*: Evaluates the AI's power to extract name and contact fields out of conversational values (e.g. "MRS KAVITHA REDDY - kavithareddy88@gmail.com only, no phone number"), and skip rows completely missing contacts.

4. **[test_leads_100.csv](file:///d:/Projects/GrowEasy/samples/test_leads_100.csv)**: High-volume standard CRM export.
   - *Columns*: Standard CRM fields with 100 rows of clean/messy data.
   - *Test Scenario*: Evaluates batch SSE streaming progress bars, chunk-by-chunk AI mapping, and large table previews.

5. **[large_test_dataset_30rows.csv](file:///d:/Projects/GrowEasy/samples/large_test_dataset_30rows.csv)**: Mid-size CRM export.
   - *Columns*: CRM fields with 30 rows of lead data.
   - *Test Scenario*: Evaluates performance mapping 30 rows with confidence score distributions.
