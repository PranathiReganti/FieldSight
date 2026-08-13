import { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";

const API_URL = "https://fieldsight-wwq1.onrender.com";

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
        setTimeout(() => checkStatus(id), 1500);
        return;
      }

      if (currentStatus === "PROCESSING") {
        setStatus("AI engine is extracting quality metrics & license plate...");
        setTimeout(() => checkStatus(id), 1500);
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
  };

  // Fetch audit log
  const fetchRecentSubmissions = async () => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("limit", "25");
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
            <div className="brand-icon">FS</div>
            <div>
              <h1>FieldSight</h1>
              <p>Intelligent Media & Vehicle Verification Platform</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="nav-tabs">
            <button
              className={`nav-tab ${activeTab === "verify" ? "active" : ""}`}
              onClick={() => setActiveTab("verify")}
            >
              📸 Verify Vehicle
            </button>
            <button
              className={`nav-tab ${activeTab === "audit" ? "active" : ""}`}
              onClick={() => setActiveTab("audit")}
            >
              📋 Field Audit Log
            </button>
          </nav>
        </div>
      </header>

      <main className="container">
        {activeTab === "verify" ? (
          <>
            {/* Hero Section */}
            <section className="hero">
              <div className="hero-badge">
                <span className="live-pulse"></span>
                AI-POWERED MEDIA VERIFICATION ENGINE
              </div>

              <h2>
                Verify Vehicle Registrations
                <br />
                <span>Instantly & Accurately from the Field</span>
              </h2>

              <p>
                Upload or capture any vehicle image to detect quality defects (blur,
                lighting, duplicates), extract registration numbers, and resolve official
                Indian RTO jurisdiction records.
              </p>
            </section>

            {/* Upload Section */}
            <section className="upload-card">
              <label className="upload-box">
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
                      className="preview"
                    />

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
                          📍 {vehicleNumber || "PLATE"}
                        </span>
                      </div>
                    )}

                    <div className="preview-overlay">
                      Click or drop to replace image
                    </div>
                  </div>
                ) : (
                  <div className="upload-content">
                    <div className="upload-icon">↑</div>
                    <h3>Choose or Capture a Vehicle Image</h3>
                    <p>Drag and drop, browse files, or use device camera</p>
                    <span>JPG or PNG · Maximum file size 10 MB</span>
                  </div>
                )}
              </label>

              {/* Mobile Camera Direct Capture */}
              <div className="camera-row">
                <label className="camera-button">
                  📷 Open Camera
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
                <div className="file-info">
                  <div>
                    <strong>{file.name}</strong>
                    <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                  <span className="file-ready">Ready for AI Engine</span>
                </div>
              )}

              <div className="button-row">
                <button
                  className="primary-button"
                  onClick={handleUpload}
                  disabled={!file || uploading}
                >
                  {uploading ? "Analyzing Image..." : "Analyze Vehicle Image"}
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
                    {status}
                  </div>
                </div>
              )}

              {error && (
                <div className="error-message">
                  <span>⚠</span> {error}
                </div>
              )}
            </section>

            {/* Results Section */}
            {results && (
              <section className="results-card">
                {/* Header */}
                <div className="results-header">
                  <div>
                    <div className="success-badge">✓ ANALYSIS COMPLETE</div>
                    <h2>Verification & Inspection Report</h2>
                    <p>Image processed and verified against MoRTH Indian standards.</p>
                  </div>

                  <div className="confidence-gauge">
                    <div className="gauge-circle">
                      <span className="gauge-val">{confidence}%</span>
                      <span className="gauge-label">CONFIDENCE</span>
                    </div>
                  </div>
                </div>

                {/* Embossed Indian License Plate Card */}
                <div className="vehicle-number-card">
                  <div className="vehicle-number-title">
                    <span className="vehicle-icon">🚗</span>
                    <div>
                      <span>DETECTED VEHICLE REGISTRATION</span>
                      <small>Ministry of Road Transport & Highways (MoRTH) Standard</small>
                    </div>
                  </div>

                  {/* Authentic Embossed Plate UI */}
                  <div className="embossed-plate-container">
                    <div className="embossed-plate">
                      <div className="plate-ind-strip">
                        <span className="chakra-icon">☸</span>
                        <span className="ind-text">IND</span>
                      </div>
                      <div className="plate-text">
                        {vehicleNumber || "NOT DETECTED"}
                      </div>
                    </div>
                  </div>

                  <div className={isVehicleValid ? "valid-badge" : "invalid-badge"}>
                    {isVehicleValid
                      ? "✓ Valid Indian License Plate"
                      : "✕ Vehicle Registration Not Validated"}
                  </div>

                  {/* Explainable AI Bounding Box Inspector */}
                  {bbox && (
                    <div className="bbox-toggle-row">
                      <button
                        className="chip-button"
                        onClick={() => setShowBoundingBox(!showBoundingBox)}
                      >
                        {showBoundingBox ? "Hide Plate Box" : "Show Plate Box"}
                      </button>
                      <span className="bbox-coord-text">
                        Localized at: X:{bbox.x}, Y:{bbox.y} ({bbox.width}×{bbox.height}px)
                      </span>
                    </div>
                  )}

                  {/* Photo Capture Guidance if Invalid */}
                  {!isVehicleValid && (
                    <div className="capture-guidance-box">
                      <div className="capture-guidance-title">
                        <span className="guidance-icon">💡</span>
                        <strong>Photo Capture Tips for High Accuracy</strong>
                      </div>
                      <p className="capture-guidance-desc">
                        The license plate could not be clearly recognized. For best results:
                      </p>
                      <ul className="capture-guidance-list">
                        <li>
                          <strong>Direct Angle:</strong> Capture straight-on facing the vehicle's front or rear (avoid steep diagonal/side views).
                        </li>
                        <li>
                          <strong>Clear Framing:</strong> Ensure the license plate is centered, close, and unobscured.
                        </li>
                        <li>
                          <strong>Sharp Focus & Lighting:</strong> Hold the camera steady to avoid blur and ensure adequate light.
                        </li>
                      </ul>
                    </div>
                  )}
                </div>

                {/* Indian RTO Location & Vehicle Classification Card */}
                {rto && (
                  <div className="rto-intelligence-card">
                    <div className="rto-header">
                      <span className="rto-icon">🏛</span>
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
                    <span>Image Sharpness</span>
                    <strong className={analysis?.blurScore < 6 ? "val-good" : "val-warn"}>
                      {analysis?.blurScore ? `${analysis.blurScore} / 10` : "N/A"}
                    </strong>
                    <small>
                      {analysis?.blurScore < 6 ? "✓ Sharp image" : "⚠ Potential blur"}
                    </small>
                  </div>

                  <div className="result-item">
                    <span>Luminance & Lighting</span>
                    <strong>{analysis?.brightness ? `${analysis.brightness} Lux` : "N/A"}</strong>
                    <small>
                      {analysis?.brightness >= 40 ? "✓ Well-lit frame" : "⚠ Low-light condition"}
                    </small>
                  </div>

                  <div className="result-item">
                    <span>Duplicate Detection</span>
                    <strong className={analysis?.isDuplicate ? "val-warn" : "val-good"}>
                      {analysis?.isDuplicate ? "⚠ Duplicate Detected" : "✓ Unique Image"}
                    </strong>
                    <small>SHA-256 binary hash verified</small>
                  </div>
                </div>

                {/* Metadata & Raw OCR Section */}
                <details className="raw-ocr-details">
                  <summary>View Technical Metadata & Full-Image OCR Text</summary>
                  <div className="metadata-box">
                    <p><strong>Processing ID:</strong> {results.processingId}</p>
                    <p><strong>Original File:</strong> {results.metadata?.originalName}</p>
                    <p><strong>File Size:</strong> {(results.metadata?.sizeBytes / 1024).toFixed(1)} KB</p>
                    <p><strong>Raw OCR Stream:</strong></p>
                    <pre className="ocr-text-box">{analysis?.ocrText || "No text detected."}</pre>
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
                <h2>📋 Field Verification Submissions</h2>
                <p>Complete historical audit log of all processed vehicle verifications</p>
              </div>

              <div className="audit-actions">
                <button
                  className="secondary-button"
                  onClick={fetchRecentSubmissions}
                  disabled={auditLoading}
                >
                  🔄 Refresh
                </button>
                <button
                  className="primary-button"
                  onClick={exportToCSV}
                  disabled={!recentImages.length}
                >
                  📥 Export CSV Report
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="filter-bar">
              <input
                type="text"
                placeholder="Search by Vehicle Number or Filename..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchRecentSubmissions()}
                className="search-input"
              />

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
                className="chip-button"
                onClick={fetchRecentSubmissions}
              >
                Search
              </button>
            </div>

            {/* Submissions Table */}
            {auditLoading ? (
              <div className="audit-loading">Loading audit records...</div>
            ) : recentImages.length === 0 ? (
              <div className="audit-empty">No verification records found.</div>
            ) : (
              <div className="table-responsive">
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Filename</th>
                      <th>Vehicle Number</th>
                      <th>RTO Jurisdiction</th>
                      <th>Quality</th>
                      <th>Status</th>
                      <th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentImages.map((row) => (
                      <tr key={row.id}>
                        <td>
                          {new Date(row.createdAt).toLocaleDateString()}{" "}
                          <small>{new Date(row.createdAt).toLocaleTimeString()}</small>
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
                              <small>{row.rtoDetails.stateName}</small>
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
                          <strong>{row.confidenceScore ?? 0}%</strong>
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
    </div>
  );
}

export default App;