import { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";

const API_URL = "https://fieldsight-wwq1.onrender.com";

// Professional Inline SVG Icons
const CameraIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
    <circle cx="12" cy="13" r="4"></circle>
  </svg>
);

const AuditLogIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <line x1="16" y1="13" x2="8" y2="13"></line>
    <line x1="16" y1="17" x2="8" y2="17"></line>
    <polyline points="10 9 9 9 8 9"></polyline>
  </svg>
);

const UploadIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="17 8 12 3 7 8"></polyline>
    <line x1="12" y1="3" x2="12" y2="15"></line>
  </svg>
);

const ShieldCheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
    <polyline points="9 12 11 14 15 10"></polyline>
  </svg>
);

const GovIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="21" x2="21" y2="21"></line>
    <line x1="4" y1="10" x2="20" y2="10"></line>
    <polygon points="12 2 2 7 22 7 12 2"></polygon>
    <line x1="6" y1="10" x2="6" y2="21"></line>
    <line x1="10" y1="10" x2="10" y2="21"></line>
    <line x1="14" y1="10" x2="14" y2="21"></line>
    <line x1="18" y1="10" x2="18" y2="21"></line>
  </svg>
);

const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
);

const RefreshIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"></polyline>
    <polyline points="1 20 1 14 7 14"></polyline>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
  </svg>
);

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

const TerminalIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5"></polyline>
    <line x1="12" y1="19" x2="20" y2="19"></line>
  </svg>
);

const CopyIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

const FileIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
    <polyline points="13 2 13 9 20 9"></polyline>
  </svg>
);

function App() {
  const [activeTab, setActiveTab] = useState("verify"); // "verify" | "audit"
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [processingId, setProcessingId] = useState("");
  const [status, setStatus] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showBoundingBox, setShowBoundingBox] = useState(true);
  const [copied, setCopied] = useState(false);

  // Audit Log State
  const [recentImages, setRecentImages] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0];

    setError("");
    setResults(null);
    setStatus("");
    setProcessingId("");

    if (!selectedFile) {
      setFile(null);
      setPreview("");
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png"];

    if (!allowedTypes.includes(selectedFile.type)) {
      setError("Only JPG and PNG images are allowed.");
      setFile(null);
      setPreview("");
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError("Image size must not exceed 10 MB.");
      setFile(null);
      setPreview("");
      return;
    }

    setFile(selectedFile);
    setPreview(URL.createObjectURL(selectedFile));
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select an image first.");
      return;
    }

    setUploading(true);
    setError("");
    setResults(null);
    setStatus("Uploading image to processing pipeline...");

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await axios.post(
        `${API_URL}/api/images/upload`,
        formData
      );

      const id = response.data.processingId;
      setProcessingId(id);
      setStatus("Image queued. Running asynchronous AI analysis...");

      checkStatus(id);
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.error ||
          "Failed to upload image. Make sure the backend service is reachable."
      );
      setStatus("");
      setUploading(false);
    }
  };

  const checkStatus = async (id) => {
    try {
      const response = await axios.get(
        `${API_URL}/api/images/${id}/status`
      );

      const currentStatus = response.data.status;

      if (currentStatus === "PENDING") {
        setStatus("Image is queued in the worker pipeline...");
        setTimeout(() => checkStatus(id), 1200);
        return;
      }

      if (currentStatus === "PROCESSING") {
        setStatus("AI engine is extracting quality metrics & license plate...");
        setTimeout(() => checkStatus(id), 1200);
        return;
      }

      if (currentStatus === "FAILED") {
        setError(
          response.data.failureReason ||
            "Image processing failed during analysis."
        );
        setStatus("");
        setUploading(false);
        return;
      }

      if (currentStatus === "COMPLETED") {
        setStatus("Analysis complete. Loading verification report...");
        getResults(id);
      }
    } catch (err) {
      console.error(err);
      setError("Unable to check image processing status.");
      setStatus("");
      setUploading(false);
    }
  };

  const getResults = async (id) => {
    try {
      const response = await axios.get(
        `${API_URL}/api/images/${id}/results`
      );

      setResults(response.data);
      setUploading(false);
      setStatus("");
    } catch (err) {
      console.error(err);
      setError("Unable to retrieve image verification results.");
      setStatus("");
      setUploading(false);
    }
  };

  const resetApplication = () => {
    setFile(null);
    setPreview("");
    setProcessingId("");
    setStatus("");
    setResults(null);
    setError("");
    setUploading(false);
    setCopied(false);
  };

  const copyOcrToClipboard = () => {
    if (!results?.results?.ocrText) return;
    navigator.clipboard.writeText(results.results.ocrText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Fetch audit log
  const fetchRecentSubmissions = async () => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("limit", "50");
      if (searchQuery) params.append("search", searchQuery);
      if (statusFilter) params.append("status", statusFilter);

      const response = await axios.get(
        `${API_URL}/api/images/recent?${params.toString()}`
      );
      setRecentImages(response.data.images || []);
    } catch (err) {
      console.error("Failed to load audit submissions:", err);
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "audit") {
      fetchRecentSubmissions();
    }
  }, [activeTab, statusFilter]);

  // Export audit log to CSV
  const exportToCSV = () => {
    if (!recentImages.length) return;

    const headers = [
      "ID",
      "Filename",
      "Timestamp",
      "Vehicle Number",
      "Status",
      "Valid",
      "Confidence %",
      "Blur Score",
      "Brightness",
      "RTO Office",
      "State",
    ];

    const rows = recentImages.map((img) => [
      img.id,
      img.originalName,
      new Date(img.createdAt).toLocaleString(),
      img.vehicleNumber || "N/A",
      img.status,
      img.vehicleNumberValid ? "TRUE" : "FALSE",
      img.confidenceScore ?? "N/A",
      img.blurScore ?? "N/A",
      img.brightness ?? "N/A",
      img.rtoDetails?.rtoOffice || "N/A",
      img.rtoDetails?.stateName || "N/A",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.map((val) => `"${val}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `fieldsight_audit_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const analysis = results?.results;
  const vehicleNumber = analysis?.vehicleNumber || null;
  const isVehicleValid = analysis?.vehicleNumberValid === true;
  const confidence = analysis?.confidenceScore ?? 0;
  const rto = analysis?.rtoDetails || null;
  const bbox = analysis?.plateBoundingBox || null;

  return (
    <div className="app">
      {/* Top Header */}
      <header className="header">
        <div className="header-content">
          <div className="brand-group">
            <div className="brand-icon-wrapper">
              <div className="brand-icon">FS</div>
              <div className="brand-glow"></div>
            </div>
            <div>
              <div className="brand-title-row">
                <h1>FieldSight</h1>
                <span className="brand-version-tag">ENTERPRISE v2.4</span>
              </div>
              <p>Intelligent Media & Vehicle Verification Platform</p>
            </div>
          </div>

          <div className="header-right-group">
            <div className="system-status-indicator">
              <span className="live-pulse-green"></span>
              <span>AI Engine Online</span>
            </div>

            {/* Navigation Tabs with Clean SVGs */}
            <nav className="nav-tabs">
              <button
                className={`nav-tab ${activeTab === "verify" ? "active" : ""}`}
                onClick={() => setActiveTab("verify")}
              >
                <CameraIcon />
                <span className="tab-text">Verify Vehicle</span>
              </button>
              <button
                className={`nav-tab ${activeTab === "audit" ? "active" : ""}`}
                onClick={() => setActiveTab("audit")}
              >
                <AuditLogIcon />
                <span className="tab-text">Field Audit Log</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="container">
        {activeTab === "verify" ? (
          <>
            {/* Hero Section */}
            <section className="hero">
              <div className="hero-badge">
                <span className="live-pulse"></span>
                <span>MoRTH INDIAN STANDARD COMPLIANT</span>
              </div>

              <h2>
                Verify Vehicle Registrations
                <br />
                <span className="gradient-text">Instantly & Accurately from the Field</span>
              </h2>

              <p>
                Upload or capture any vehicle image to detect quality defects (blur,
                lighting, duplicates), extract license plates with explainable AI, and resolve official
                Indian RTO jurisdiction records.
              </p>
            </section>

            {/* Upload Section */}
            <section className="upload-card">
              <label className={`upload-box ${preview ? "has-preview" : ""}`}>
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={handleFileChange}
                  disabled={uploading}
                />

                {preview ? (
                  <div className="preview-wrapper">
                    <img
                      src={preview}
                      alt="Selected vehicle"
                      className={`preview ${uploading ? "scanning" : ""}`}
                    />

                    {/* Animated Cyber Laser Scanner Bar */}
                    {uploading && (
                      <div className="laser-scanner">
                        <div className="laser-beam"></div>
                        <div className="laser-glow"></div>
                      </div>
                    )}

                    {/* Explainable AI Bounding Box Overlay */}
                    {results && bbox && showBoundingBox && (
                      <div
                        className="plate-bounding-box"
                        style={{
                          left: `${(bbox.x / (results.metadata?.width || 960)) * 100}%`,
                          top: `${(bbox.y / (results.metadata?.height || 1280)) * 100}%`,
                          width: `${(bbox.width / (results.metadata?.width || 960)) * 100}%`,
                          height: `${(bbox.height / (results.metadata?.height || 1280)) * 100}%`,
                        }}
                      >
                        <span className="bbox-label">
                          {vehicleNumber || "PLATE"}
                        </span>
                      </div>
                    )}

                    <div className="preview-overlay">
                      <span>Click or drop to replace image</span>
                    </div>
                  </div>
                ) : (
                  <div className="upload-content">
                    <div className="upload-icon-circle">
                      <UploadIcon />
                    </div>
                    <h3>Choose or Capture a Vehicle Image</h3>
                    <p>Drag and drop image here, or browse files</p>
                    <span className="upload-hint">JPG or PNG · Maximum file size 10 MB</span>
                  </div>
                )}
              </label>

              {/* Quick Camera Capture Button */}
              <div className="camera-row">
                <label className="camera-button">
                  <CameraIcon /> Capture with Device Camera
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    capture="environment"
                    onChange={handleFileChange}
                    disabled={uploading}
                  />
                </label>
              </div>

              {file && (
                <div className="file-info-card">
                  <div className="file-meta">
                    <span className="file-icon"><FileIcon /></span>
                    <div>
                      <strong>{file.name}</strong>
                      <span className="file-size">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                  </div>
                  <span className="file-ready-badge">Ready for AI Analysis</span>
                </div>
              )}

              <div className="button-row">
                <button
                  className={`primary-button ${uploading ? "loading" : ""}`}
                  onClick={handleUpload}
                  disabled={!file || uploading}
                >
                  {uploading ? (
                    <span className="btn-spinner-row">
                      <span className="spinner"></span> Processing Pipeline...
                    </span>
                  ) : (
                    "Run AI Verification"
                  )}
                </button>

                {(file || results || error) && (
                  <button
                    className="secondary-button"
                    onClick={resetApplication}
                    disabled={uploading}
                  >
                    Reset
                  </button>
                )}
              </div>

              {/* Progress & Status Indicators */}
              {status && (
                <div className="status-container">
                  <div className="progress-bar-animated"></div>
                  <div className="status-message">
                    <span className="status-dot"></span>
                    <span>{status}</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="error-message">
                  <span className="error-icon">!</span>
                  <div className="error-text">
                    <strong>Verification Alert:</strong> {error}
                  </div>
                </div>
              )}
            </section>

            {/* Results Section */}
            {results && (
              <section className="results-card">
                {/* Header */}
                <div className="results-header">
                  <div>
                    <div className="success-badge">
                      ANALYSIS COMPLETE
                    </div>
                    <h2>Verification & Inspection Report</h2>
                    <p>Image processed and verified against MoRTH Indian standard specifications.</p>
                  </div>

                  <div className="confidence-gauge">
                    <div className="gauge-circle">
                      <span className="gauge-val">{confidence}%</span>
                      <span className="gauge-label">CONFIDENCE</span>
                    </div>
                  </div>
                </div>

                {/* Embossed Indian High Security License Plate Card */}
                <div className="vehicle-number-card">
                  <div className="vehicle-number-title">
                    <div className="vehicle-title-badge"><ShieldCheckIcon /></div>
                    <div>
                      <span>DETECTED VEHICLE REGISTRATION</span>
                      <small>Ministry of Road Transport & Highways (MoRTH) Standard</small>
                    </div>
                  </div>

                  {/* Authentic Embossed 3D HSRP Plate UI */}
                  <div className="embossed-plate-container">
                    <div className="embossed-plate">
                      <span className="plate-screw top-left"></span>
                      <span className="plate-screw top-right"></span>
                      <span className="plate-screw bottom-left"></span>
                      <span className="plate-screw bottom-right"></span>

                      <div className="plate-ind-strip">
                        <span className="chakra-icon">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="2" x2="12" y2="22"></line>
                            <line x1="2" y1="12" x2="22" y2="12"></line>
                          </svg>
                        </span>
                        <span className="ind-text">IND</span>
                      </div>
                      <div className="plate-text">
                        {vehicleNumber || "NOT DETECTED"}
                      </div>
                    </div>
                  </div>

                  <div className={isVehicleValid ? "valid-badge" : "invalid-badge"}>
                    {isVehicleValid
                      ? "Official Indian MoRTH Compliant Plate"
                      : "Vehicle Registration Not Validated"}
                  </div>

                  {/* Explainable AI Bounding Box Inspector */}
                  {bbox && (
                    <div className="bbox-toggle-row">
                      <button
                        className="chip-button"
                        onClick={() => setShowBoundingBox(!showBoundingBox)}
                      >
                        {showBoundingBox ? "Hide Bounding Box" : "Show Bounding Box"}
                      </button>
                      <span className="bbox-coord-text">
                        Localized at: X: {bbox.x}px, Y: {bbox.y}px ({bbox.width}×{bbox.height}px)
                      </span>
                    </div>
                  )}

                  {/* Photo Capture Guidance if Invalid */}
                  {!isVehicleValid && (
                    <div className="capture-guidance-box">
                      <div className="capture-guidance-title">
                        <strong>Photo Capture Diagnostic & Guidance</strong>
                      </div>
                      {analysis?.message && (
                        <div className="diagnostic-alert-badge">
                          <span>Diagnostic:</span> {analysis.message}
                        </div>
                      )}
                      <p className="capture-guidance-desc">
                        For 100% verification accuracy, please follow standard field capture guidelines:
                      </p>
                      <ul className="capture-guidance-list">
                        <li>
                          <strong>Direct Rear / Front View:</strong> Capture straight-on facing the license plate (avoid steep side/diagonal angles).
                        </li>
                        <li>
                          <strong>Proper Framing:</strong> Ensure the registration plate is centered, close, and unobscured.
                        </li>
                        <li>
                          <strong>Steady Focus:</strong> Hold camera steady to avoid motion blur and ensure natural daylight/lighting.
                        </li>
                      </ul>
                    </div>
                  )}
                </div>

                {/* Indian RTO Location & Vehicle Classification Card */}
                {rto && (
                  <div className="rto-intelligence-card">
                    <div className="rto-header">
                      <div className="rto-icon-box"><GovIcon /></div>
                      <div>
                        <h3>Indian RTO Jurisdiction & Vehicle Category</h3>
                        <p>Decoded from official State Transport Authority database</p>
                      </div>
                    </div>

                    <div className="rto-grid">
                      <div className="rto-item">
                        <small>STATE / UNION TERRITORY</small>
                        <strong>{rto.stateName} ({rto.stateCode})</strong>
                      </div>

                      <div className="rto-item">
                        <small>RTO OFFICE</small>
                        <strong>{rto.rtoOffice}</strong>
                      </div>

                      <div className="rto-item">
                        <small>DISTRICT / JURISDICTION</small>
                        <strong>{rto.districtName} (Code: {rto.districtCode})</strong>
                      </div>

                      <div className="rto-item">
                        <small>VEHICLE REGISTRATION CATEGORY</small>
                        <span className="category-pill">{rto.vehicleCategory}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Image Quality Breakdown Grid */}
                <h3 className="section-subtitle">Image Quality & Forensic Heuristics</h3>
                <div className="result-grid">
                  <div className="result-item">
                    <div className="result-item-header">
                      <span>Image Sharpness</span>
                    </div>
                    <strong className={analysis?.blurScore < 6 ? "val-good" : "val-warn"}>
                      {analysis?.blurScore ? `${analysis.blurScore} / 10` : "N/A"}
                    </strong>
                    <small>
                      {analysis?.blurScore < 6 ? "Sharp image" : "Potential blur"}
                    </small>
                  </div>

                  <div className="result-item">
                    <div className="result-item-header">
                      <span>Luminance & Lighting</span>
                    </div>
                    <strong>{analysis?.brightness ? `${analysis.brightness} Lux` : "N/A"}</strong>
                    <small>
                      {analysis?.brightness >= 40 ? "Well-lit frame" : "Low-light condition"}
                    </small>
                  </div>

                  <div className="result-item">
                    <div className="result-item-header">
                      <span>Duplicate Detection</span>
                    </div>
                    <strong className={analysis?.isDuplicate ? "val-warn" : "val-good"}>
                      {analysis?.isDuplicate ? "Duplicate Detected" : "Unique Binary Hash"}
                    </strong>
                    <small>SHA-256 binary hash verified</small>
                  </div>
                </div>

                {/* Metadata & Raw OCR Section (Cyber Terminal) */}
                <details className="raw-ocr-details">
                  <summary>
                    <span className="terminal-summary-row">
                      <TerminalIcon /> View Technical Metadata & Full-Image OCR Stream
                    </span>
                    <span className="details-chevron">▼</span>
                  </summary>
                  <div className="metadata-box">
                    <div className="terminal-header">
                      <div className="terminal-dots">
                        <span className="t-dot dot-red"></span>
                        <span className="t-dot dot-yellow"></span>
                        <span className="t-dot dot-green"></span>
                      </div>
                      <span className="terminal-title">fieldsight-engine://metadata-inspector</span>
                      <button className="copy-btn" onClick={copyOcrToClipboard}>
                        <CopyIcon /> {copied ? "Copied!" : "Copy OCR"}
                      </button>
                    </div>

                    <div className="metadata-row-grid">
                      <div><strong>Processing ID:</strong> <code>{results.processingId}</code></div>
                      <div><strong>Original File:</strong> <code>{results.metadata?.originalName}</code></div>
                      <div><strong>File Size:</strong> <code>{(results.metadata?.sizeBytes / 1024).toFixed(1)} KB</code></div>
                    </div>

                    <div className="ocr-stream-label">Extracted OCR Stream:</div>
                    <pre className="ocr-text-box">{analysis?.ocrText || "No readable text detected."}</pre>
                  </div>
                </details>
              </section>
            )}
          </>
        ) : (
          /* Field Audit Log Tab */
          <section className="audit-card">
            <div className="audit-header">
              <div>
                <div className="hero-badge">
                  <span>AUDIT COMPLIANCE VAULT</span>
                </div>
                <h2>Field Verification Submissions</h2>
                <p>Complete historical ledger of all processed vehicle verifications and quality metrics</p>
              </div>

              <div className="audit-actions">
                <button
                  className="secondary-button"
                  onClick={fetchRecentSubmissions}
                  disabled={auditLoading}
                >
                  <RefreshIcon /> Refresh
                </button>
                <button
                  className="primary-button export-btn"
                  onClick={exportToCSV}
                  disabled={!recentImages.length}
                >
                  <DownloadIcon /> Export CSV Report
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="filter-bar">
              <div className="search-box-wrapper">
                <span className="search-icon"><SearchIcon /></span>
                <input
                  type="text"
                  placeholder="Search by Vehicle Number or Filename..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchRecentSubmissions()}
                  className="search-input"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="status-select"
              >
                <option value="">All Statuses</option>
                <option value="COMPLETED">Completed</option>
                <option value="PENDING">Pending</option>
                <option value="PROCESSING">Processing</option>
                <option value="FAILED">Failed</option>
              </select>

              <button
                className="chip-button search-btn"
                onClick={fetchRecentSubmissions}
              >
                Filter Records
              </button>
            </div>

            {/* Submissions Table */}
            {auditLoading ? (
              <div className="audit-loading">
                <span className="spinner"></span> Loading audit records from PostgreSQL database...
              </div>
            ) : recentImages.length === 0 ? (
              <div className="audit-empty">
                <h3>No verification records found</h3>
                <p>Upload a vehicle image in the Verify tab to generate verification ledger entries.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Filename</th>
                      <th>Vehicle Number</th>
                      <th>RTO Jurisdiction</th>
                      <th>Quality Metrics</th>
                      <th>Status</th>
                      <th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentImages.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <div className="time-cell">
                            <strong>{new Date(row.createdAt).toLocaleDateString()}</strong>
                            <small>{new Date(row.createdAt).toLocaleTimeString()}</small>
                          </div>
                        </td>
                        <td className="filename-cell">
                          <strong>{row.originalName}</strong>
                          <small>{(row.sizeBytes / 1024).toFixed(1)} KB</small>
                        </td>
                        <td>
                          {row.vehicleNumber ? (
                            <span className="plate-pill">{row.vehicleNumber}</span>
                          ) : (
                            <span className="text-muted">Not detected</span>
                          )}
                        </td>
                        <td>
                          {row.rtoDetails?.rtoOffice ? (
                            <div>
                              <strong>{row.rtoDetails.rtoOffice}</strong>
                              <span className="rto-state-badge">{row.rtoDetails.stateName}</span>
                            </div>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          <div className="quality-pills">
                            <span className={row.blurScore < 6 ? "q-good" : "q-warn"}>
                              Blur: {row.blurScore ?? "—"}
                            </span>
                            {row.isDuplicate && (
                              <span className="q-warn">Duplicate</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`status-badge status-${row.status.toLowerCase()}`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td>
                          <div className="confidence-pill">
                            <strong>{row.confidenceScore ?? 0}%</strong>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Modern Footer */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-brand">
            <strong>FieldSight</strong> — Enterprise Media & Vehicle Verification Platform
          </div>
          <div className="footer-meta">
            MoRTH Indian Standard Compliant · High-Performance Dual-Engine Pipeline
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;