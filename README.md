# FieldSight – Intelligent Media Processing & Vehicle Verification Platform

FieldSight is an enterprise-grade, asynchronous media processing and vehicle verification platform with an interactive web dashboard. It accepts vehicle images captured in the field, performs rigorous quality heuristics (blur, brightness, duplicate SHA-256 hash), extracts vehicle license plates using explainable multi-scale OCR, and validates registrations against strict Indian Ministry of Road Transport & Highways (MoRTH) standards with full National RTO jurisdiction resolution.

---

## 🌐 Live Deployments

- **Live Web Dashboard (Vercel)**: [https://field-sight-phi.vercel.app](https://field-sight-phi.vercel.app)
- **Live Backend API (Render)**: [https://fieldsight-wwq1.onrender.com](https://fieldsight-wwq1.onrender.com)
- **GitHub Repository**: [https://github.com/PranathiReganti/FieldSight](https://github.com/PranathiReganti/FieldSight)

---

## 🚀 Key Features

### 1. Verification & Quality Heuristics Engine
- **Blur Analysis**: Laplacian operator convolution measuring edge variance gradient ($>6.0$ threshold).
- **Luminance & Low-Light Detection**: Channel luminance calculation ($\bar{Y} = 0.299R + 0.587G + 0.114B$).
- **Cryptographic Duplicate Detection**: Instant binary SHA-256 buffer hash lookup against PostgreSQL ledger.
- **Smart Capture Guidance**: Contextual recommendations for camera distance, angle, and lighting.

### 2. Multi-Scale OCR & Clean Filtering
- **Multi-Scale Candidate Scanning**: Sliding window crops ($16\%$, $20\%$, $26\%$, $34\%$, $45\%$) with adaptive binarization.
- **Stacked Two-Line Plate Reconciler**: Reconciles commercial split-level plates (`MH 12 N` over `W 8556` $\rightarrow$ `MH12NW8556`).
- **Clean OCR Filtering**: Proprietary phonetic and domain dictionary filter eliminates background OCR hallucinations while preserving valid phone numbers, signage, and plates.

### 3. MoRTH & National RTO Intelligence
- **28 States & 8 Union Territories**: Validates official district code boundaries across India (`MAX_DISTRICT_BY_STATE`).
- **Instant RTO Decoding**: Automatically maps registration codes to jurisdiction (e.g., `KA-02` $\rightarrow$ Bangalore West, Karnataka; `MH-12` $\rightarrow$ Pune, Maharashtra).

### 4. Interactive Real-Time Pipeline Progress
- **Live Conversational Stepper**: Real-time progress percentage ($15\% \rightarrow 100\%$) and dynamic human-friendly updates (*"AI is scanning vehicle contours..."*, *"AI is extracting the number plate..."*).
- **4 Milestone Checkpoint Pills**: Interactive visual indicators for Quality, Localization, Neural OCR, and MoRTH validation.

### 5. Field Audit Vault & CSV Export
- **Immutable PostgreSQL Audit Trail**: Complete historical ledger of every processed verification, status, and forensic metrics.
- **Search & Filter**: Real-time search by registration number, status (Valid, Invalid, Failed), or date.
- **One-Click CSV Export**: Download complete compliance reports for fleet and municipal auditing.

### 6. Modern Mobile-First UX
- **Authentic 3D HSRP License Plate**: Embossed high-security plate visualization with chrome corner screws and deep blue `IND` badge.
- **Cyber Forensic Terminal**: Real-time metadata inspector with one-click "Copy OCR" functionality.
- **Mobile Hamburger Navigation**: Seamless slide-out navigation drawer with zero card overflow or layout clipping.
- **Device Camera Direct Capture**: One-tap trigger for mobile field workers.

---

## 📐 Architecture & Workflow

### Service Flow Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User as Field Worker / Inspector
    participant Frontend as React Dashboard (Vercel)
    participant API as Express API (Render)
    participant DB as PostgreSQL Database
    participant Queue as In-Memory Async Queue
    participant Engine as Sharp + Tesseract OCR Engine

    User->>Frontend: Select / Capture Vehicle Image
    Frontend->>API: POST /api/images/upload (multipart/form-data)
    API->>API: Validate MIME (JPEG/PNG) & Size (<10MB)
    API->>DB: INSERT Image (Status: PENDING)
    API->>Queue: Push imageId to Queue
    API-->>Frontend: HTTP 202 Accepted { processingId, status: "PENDING" }
    
    par Async Processing Pipeline
        Queue->>DB: UPDATE Image (Status: PROCESSING)
        Queue->>Engine: Run Quality Checks & Multi-Scale OCR
        Engine->>Engine: 1. Blur & Brightness Analysis<br/>2. SHA-256 Checksum<br/>3. Yellow/White Plate Flood Fill<br/>4. Multi-Scale OCR & MoRTH Validation<br/>5. Clean Stream Noise Elimination
        Engine-->>Queue: Analysis Metrics + Validated Registration + RTO
        Queue->>DB: UPDATE Image (Status: COMPLETED, results...)
    and Frontend Real-Time Polling & Ticker
        loop Every 2 Seconds
            Frontend->>API: GET /api/images/:id/status
            API-->>Frontend: { status: "PROCESSING" }
        end
    end
    
    Frontend->>API: GET /api/images/:id/results
    API-->>Frontend: HTTP 200 { status: "COMPLETED", results: { ... } }
    Frontend-->>User: Render 3D HSRP Plate, RTO Jurisdiction, Quality Cards & Audit Log
```

---

## 🔍 Image Analysis & Quality Checks

| Check | Algorithm / Technique | Output / Metric |
| :--- | :--- | :--- |
| **1. Blur Detection** | Laplacian operator convolution computing edge gradient variance across luminance channels. | Numeric `blurScore` and boolean `isBlurry` flag ($>6.0$). |
| **2. Brightness / Low-Light** | Per-pixel channel luminance calculation ($\bar{Y} = 0.299R + 0.587G + 0.114B$). | Numeric `brightness` ($0$–$255$) and `isLowLight` flag ($<40$). |
| **3. Duplicate Detection** | Cryptographic `SHA-256` hashing of image binary buffer compared against database history. | Boolean `isDuplicate: true/false`. |
| **4. Multi-Scale OCR Extraction** | Global image pass + multi-scale candidate sliding windows ($16\%$, $20\%$, $26\%$, $34\%$, $45\%$) with adaptive binarization and gamma correction. | Cleaned `ocrText` and candidate strings. |
| **5. MoRTH License Plate Validation** | Strict Indian vehicle format engine verifying valid 2-letter state codes, real RTO district boundaries (`MAX_DISTRICT_BY_STATE`), valid series (excluding `I` and `O`), and 4-digit numbers. | `vehicleNumber` and `vehicleNumberValid: true/false`. |
| **6. Stacked Two-Line Plate Parser** | Reconciles two-line commercial plates (`MH 12 N` over `W 8556` $\rightarrow$ `MH12NW8556`) with character confusion mapping (`H` $\leftrightarrow$ `W`, `NN` $\leftrightarrow$ `NW`). | Structured standard registration. |
| **7. RTO Jurisdiction Resolution** | State and district prefix lookup mapping against Indian transport registry database. | State name, RTO office location, and regional authority. |

---

## 🤖 AI Usage Disclosure

### 1. Where AI Was Used
- Rapid scaffolding of image transformation pipelines in Sharp.
- Initial drafting of regular expression tokenizers for vehicle license plates.
- Brainstorming edge enhancement filters (CLAHE, unsharp masks, gamma stretching).

### 2. What AI Helped With
- Speeding up boilerplate setup for Express, TypeScript, and Prisma configurations.
- Generating candidate sliding-window geometry algorithms for bounding-box segmentation.

### 3. Where AI Output Was Wrong / Hallucinated
- **UK / European Plate Format Bias**: Initial AI-suggested regex included UK format `/^[A-Z]{2}\d{2}[A-Z]{3}$/`. When testing an Indian auto rickshaw with roof advertisements, the LLM-generated code matched advertisement text fragments like `AN12HOD` as valid plates.
- **Combinatorial Multi-Line Hallucinations**: AI-generated multi-line text parsers blindly concatenated arbitrary lines across paragraphs, constructing hallucinated registrations (e.g. combining Ladakh state prefix `LA` with phone number digits `11` to create `LA11D1015`, even though Ladakh only has RTO districts `01` and `02`).
- **Character Confusions in Stacked Plates**: Generic OCR prompts failed to recognize that commercial Indian plates split the series letters across line 1 and line 2 (`MH 12 N` / `W 8556`).
- **Raw OCR Stream Artifacts**: English OCR models reading non-Latin Indian billboard text generated garbage tokens (`WPT rac`, `pin MTT`, `QVrs`).

### 4. How Human Engineering Validated and Fixed It
- **Enforced Strict MoRTH RTO Rules**: Removed all foreign plate patterns. Created a strict `MAX_DISTRICT_BY_STATE` dictionary (e.g., `LA` $\le 2$, `GA` $\le 2$, `MH` $\le 50$, `KA` $\le 71$) and banned `I` and `O` in series codes.
- **Isolated Full-Image vs. Crop Tokenization**: Added the `isPlateCrop` boundary flag to prevent multi-line concatenation on full-image background text.
- **Created Two-Line Stacked Reconciler (`parseStackedLines`)**: Engineered custom algorithmic logic to handle split series and character confusion (`H` $\leftrightarrow$ `W`).
- **Clean OCR Filter (`cleanOcrTextHighQuality`)**: Built a dictionary and phonetic syllable filter to eliminate OCR noise while retaining true entities.
- **Automated Benchmark Test Suite**: Created unit and integration tests asserting $100\%$ accuracy on real field images (`KA02MP9657`, `MH12NW8556`) with 0 false positives across 31 test suites.

---

## ⚖️ Trade-offs & Engineering Decisions

### 1. What Was Intentionally Simplified
- **In-Memory Queue vs. Redis/BullMQ**: Implemented an in-memory async worker queue to keep the deployment lightweight, free of external Redis cluster costs, and easy to run locally in one command.
- **Local Disk Storage vs. AWS S3**: Saved uploaded files to local disk storage (`uploads/`) with stored path references in PostgreSQL.

### 2. What Would Be Improved With More Time
- **Deep Learning Object Detector (YOLOv8)**: Replace color flood-fill and sliding windows with a fine-tuned lightweight YOLOv8 nano model trained specifically on Indian HSRP and commercial license plates.
- **Cloud Storage (AWS S3 / Cloudflare R2)**: Offload image storage to cloud object storage with pre-signed upload URLs to reduce backend bandwidth.
- **Distributed Queue (BullMQ + Redis)**: Scale out background workers independently from the HTTP API server.
- **WebSockets / Server-Sent Events (SSE)**: Replace HTTP polling with real-time push notifications for processing updates.

---

## 🚀 Running Instructions (Local Setup)

### Prerequisites
- Node.js 18+ installed
- Docker (optional, for local PostgreSQL)

### 1. Clone the Repository
```bash
git clone https://github.com/PranathiReganti/FieldSight.git
cd FieldSight
```

### 2. Start PostgreSQL Database
Using Docker Compose:
```bash
docker-compose up -d
```
*Or configure your own PostgreSQL instance in `backend/.env`:*
```env
DATABASE_URL="postgresql://fieldsight:fieldsight_dev_password@localhost:5432/fieldsight"
PORT=5000
```

### 3. Setup and Run Backend
```bash
cd backend
npm install
npx prisma db push
npm run dev
```
Backend will start on `http://localhost:5000`.

### 4. Setup and Run Frontend Dashboard
```bash
cd ../frontend
npm install
npm run dev
```
Frontend will start on `http://localhost:5173`.

### 5. Run Automated Test Suite
```bash
cd backend
npm test
```

---

## 📡 API Endpoints & Usage

### 1. Upload Image
**Request:**
```bash
curl -X POST http://localhost:5000/api/images/upload \
  -F "image=@backend/uploads/car-ind-number-plate.jpeg"
```
**Response (`HTTP 202 Accepted`):**
```json
{
  "message": "Image uploaded and queued for processing",
  "processingId": "51e9d9d7-edf2-474d-8ed1-ec1e6cbb33bc",
  "status": "PENDING"
}
```

### 2. Check Processing Status
**Request:**
```bash
curl http://localhost:5000/api/images/51e9d9d7-edf2-474d-8ed1-ec1e6cbb33bc/status
```
**Response (`HTTP 200 OK`):**
```json
{
  "processingId": "51e9d9d7-edf2-474d-8ed1-ec1e6cbb33bc",
  "status": "COMPLETED",
  "failureReason": null,
  "createdAt": "2026-08-13T02:00:00.000Z",
  "updatedAt": "2026-08-13T02:00:10.000Z"
}
```

### 3. Retrieve Analysis Results
**Request:**
```bash
curl http://localhost:5000/api/images/51e9d9d7-edf2-474d-8ed1-ec1e6cbb33bc/results
```
**Response (`HTTP 200 OK`):**
```json
{
  "processingId": "51e9d9d7-edf2-474d-8ed1-ec1e6cbb33bc",
  "status": "COMPLETED",
  "results": {
    "blurScore": 2.35,
    "brightness": 101.28,
    "ocrText": "ARENA ANIMATION Learn from the Leader 5 LAKH+ GLOBAL ALUMNI 7755900813",
    "vehicleNumber": "MH12NW8556",
    "vehicleNumberValid": true,
    "isDuplicate": false,
    "confidenceScore": 96,
    "rtoDetails": {
      "stateCode": "MH",
      "stateName": "Maharashtra",
      "districtCode": "12",
      "rtoLocation": "Pune",
      "authority": "Regional Transport Office, Pune"
    }
  },
  "metadata": {
    "originalName": "auto-rickshaw.jpeg",
    "mimeType": "image/jpeg",
    "sizeBytes": 177490
  }
}
```

### 4. Fetch Recent Audit Submissions
**Request:**
```bash
curl "http://localhost:5000/api/images/recent?limit=50&status=COMPLETED"
```

---

## 📌 Assumptions Made

1. **Supported File Formats**: Standard JPEG (`image/jpeg`) and PNG (`image/png`) images up to $10\text{ MB}$.
2. **Registration Standards**: Indian vehicle registrations follow Ministry of Road Transport and Highways (MoRTH) standards (2-letter state code + 2-digit district code + 1–3 series letters + 4 digits).
3. **Capture Conditions**: License plates are reasonably visible within $\pm 20^\circ$ planar angle. For blurry or oblique shots, the system flags the image and provides capture guidance.
4. **Duplicate Criteria**: Exact binary duplicates are identified via SHA-256 cryptographic hashing.

---

## 🛡️ License

MIT License. Designed and engineered for high-performance vehicle verification.
