# FieldSight – Intelligent Media Processing Pipeline

FieldSight is an asynchronous media processing and vehicle verification backend with an interactive web dashboard. It accepts vehicle images captured in the field, performs quality checks (blur, brightness, duplicates), extracts vehicle numbers via OCR, and validates registrations against strict Indian Ministry of Road Transport & Highways (MoRTH) standards.

---

## 🌐 Live Deployments

- **Live Web Dashboard (Vercel)**: [https://field-sight-phi.vercel.app](https://field-sight-phi.vercel.app)
- **Live Backend API (Render)**: [https://fieldsight-wwq1.onrender.com](https://fieldsight-wwq1.onrender.com)
- **GitHub Repository**: [https://github.com/PranathiReganti/FieldSight](https://github.com/PranathiReganti/FieldSight)

---

## 📐 Architecture

### 1. Service Flow Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User as Field Worker / User
    participant Frontend as React Dashboard (Vercel)
    participant API as Express API (Render)
    participant DB as PostgreSQL Database
    participant Queue as In-Memory Async Queue
    participant Engine as Sharp + Tesseract OCR Engine

    User->>Frontend: Select / Drop Vehicle Image
    Frontend->>API: POST /api/images/upload (multipart/form-data)
    API->>API: Validate MIME (JPEG/PNG) & Size (<10MB)
    API->>DB: INSERT Image (Status: PENDING)
    API->>Queue: Push imageId to Queue
    API-->>Frontend: HTTP 202 Accepted { processingId, status: "PENDING" }
    
    par Async Worker Execution
        Queue->>DB: UPDATE Image (Status: PROCESSING)
        Queue->>Engine: Run Quality Checks & Multi-Scale OCR
        Engine->>Engine: 1. Blur & Brightness Analysis<br/>2. SHA-256 Checksum<br/>3. Yellow/White Plate Flood Fill<br/>4. Multi-Scale OCR & MoRTH Validation
        Engine-->>Queue: Analysis Metrics + Validated Registration
        Queue->>DB: UPDATE Image (Status: COMPLETED, results...)
    and Frontend Polling
        loop Every 2 Seconds
            Frontend->>API: GET /api/images/:id/status
            API-->>Frontend: { status: "PROCESSING" }
        end
    end
    
    Frontend->>API: GET /api/images/:id/results
    API-->>Frontend: HTTP 200 { status: "COMPLETED", results: { ... } }
    Frontend-->>User: Render Verification Results, Quality Cards & Capture Tips
```

### 2. Processing Pipeline Lifecycle
Every uploaded image transitions through a strict 4-state lifecycle:
$$\mathbf{PENDING} \longrightarrow \mathbf{PROCESSING} \longrightarrow \mathbf{COMPLETED} \;\;/\;\; \mathbf{FAILED}$$

- **`PENDING`**: Image metadata and file binary saved to disk; queued for async execution.
- **`PROCESSING`**: Background worker is executing image quality heuristics, sliding window crops, and OCR passes.
- **`COMPLETED`**: Analysis finished successfully; metrics, plate number, and confidence score written to the database.
- **`FAILED`**: An unrecoverable error occurred (e.g. corrupted file); `failureReason` is persisted.

### 3. Queue Strategy
- **Architecture**: In-memory asynchronous worker queue (`processingQueue.ts`).
- **Rationale**: An in-memory queue eliminates the operational complexity, cost, and external dependency overhead of Redis/BullMQ for single-instance deployments while guaranteeing strict non-blocking HTTP responses (`HTTP 202 Accepted` within $<50\text{ms}$).
- **Concurrency & Backpressure**: Jobs are serialized sequentially to prevent CPU exhaustion during heavy OCR and image convolution operations.

---

## 🔍 Image Analysis & Quality Checks

FieldSight implements **6 meaningful image analysis checks**:

| Check | Algorithm / Technique | Output / Metric |
| :--- | :--- | :--- |
| **1. Blur Detection** | Laplacian operator convolution computing edge gradient variance across luminance channels. | Numeric `blurScore` and boolean `isBlurry` flag ($>6.0$). |
| **2. Brightness / Low-Light** | Per-pixel channel luminance calculation ($\bar{Y} = 0.299R + 0.587G + 0.114B$). | Numeric `brightness` ($0$–$255$) and `isLowLight` flag ($<40$). |
| **3. Duplicate Detection** | Cryptographic `SHA-256` hashing of image binary buffer compared against database history. | Boolean `isDuplicate: true/false`. |
| **4. Multi-Scale OCR Extraction** | Global image pass + multi-scale candidate sliding windows ($16\%$, $20\%$, $26\%$, $34\%$, $45\%$) with adaptive binarization and gamma correction. | Raw `ocrText` and candidate strings. |
| **5. MoRTH License Plate Validation** | Strict Indian vehicle format engine verifying valid 2-letter state codes, real RTO district boundaries (`MAX_DISTRICT_BY_STATE`), valid series (excluding `I` and `O`), and 4-digit numbers. | `vehicleNumber` and `vehicleNumberValid: true/false`. |
| **6. Stacked Two-Line Plate Parser** | Reconciles two-line commercial plates (`MH 12 N` over `W 8556` $\rightarrow$ `MH12NW8556`) with character confusion mapping (`H` $\leftrightarrow$ `W`, `NN` $\leftrightarrow$ `NW`). | Structured standard registration. |

---

## 🤖 AI Usage Disclosure (Mandatory)

In compliance with the assignment submission guidelines, here is a transparent disclosure of AI assistance, hallucinations encountered, and human engineering validation:

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

### 4. How Human Engineering Validated and Fixed It
- **Enforced Strict MoRTH RTO Rules**: Removed all foreign plate patterns. Created a strict `MAX_DISTRICT_BY_STATE` dictionary (e.g., `LA` $\le 2$, `GA` $\le 2$, `MH` $\le 50$, `KA` $\le 71$) and banned `I` and `O` in series codes.
- **Isolated Full-Image vs. Crop Tokenization**: Added the `isPlateCrop` boundary flag to prevent multi-line concatenation on full-image background text.
- **Created Two-Line Stacked Reconciler (`parseStackedLines`)**: Engineered custom algorithmic logic to handle split series and character confusion (`H` $\leftrightarrow$ `W`).
- **Built an Automated Benchmark Test Suite**: Created unit and integration tests asserting $100\%$ accuracy on real field images (`KA02MP9657`, `MH12NW8556`) with 0 false positives.

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

### 3. Scalability Concerns
- **CPU-Intensive OCR**: Tesseract OCR and high-resolution image convolutions are CPU-heavy. Under high traffic, workers should be containerized in autoscaling worker pools (e.g. AWS ECS / Kubernetes).
- **Database Connection Limits**: On managed databases (e.g. Render/Supabase free tiers), connection pooling (via Prisma Accelerate or PgBouncer) is required to prevent connection exhaustion.

### 4. Failure Handling Concerns
- **Worker Process Restarts**: In-memory queues do not survive server restarts. In enterprise production, persistent job queues (e.g. SQS / BullMQ) ensure job retry upon node failure.
- **Processing Timeouts**: Heavy images are bounded by worker timeouts and max resolution limits to prevent memory exhaustion.

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

## 📡 Sample API Requests & Responses

### 1. Upload Image
**Request:**
```bash
curl -X POST http://localhost:5000/api/images/upload \
  -F "image=@backend/uploads/1786543227769-car-ind-number-plate.jpeg"
```
**Response (`HTTP 202 Accepted`):**
```json
{
  "message": "Image uploaded and queued for processing",
  "processingId": "51e9d9d7-edf2-474d-8ed1-ec1e6cbb33bc",
  "status": "PENDING"
}
```

---

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

---

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
    "ocrText": "KA 02 MP 9657 ...",
    "vehicleNumber": "KA02MP9657",
    "vehicleNumberValid": true,
    "isDuplicate": false,
    "confidenceScore": 93
  },
  "metadata": {
    "originalName": "honda-city.jpeg",
    "mimeType": "image/jpeg",
    "sizeBytes": 177490
  },
  "createdAt": "2026-08-13T02:00:00.000Z",
  "updatedAt": "2026-08-13T02:00:10.000Z"
}
```

---

### 4. Failure Response Example
**Response (`HTTP 500` / `status: FAILED`):**
```json
{
  "processingId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "status": "FAILED",
  "failureReason": "Corrupted or unsupported image file header"
}
```

---

## 📌 Assumptions Made

1. **Supported File Formats**: Standard JPEG (`image/jpeg`) and PNG (`image/png`) images up to $10\text{ MB}$.
2. **Registration Standards**: Indian vehicle registrations follow Ministry of Road Transport and Highways (MoRTH) standards (2-letter state code + 2-digit district code + 1–3 series letters + 4 digits).
3. **Capture Conditions**: License plates are reasonably visible within $\pm 20^\circ$ planar angle. For blurry or oblique shots, the system gracefully flags the image and provides capture guidance.
4. **Duplicate Criteria**: Exact binary duplicates are identified via SHA-256 cryptographic hashing.

---

## 🎁 Bonus Features Implemented

- ✅ **Interactive React Dashboard**: Modern UI deployed on Vercel with real-time status polling, quality scorecards, and dark-themed metrics.
- ✅ **Dynamic Weighted Confidence Scoring**: Composite confidence calculation combining OCR character agreement, image sharpness, lighting, aspect ratio matching, and MoRTH format verification.
- ✅ **Intelligent Photo Capture Guidance**: Contextual tips displayed when an image is blurry or taken at an unreadable angle.
- ✅ **Production Cloud Deployments**: Live backend on Render, PostgreSQL on Render, and Frontend on Vercel.
- ✅ **Automated Benchmark Test Runner**: One-command test suite (`npm test`) asserting accuracy across test datasets.
