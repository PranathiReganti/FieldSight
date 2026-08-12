import { useState } from "react";
import axios from "axios";
import "./App.css";

const API_URL = "https://fieldsight-wwq1.onrender.com"; 

function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [processingId, setProcessingId] = useState("");
  const [status, setStatus] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

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
    setStatus("Uploading image...");

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await axios.post(
        `${API_URL}/api/images/upload`,
        formData
      );

      const id = response.data.processingId;

      setProcessingId(id);
      setStatus("Image uploaded. Processing...");

      checkStatus(id);
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.error ||
          "Failed to upload image. Make sure the backend is running."
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
        setStatus("Image is waiting for processing...");
        setTimeout(() => checkStatus(id), 1500);
        return;
      }

      if (currentStatus === "PROCESSING") {
        setStatus("Image is being processed...");
        setTimeout(() => checkStatus(id), 1500);
        return;
      }

      if (currentStatus === "FAILED") {
        setError(
          response.data.failureReason ||
            "Image processing failed."
        );

        setStatus("");
        setUploading(false);
        return;
      }

      if (currentStatus === "COMPLETED") {
        setStatus("Image processed successfully.");
        getResults(id);
      }
    } catch (err) {
      console.error(err);

      setError(
        "Unable to check image processing status."
      );

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
    } catch (err) {
      console.error(err);

      setError(
        "Unable to retrieve image results."
      );

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

  const analysis = results?.results;

  const vehicleNumber =
    analysis?.vehicleNumber || null;

  const isVehicleValid =
    analysis?.vehicleNumberValid === true;

  const confidence =
    analysis?.confidenceScore ?? 0;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="brand-icon">FS</div>

          <div>
            <h1>FieldSight</h1>
            <p>Vehicle Image Verification System</p>
          </div>
        </div>
      </header>

      <main className="container">
        {/* Hero */}
        <section className="hero">
          <div className="hero-badge">
            AI-POWERED IMAGE ANALYSIS
          </div>

          <h2>
            Verify Vehicle Images
            <br />
            <span>Instantly & Accurately</span>
          </h2>

          <p>
            Upload a vehicle image and FieldSight will
            analyze image quality, extract vehicle
            information, detect duplicates, and
            calculate a confidence score.
          </p>
        </section>

        {/* Upload Card */}
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

                <div className="preview-overlay">
                  Click to change image
                </div>
              </div>
            ) : (
              <div className="upload-content">
                <div className="upload-icon">
                  ↑
                </div>

                <h3>Choose a vehicle image</h3>

                <p>
                  Drag and drop or click to browse
                </p>

                <span>
                  JPG or PNG · Maximum size 10 MB
                </span>
              </div>
            )}
          </label>

          {file && (
            <div className="file-info">
              <div>
                <strong>{file.name}</strong>

                <span>
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>

              <span className="file-ready">
                Ready
              </span>
            </div>
          )}

          <div className="button-row">
            <button
              className="primary-button"
              onClick={handleUpload}
              disabled={!file || uploading}
            >
              {uploading
                ? "Analyzing..."
                : "Analyze Image"}
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

          {processingId && (
            <p className="processing-id">
              Processing ID: {processingId}
            </p>
          )}

          {status && (
            <div className="status-message">
              <span className="status-dot"></span>
              {status}
            </div>
          )}

          {error && (
            <div className="error-message">
              ⚠ {error}
            </div>
          )}
        </section>

        {/* Results */}
        {results && (
          <section className="results-card">
            {/* Results Header */}
            <div className="results-header">
              <div>
                <div className="success-badge">
                  ✓ ANALYSIS COMPLETE
                </div>

                <h2>Verification Results</h2>

                <p>
                  Your vehicle image has been
                  successfully analyzed.
                </p>
              </div>

              <div className="confidence">
                <span>Confidence</span>

                <strong>
                  {confidence}%
                </strong>
              </div>
            </div>

            {/* Vehicle Number Highlight */}
            <div className="vehicle-number-card">
              <div className="vehicle-number-title">
                <span className="vehicle-icon">
                  🚗
                </span>

                <div>
                  <span>VEHICLE NUMBER</span>
                  <small>
                    Detected registration number
                  </small>
                </div>
              </div>

              <div className="vehicle-number-value">
                {vehicleNumber || "Not detected"}
              </div>

              <div
                className={
                  isVehicleValid
                    ? "valid-badge"
                    : "invalid-badge"
                }
              >
                {isVehicleValid
                  ? "✓ Valid vehicle number"
                  : "✕ Vehicle number not validated"}
              </div>
            </div>

            {/* Result Grid */}
            <div className="result-grid">
              <div className="result-item">
                <span>Image Quality</span>

                <strong>
                  {analysis?.blurScore ?? "N/A"}
                </strong>

                <small>
                  Blur score
                </small>
              </div>

              <div className="result-item">
                <span>Brightness</span>

                <strong>
                  {analysis?.brightness ?? "N/A"}
                </strong>

                <small>
                  Average brightness
                </small>
              </div>

              <div className="result-item">
                <span>Confidence</span>

                <strong>
                  {confidence}%
                </strong>

                <small>
                  OCR confidence
                </small>
              </div>

              <div className="result-item">
                <span>Duplicate Image</span>

                <strong
                  className={
                    analysis?.isDuplicate
                      ? "warning-value"
                      : "success-value"
                  }
                >
                  {analysis?.isDuplicate
                    ? "Yes"
                    : "No"}
                </strong>

                <small>
                  SHA-256 verification
                </small>
              </div>

              <div className="result-item">
                <span>Processing Status</span>

                <strong className="success-value">
                  {results.status}
                </strong>

                <small>
                  Backend processing
                </small>
              </div>

              <div className="result-item">
                <span>File Type</span>

                <strong>
                  {results.metadata?.mimeType ||
                    "N/A"}
                </strong>

                <small>
                  Uploaded format
                </small>
              </div>
            </div>

            {/* Duplicate Warning */}
            {analysis?.isDuplicate && (
              <div className="duplicate-warning">
                <div className="warning-icon">
                  ⚠
                </div>

                <div>
                  <strong>
                    Duplicate image detected
                  </strong>

                  <p>
                    This image has the same checksum
                    as an image already processed by
                    FieldSight.
                  </p>
                </div>
              </div>
            )}

            {/* OCR */}
            <details className="ocr-section">
              <summary>
                <span>
                  OCR Extracted Text
                </span>

                <span className="ocr-toggle">
                  View raw OCR
                </span>
              </summary>

              <div className="ocr-box">
                {analysis?.ocrText ||
                  "No text detected"}
              </div>
            </details>

            {/* Metadata */}
            <div className="metadata">
              <h3>Image Information</h3>

              <div className="metadata-grid">
                <p>
                  <strong>File</strong>
                  <span>
                    {results.metadata?.originalName}
                  </span>
                </p>

                <p>
                  <strong>Type</strong>
                  <span>
                    {results.metadata?.mimeType}
                  </span>
                </p>

                <p>
                  <strong>Size</strong>
                  <span>
                    {(
                      results.metadata
                        ?.sizeBytes /
                      1024 /
                      1024
                    ).toFixed(2)}{" "}
                    MB
                  </span>
                </p>

                <p>
                  <strong>Processing ID</strong>
                  <span>
                    {results.processingId}
                  </span>
                </p>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;