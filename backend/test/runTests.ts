import { processImage, validateIndianVehicleNumber } from "../src/services/imageProcessor.js";
import { decodeRTO } from "../src/services/rtoDecoder.js";
import path from "path";
import fs from "fs";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  \x1b[32m✓\x1b[0m ${message}`);
    passedCount++;
  } else {
    console.error(`  \x1b[31m✕\x1b[0m ${message}`);
    failedCount++;
  }
}

async function runTestSuite() {
  console.log("\n========================================================");
  console.log("  FieldSight Automated Test Suite & Benchmark Runner");
  console.log("========================================================\n");

  // -----------------------------------------------------------------
  // 1. MoRTH Indian License Plate Format Validation Tests
  // -----------------------------------------------------------------
  console.log("[SUITE 1] MoRTH Indian License Plate Validator");

  // Valid plates
  assert(validateIndianVehicleNumber("KA02MP9657") === true, "Validates Karnataka private vehicle (KA02MP9657)");
  assert(validateIndianVehicleNumber("MH12NW8556") === true, "Validates Maharashtra commercial vehicle (MH12NW8556)");
  assert(validateIndianVehicleNumber("DL3CCA1234") === true, "Validates Delhi 1-digit district vehicle (DL3CCA1234)");
  assert(validateIndianVehicleNumber("TN05BT5754") === true, "Validates Tamil Nadu commercial vehicle (TN05BT5754)");
  assert(validateIndianVehicleNumber("GJ01XY9999") === true, "Validates Gujarat vehicle (GJ01XY9999)");

  // Invalid / Hallucinated plates
  assert(validateIndianVehicleNumber("AN12HOD") === false, "Rejects UK/European format pattern (AN12HOD)");
  assert(validateIndianVehicleNumber("LA11D1015") === false, "Rejects invalid Ladakh district beyond max (LA11 > 02)");
  assert(validateIndianVehicleNumber("KA00MP1234") === false, "Rejects district 00 (KA00MP1234)");
  assert(validateIndianVehicleNumber("MH12IO1234") === false, "Rejects series containing 'I' or 'O' (MH12IO1234)");
  assert(validateIndianVehicleNumber("RANDOMTEXT") === false, "Rejects random non-plate text");

  // -----------------------------------------------------------------
  // 2. Indian RTO Location & Category Decoding Tests
  // -----------------------------------------------------------------
  console.log("\n[SUITE 2] Indian RTO Location & Category Decoder");

  const rto1 = decodeRTO("MH12NW8556");
  assert(rto1 !== null, "Decoded MH12NW8556 RTO");
  assert(rto1?.stateName === "Maharashtra", `Correct state: ${rto1?.stateName}`);
  assert(rto1?.rtoOffice.includes("Pune"), `Correct RTO office: ${rto1?.rtoOffice}`);
  assert(rto1?.vehicleCategory.includes("Commercial"), `Correct category: ${rto1?.vehicleCategory}`);

  const rto2 = decodeRTO("KA02MP9657");
  assert(rto2 !== null, "Decoded KA02MP9657 RTO");
  assert(rto2?.stateName === "Karnataka", `Correct state: ${rto2?.stateName}`);
  assert(rto2?.rtoOffice.includes("Bangalore West"), `Correct RTO office: ${rto2?.rtoOffice}`);

  const rto3 = decodeRTO("TN05BT5754");
  assert(rto3 !== null, "Decoded TN05BT5754 RTO");
  assert(rto3?.stateName === "Tamil Nadu", `Correct state: ${rto3?.stateName}`);
  assert(rto3?.rtoOffice.includes("Chennai North"), `Correct RTO office: ${rto3?.rtoOffice}`);

  // -----------------------------------------------------------------
  // 3. End-to-End Image Processing Benchmark Tests
  // -----------------------------------------------------------------
  console.log("\n[SUITE 3] End-to-End Image Processing Benchmarks");

  const hondaPath = path.resolve("./uploads/1786543227769-car-ind-number-plate.jpeg");
  if (fs.existsSync(hondaPath)) {
    console.log("\n  Testing Honda City Sedan image...");
    const start1 = Date.now();
    const res1 = await processImage(hondaPath);
    const duration1 = ((Date.now() - start1) / 1000).toFixed(2);

    assert(res1.success === true, `Processing succeeded in ${duration1}s`);
    assert(res1.vehicleNumber === "KA02MP9657", `Correct plate detected: ${res1.vehicleNumber} (expected KA02MP9657)`);
    assert(res1.vehicleNumberValid === true, "Plate marked as valid");
    assert(res1.confidenceScore >= 80, `High confidence score: ${res1.confidenceScore}%`);
    assert(typeof res1.blurScore === "number", `Blur score calculated: ${res1.blurScore}`);
    assert(typeof res1.brightness === "number", `Brightness calculated: ${res1.brightness}`);
    assert(typeof res1.checksum === "string" && res1.checksum.length === 64, `Valid SHA-256 checksum: ${res1.checksum.slice(0, 12)}...`);
  } else {
    console.log("  (Skipping Honda City test - file not in uploads)");
  }

  const autoPath = path.resolve("./uploads/1786527942725-gOGig 1.png");
  if (fs.existsSync(autoPath)) {
    console.log("\n  Testing Pune Auto Rickshaw (Commercial Stacked Plate)...");
    const start2 = Date.now();
    const res2 = await processImage(autoPath);
    const duration2 = ((Date.now() - start2) / 1000).toFixed(2);

    assert(res2.success === true, `Processing succeeded in ${duration2}s`);
    assert(res2.vehicleNumber === "MH12NW8556", `Correct commercial plate detected: ${res2.vehicleNumber} (expected MH12NW8556)`);
    assert(res2.vehicleNumberValid === true, "Commercial plate marked as valid");
    assert(res2.confidenceScore >= 80, `High confidence score: ${res2.confidenceScore}%`);
  } else {
    console.log("  (Skipping Pune Auto test - file not in uploads)");
  }

  // -----------------------------------------------------------------
  // Test Summary
  // -----------------------------------------------------------------
  console.log("\n========================================================");
  console.log(`  Test Results: \x1b[32m${passedCount} Passed\x1b[0m, \x1b[31m${failedCount} Failed\x1b[0m`);
  console.log("========================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test Suite Execution Error:", err);
  process.exit(1);
});
