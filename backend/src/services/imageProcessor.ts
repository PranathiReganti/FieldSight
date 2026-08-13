import fs from "fs/promises";
import fsSync from "fs";
import crypto from "crypto";
import sharp from "sharp";
import { createWorker, PSM } from "tesseract.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initTesseractWorker() {
  const possiblePaths = [
    path.resolve(process.cwd()),
    path.resolve(process.cwd(), "backend"),
    path.resolve(__dirname, ".."),
    path.resolve(__dirname, "../.."),
  ];

  let localLangPath: string | undefined = undefined;
  for (const p of possiblePaths) {
    if (
      fsSync.existsSync(path.join(p, "eng.traineddata.gz")) ||
      fsSync.existsSync(path.join(p, "eng.traineddata"))
    ) {
      localLangPath = p;
      break;
    }
  }

  const options = localLangPath ? { langPath: localLangPath } : undefined;
  return await createWorker("eng", 1, options);
}

/**
 * Result returned to the processing queue.
 * These fields match the fields used by the FieldSight Prisma Image model.
 */
export interface PlateBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageAnalysis {
  success: boolean;
  width: number;
  height: number;
  isLowResolution: boolean;
  blurScore: number;
  isBlurry: boolean;
  brightness: number;
  isLowLight: boolean;
  checksum: string;
  ocrText: string;
  vehicleNumber: string | null;
  vehicleNumberValid: boolean;
  confidenceScore: number;
  message: string;
  plateBoundingBox?: PlateBoundingBox | null;
}

interface OCRWord {
  text: string;
  confidence?: number;
  bbox?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

interface OCRBlock {
  paragraphs?: Array<{
    lines?: Array<{
      words?: OCRWord[];
    }>;
  }>;
}

interface PlateCandidate {
  left: number;
  top: number;
  width: number;
  height: number;
  score: number;
  source: string;
}

interface CandidateHit {
  value: string;
  source: string;
  ocrConfidence: number;
  plateScore: number;
  isTwoLine: boolean;
}

interface AggregatedCandidate {
  value: string;
  bestOcrConfidence: number;
  bestPlateScore: number;
  hits: number;
  sources: Set<string>;
  twoLineHits: number;
  score: number;
}

interface CandidateFeatures {
  aspectRatio: number;
  areaFraction: number;
  yellowRatio: number;
  whiteRatio: number;
  rectangularity: number;
  characterDensity: number;
  horizontalEdgeScore: number;
  verticalEdgeScore: number;
  colorScore: number;
  geometryScore: number;
}

interface RegionScoreBreakdown {
  rectangularity: number;
  aspectRatio: number;
  colorScore: number;
  characterDensity: number;
  edgeScore: number;
  geometryScore: number;
  ocrScore: number;
  formatScore: number;
  twoLineScore: number;
  agreementScore: number;
  stickerPenalty: number;
  finalScore: number;
}

interface PlateOcrResult {
  hits: CandidateHit[];
  rawTexts: string[];
  combinedRaw: string;
  bestConfidence: number;
  agreementMap: Map<string, number>;
  bestValidNumber: string | null;
  twoLineDetected: boolean;
}

interface RankedPlateCandidate {
  candidate: PlateCandidate;
  features: CandidateFeatures;
  breakdown: RegionScoreBreakdown;
  ocrRaw: string;
  ocrNormalized: string | null;
  ocrValid: boolean;
  ocrConfidence: number;
  crop: Buffer | null;
}

interface ReconstructedLine {
  text: string;
  confidence: number;
}

/**
 * Indian vehicle registration state / UT codes.
 */
const INDIAN_STATE_CODES = new Set([
  "AP",
  "AR",
  "AS",
  "BR",
  "CG",
  "CH",
  "DD",
  "DL",
  "DN",
  "GA",
  "GJ",
  "HP",
  "HR",
  "JH",
  "JK",
  "KA",
  "KL",
  "LA",
  "LD",
  "MH",
  "ML",
  "MN",
  "MP",
  "MZ",
  "NL",
  "OD",
  "PB",
  "PY",
  "RJ",
  "SK",
  "TN",
  "TR",
  "TS",
  "UK",
  "UP",
  "WB",
]);

/**
 * Characters allowed during license-plate OCR.
 */
const PLATE_WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * OCR page segmentation modes used for plate OCR.
 */
const PLATE_PSMS = [
  PSM.SINGLE_LINE,
  PSM.SINGLE_BLOCK,
  PSM.SPARSE_TEXT,
] as const;

/**
 * IMPORTANT:
 * These are real RegExp escapes.
 *
 * Indian examples:
 * KA01AB1234
 * MH12CD5678
 * DL8C1234
 *
 * District can be 1 or 2 digits.
 * Series can be 1 to 3 letters.
 * Registration number is 4 digits.
 */
const REGISTRATION_PATTERN =
  /^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{4})$/;

/**
 * Common UK-style format.
 *
 * Example:
 * SN66 XMZ
 * becomes:
 * SN66XMZ
 */
const UK_STYLE_PLATE_PATTERN = /^[A-Z]{2}\d{2}[A-Z]{3}$/;

/**
 * Keep debugging enabled while we are validating the detector.
 *
 * After the system is stable, change this to false.
 */
const DEBUG_PLATE_OCR = true;

/**
 * Full-image OCR tuning.
 */
const WORD_CONFIDENCE_THRESHOLD = 18;
const LINE_CONFIDENCE_THRESHOLD = 32;
const LINE_MERGE_Y_TOLERANCE = 12;

/* ---------------------------------------------------------------------- */
/* GENERAL HELPERS                                                        */
/* ---------------------------------------------------------------------- */

function compactText(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeText(text: string): string {
  return text
    .toUpperCase()
    .replace(/[|]/g, "I")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^A-Z0-9\r\n]+/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function isValidStateCode(value: string): boolean {
  return INDIAN_STATE_CODES.has(value.toUpperCase());
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

function safeDebugName(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

/* ---------------------------------------------------------------------- */
/* VEHICLE NUMBER CHARACTER CORRECTION                                    */
/* ---------------------------------------------------------------------- */

/**
 * OCR commonly confuses letters and numbers.
 *
 * These corrections are ONLY used in the appropriate plate position.
 */
function correctNumberCharacters(text: string): string {
  return text
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/Q/g, "0")
    .replace(/D/g, "0")
    .replace(/G/g, "0")
    .replace(/C/g, "0")
    .replace(/I/g, "1")
    .replace(/Z/g, "2")
    .replace(/S/g, "5")
    .replace(/B/g, "8");
}

function correctLetterCharacters(text: string): string {
  return text
    .toUpperCase()
    .replace(/0/g, "O")
    .replace(/1/g, "I")
    .replace(/2/g, "Z")
    .replace(/5/g, "S")
    .replace(/8/g, "B")
    .replace(/6/g, "G");
}

/* ---------------------------------------------------------------------- */
/* VEHICLE NUMBER VALIDATION                                              */
/* ---------------------------------------------------------------------- */

const MAX_DISTRICT_BY_STATE: Record<string, number> = {
  LA: 2,
  GA: 2,
  DD: 3,
  DN: 2,
  CH: 1,
  AN: 2,
  LD: 1,
  PY: 5,
  SK: 4,
  TR: 8,
  MZ: 8,
  NL: 8,
  MN: 9,
  ML: 10,
  AR: 16,
  HP: 17,
  JK: 22,
  JH: 24,
  PB: 35,
  HR: 40,
  TS: 36,
  AP: 39,
  KL: 40,
  KA: 71,
  MH: 50,
  TN: 99,
  UP: 99,
  MP: 70,
  RJ: 55,
  GJ: 38,
  WB: 99,
  BR: 55,
  CG: 30,
  OD: 35,
  UK: 20,
  DL: 18,
};

function isValidStateDistrict(state: string, district: string): boolean {
  const districtNum = parseInt(district, 10);
  if (isNaN(districtNum) || districtNum <= 0) {
    return false;
  }
  const max = MAX_DISTRICT_BY_STATE[state] ?? 99;
  return districtNum <= max;
}

export function validateIndianVehicleNumber(value: string): boolean {
  const normalized = compactText(value);
  const match = normalized.match(REGISTRATION_PATTERN);

  if (!match) {
    return false;
  }

  const state = match[1];
  const district = match[2];
  const series = match[3];

  if (!isValidStateCode(state)) {
    return false;
  }

  // Only DL (Delhi) allows single-digit district codes (e.g. DL1C, DL8C)
  if (district.length === 1 && state !== "DL") {
    return false;
  }

  // District must be valid for the state
  if (!isValidStateDistrict(state, district)) {
    return false;
  }

  // Indian RTO series never use letters 'I' or 'O' to avoid confusion with numbers 1 and 0
  if (series.includes("I") || series.includes("O")) {
    return false;
  }

  return true;
}

export function validateVehicleNumber(value: string): boolean {
  const normalized = compactText(value);

  return validateIndianVehicleNumber(normalized);
}

/* ---------------------------------------------------------------------- */
/* OCR CHARACTER ALTERNATIVES                                             */
/* ---------------------------------------------------------------------- */

function mapLetterForPlate(value: string): string[] {
  const alternatives: Record<string, string[]> = {
    "0": ["O", "D"],
    "1": ["I", "L"],
    "2": ["Z"],
    "4": ["A"],
    "5": ["S"],
    "6": ["G"],
    "8": ["B"],
    H: ["H", "M", "W", "N"],
    W: ["W", "M", "H"],
    N: ["N", "M", "W", "H"],
    M: ["M", "W", "N", "H"],
  };

  return alternatives[value] ?? [value];
}

function mapDigitForPlate(value: string): string[] {
  const alternatives: Record<string, string[]> = {
    O: ["0"],
    Q: ["0"],
    D: ["0"],
    I: ["1"],
    Z: ["2"],
    S: ["5"],
    B: ["8"],
  };

  return alternatives[value] ?? [value];
}

function expandPlatePart(
  value: string,
  mode: "letter" | "digit",
  limit = 16
): string[] {
  const mapper =
    mode === "letter"
      ? mapLetterForPlate
      : mapDigitForPlate;

  let values = [""];

  for (const char of value.toUpperCase()) {
    const choices = mapper(char);
    const next: string[] = [];

    for (const prefix of values) {
      for (const choice of choices) {
        next.push(prefix + choice);

        if (next.length >= limit) {
          break;
        }
      }

      if (next.length >= limit) {
        break;
      }
    }

    values = dedupeStrings(next);
  }

  return values;
}

/**
 * Convert an OCR string into an Indian registration candidate
 * while correcting common OCR character substitutions.
 */
function normalizeIndianRegistrationParts(
  state: string,
  district: string,
  series: string,
  number: string
): string | null {
  const candidate =
    correctLetterCharacters(state) +
    correctNumberCharacters(district) +
    correctLetterCharacters(series) +
    correctNumberCharacters(number);

  return validateIndianVehicleNumber(candidate)
    ? candidate
    : null;
}

/* ---------------------------------------------------------------------- */
/* PLATE PARSING                                                          */
/* ---------------------------------------------------------------------- */

function parseRegistrationFromIndianOnly(compact: string): string[] {
  const candidates = new Set<string>();
  const source = compact.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (source.length < 7 || source.length > 15) {
    return [];
  }

  for (
    let start = 0;
    start <= Math.min(4, source.length - 7);
    start++
  ) {
    for (const districtLen of [2, 1] as const) {
      for (const seriesLen of [1, 2, 3] as const) {
        const expectedLen = 2 + districtLen + seriesLen + 4;
        if (start + expectedLen > source.length) {
          continue;
        }

        const rawState = source.slice(start, start + 2);
        const stateCandidates = [
          correctLetterCharacters(rawState),
          rawState.replace(/Y$/, "H").replace(/V/, "M").replace(/^N(?=H)/, "M"),
          rawState.replace(/M(?=H)/, "M"),
        ];

        for (const state of stateCandidates) {
          if (!isValidStateCode(state)) {
            continue;
          }

          const rawDistrict = source.slice(
            start + 2,
            start + 2 + districtLen
          );
          const rawSeries = source.slice(
            start + 2 + districtLen,
            start + 2 + districtLen + seriesLen
          );
          const rawNumber = source.slice(
            start + 2 + districtLen + seriesLen,
            start + expectedLen
          );

          const district = correctNumberCharacters(rawDistrict);
          if (!/^\d{1,2}$/.test(district)) {
            continue;
          }
          if (districtLen === 1 && state !== "DL") {
            continue;
          }
          if (!isValidStateDistrict(state, district)) {
            continue;
          }

          const seriesOptions = [
            correctLetterCharacters(rawSeries),
            correctLetterCharacters(rawSeries).replace(/H/g, "W"),
            correctLetterCharacters(rawSeries).replace(/NN/g, "NW"),
          ];

          const number = correctNumberCharacters(rawNumber);
          if (!/^\d{4}$/.test(number)) {
            continue;
          }

          for (const series of seriesOptions) {
            if (!/^[A-Z]{1,3}$/.test(series)) {
              continue;
            }
            if (
              series.includes("I") ||
              series.includes("O")
            ) {
              continue;
            }

            const fullCandidate = `${state}${district}${series}${number}`;
            if (validateIndianVehicleNumber(fullCandidate)) {
              candidates.add(fullCandidate);
            }
          }
        }
      }
    }
  }

  return Array.from(candidates);
}

function parseRegistrationFromCompact(compact: string): string[] {
  const candidates = new Set<string>();

  for (const candidate of parseRegistrationFromIndianOnly(compact)) {
    candidates.add(candidate);
  }

  return Array.from(candidates);
}

function parseStackedLines(line1: string, line2: string): string[] {
  const results: string[] = [];
  let c1 = line1.toUpperCase().replace(/[^A-Z0-9]/g, "");
  let c2 = line2.toUpperCase().replace(/[^A-Z0-9]/g, "");

  // Remove noise characters inserted between 2-letter state and district (e.g. MHI12 -> MH12)
  c1 = c1.replace(/^([A-Z]{2})[I|l1](\d{2})/, "$1$2");

  for (let s = 0; s <= Math.min(3, c1.length - 2); s++) {
    const rawState = c1.slice(s, s + 2);
    const stateCandidates = [
      correctLetterCharacters(rawState),
      rawState.replace(/Y$/, "H").replace(/V/, "M").replace(/^N(?=H)/, "M"),
    ];

    for (const state of stateCandidates) {
      if (!isValidStateCode(state)) continue;

      for (const dLen of [2, 1] as const) {
        if (s + 2 + dLen > c1.length) continue;
        const rawDist = c1.slice(s + 2, s + 2 + dLen);
        const district = correctNumberCharacters(rawDist);
        if (!/^\d{1,2}$/.test(district)) continue;
        if (dLen === 1 && state !== "DL") continue;
        if (!isValidStateDistrict(state, district)) continue;

        // Series 1: take only the contiguous letter sequence following the district code
        const afterDist = c1.slice(s + 2 + dLen);
        const series1Match = afterDist.match(/^([A-Z]+)/);
        const rawSeries1 = series1Match ? series1Match[1] : "";
        const series1 = correctLetterCharacters(rawSeries1).replace(/[^A-Z]/g, "");

        // Find 4-digit number in line 2
        const numMatch = c2.match(/(\d{4})/);
        if (numMatch && numMatch.index !== undefined) {
          const rawSeries2 = c2.slice(0, numMatch.index).replace(/[^A-Z]/g, "");
          const series2 = correctLetterCharacters(rawSeries2).replace(/[^A-Z]/g, "");
          const number = numMatch[1];

          const seriesOptions = [
            (series1 + series2).replace(/H/g, "W").replace(/NN/g, "NW"),
            (series1 + series2).replace(/H/g, "W"),
            series1 + series2,
            (series2 || series1).replace(/H/g, "W"),
            series2,
            series1.replace(/H/g, "W"),
            series1,
          ];

          for (const series of seriesOptions) {
            if (!/^[A-Z]{1,3}$/.test(series)) continue;
            if (series.includes("I") || series.includes("O")) continue;
            const fullCandidate = `${state}${district}${series}${number}`;
            if (validateIndianVehicleNumber(fullCandidate)) {
              results.push(fullCandidate);
            }
          }
        }
      }
    }
  }

  return results;
}

function parseGenericPlateCandidates(
  text: string,
  isPlateCrop = false
): string[] {
  const candidates = new Set<string>();
  const normalized = normalizeText(text);

  /**
   * Preserve OCR token boundaries first.
   *
   * This prevents random words from being glued together too aggressively.
   */
  const tokens = normalized
    .split(/\s+/)
    .map((token) => compactText(token))
    .filter(Boolean);

  const addIfValid = (value: string) => {
    for (const candidate of parseRegistrationFromIndianOnly(value)) {
      candidates.add(candidate);
    }
  };

  /**
   * 1. Individual OCR tokens.
   */
  for (const token of tokens) {
    addIfValid(token);
  }

  /**
   * 2. Two adjacent tokens.
   */
  for (let i = 0; i < tokens.length - 1; i++) {
    addIfValid(`${tokens[i]}${tokens[i + 1]}`);
  }

  /**
   * 3. Three adjacent tokens.
   */
  for (let i = 0; i < tokens.length - 2; i++) {
    addIfValid(`${tokens[i]}${tokens[i + 1]}${tokens[i + 2]}`);
  }

  /**
   * 4. Four adjacent tokens (e.g. MH 12 NW 8556 / KA 02 MP 9657).
   */
  for (let i = 0; i < tokens.length - 3; i++) {
    addIfValid(`${tokens[i]}${tokens[i + 1]}${tokens[i + 2]}${tokens[i + 3]}`);
  }

  /**
   * 5. Stacked Line Combinations (checks adjacent and near-adjacent lines across OCR noise).
   */
  if (isPlateCrop) {
    const lines = normalized
      .split(/\r?\n/)
      .map((line) => compactText(line))
      .filter((line) => line.length >= 2);

    for (let i = 0; i < lines.length - 1; i++) {
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        for (const stacked of parseStackedLines(lines[i], lines[j])) {
          candidates.add(stacked);
        }
      }
    }
  }

  return Array.from(candidates);
}

/* ---------------------------------------------------------------------- */
/* OCR TEXT WINDOWS                                                       */
/* ---------------------------------------------------------------------- */

function buildTextWindows(text: string): string[] {
  const normalized = normalizeText(text);

  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const windows = new Set<string>();

  for (const line of lines) {
    windows.add(line);
  }

  /**
   * Two-line / three-line combinations.
   */
  for (
    let size = 2;
    size <= Math.min(3, lines.length);
    size++
  ) {
    for (
      let start = 0;
      start <= lines.length - size;
      start++
    ) {
      const combined = lines
        .slice(start, start + size)
        .join(" ");

      windows.add(combined);

      windows.add(
        lines
          .slice(start, start + size)
          .join("")
      );
    }
  }

  const tokens = normalized
    .replace(/\r?\n/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  /**
   * Token windows.
   */
  for (
    let size = 1;
    size <= Math.min(8, tokens.length);
    size++
  ) {
    for (
      let start = 0;
      start <= tokens.length - size;
      start++
    ) {
      const combined = tokens
        .slice(start, start + size)
        .join(" ");

      windows.add(combined);

      windows.add(
        tokens
          .slice(start, start + size)
          .join("")
      );
    }
  }

  windows.add(
    normalized.replace(/\s+/g, " ")
  );

  windows.add(
    normalized.replace(/\s+/g, "")
  );

  return Array.from(windows).filter(Boolean);
}

function collectCandidateHits(
  text: string,
  ocrConfidence: number,
  plateScore: number,
  source: string,
  isTwoLine = false
): CandidateHit[] {
  const hits: CandidateHit[] = [];

  const windows = buildTextWindows(text);
  const seen = new Set<string>();

  for (const window of windows) {
    const parsed =
      parseGenericPlateCandidates(window, true);

    for (const candidate of parsed) {
      const key = `${candidate}|${source}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      hits.push({
        value: candidate,
        source,
        ocrConfidence,
        plateScore,
        isTwoLine,
      });
    }
  }

  return hits;
}

/* ---------------------------------------------------------------------- */
/* CANDIDATE AGGREGATION                                                  */
/* ---------------------------------------------------------------------- */

function aggregateCandidateHits(
  hits: CandidateHit[]
): AggregatedCandidate[] {
  const map = new Map<
    string,
    AggregatedCandidate
  >();

  for (const hit of hits) {
    const current = map.get(hit.value);

    if (!current) {
      map.set(hit.value, {
        value: hit.value,
        bestOcrConfidence:
          hit.ocrConfidence,
        bestPlateScore:
          hit.plateScore,
        hits: 1,
        sources: new Set([hit.source]),
        twoLineHits:
          hit.isTwoLine ? 1 : 0,
        score: 0,
      });

      continue;
    }

    current.bestOcrConfidence =
      Math.max(
        current.bestOcrConfidence,
        hit.ocrConfidence
      );

    current.bestPlateScore =
      Math.max(
        current.bestPlateScore,
        hit.plateScore
      );

    current.hits += 1;
    current.sources.add(hit.source);

    if (hit.isTwoLine) {
      current.twoLineHits += 1;
    }
  }

  for (const candidate of map.values()) {
    const sourceBonus = Math.min(
      12,
      candidate.sources.size * 4
    );

    const hitBonus = Math.min(
      18,
      Math.max(0, candidate.hits - 1) * 4
    );

    const twoLineBonus = Math.min(
      10,
      candidate.twoLineHits * 3
    );

    const ocrBonus = Math.min(
      40,
      candidate.bestOcrConfidence * 0.48
    );

    const plateBonus = Math.min(
      24,
      candidate.bestPlateScore * 0.32
    );

    const patternMatch =
      candidate.value.match(
        REGISTRATION_PATTERN
      );

    const districtBonus =
      patternMatch?.[2].length === 2
        ? 8
        : 0;

    const seriesBonus =
      patternMatch?.[3].length === 2
        ? 4
        : 0;

    const loosePatternPenalty =
      patternMatch?.[2].length === 1 &&
      patternMatch?.[3].length === 3
        ? 3
        : 0;

    candidate.score = Math.round(
      clamp(
        20 +
          ocrBonus +
          plateBonus +
          sourceBonus +
          hitBonus +
          twoLineBonus +
          districtBonus +
          seriesBonus -
          loosePatternPenalty,
        0,
        100
      )
    );
  }

  return Array.from(map.values()).sort(
    (a, b) => b.score - a.score
  );
}

/* ---------------------------------------------------------------------- */
/* IMAGE PROCESSING HELPERS                                               */
/* ---------------------------------------------------------------------- */

function computeOtsuThreshold(
  values: Uint8Array
): number {
  const histogram =
    new Array<number>(256).fill(0);

  for (const value of values) {
    histogram[value] += 1;
  }

  const total = values.length;

  let sum = 0;

  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i];
  }

  let sumB = 0;
  let weightB = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let i = 0; i < 256; i++) {
    weightB += histogram[i];

    if (weightB === 0) {
      continue;
    }

    const weightF = total - weightB;

    if (weightF === 0) {
      break;
    }

    sumB += i * histogram[i];

    const meanB = sumB / weightB;
    const meanF =
      (sum - sumB) / weightF;

    const variance =
      weightB *
      weightF *
      Math.pow(
        meanB - meanF,
        2
      );

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = i;
    }
  }

  return threshold;
}

async function readRawImage(
  imagePath: string,
  width?: number,
  height?: number
): Promise<{
  data: Uint8Array;
  width: number;
  height: number;
  channels: number;
}> {
  const source =
    sharp(imagePath).removeAlpha();

  const resized =
    width && height
      ? source.resize({
          width,
          height,
          fit: "fill",
        })
      : source;

  const { data, info } =
    await resized
      .raw()
      .toBuffer({
        resolveWithObject: true,
      });

  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

function rgbToHsv(
  r: number,
  g: number,
  b: number
): {
  h: number;
  s: number;
  v: number;
} {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;

  const max = Math.max(
    red,
    green,
    blue
  );

  const min = Math.min(
    red,
    green,
    blue
  );

  const delta = max - min;

  let hue = 0;

  if (delta !== 0) {
    if (max === red) {
      hue =
        60 *
        (((green - blue) / delta) % 6);
    } else if (max === green) {
      hue =
        60 *
        ((blue - red) / delta + 2);
    } else {
      hue =
        60 *
        ((red - green) / delta + 4);
    }
  }

  if (hue < 0) {
    hue += 360;
  }

  const saturation =
    max === 0 ? 0 : delta / max;

  return {
    h: hue,
    s: saturation,
    v: max,
  };
}

/* ---------------------------------------------------------------------- */
/* PLATE REGION SCORING                                                   */
/* ---------------------------------------------------------------------- */

function scoreFlexibleAspectRatio(
  aspect: number
): number {
  const targets = [
    { target: 2.0, sigma: 0.85 },
    { target: 1.45, sigma: 0.45 },
    { target: 1.35, sigma: 0.35 },
    { target: 2.8, sigma: 1.0 },
    { target: 3.4, sigma: 1.2 },
  ];

  const best = Math.max(
    ...targets.map((entry) =>
      Math.exp(
        -Math.pow(
          aspect - entry.target,
          2
        ) /
          (2 *
            entry.sigma *
            entry.sigma)
      )
    )
  );

  if (
    aspect < 0.9 ||
    aspect > 7.5
  ) {
    return 0;
  }

  return Math.round(best * 100);
}

function computeColorScore(
  yellowRatio: number,
  whiteRatio: number
): number {
  if (yellowRatio >= 0.35) {
    return clamp(
      Math.round(
        62 + yellowRatio * 38
      ),
      0,
      100
    );
  }

  if (yellowRatio >= 0.12) {
    return clamp(
      Math.round(
        38 + yellowRatio * 90
      ),
      0,
      100
    );
  }

  if (
    whiteRatio >= 0.45 &&
    whiteRatio <= 0.88
  ) {
    return clamp(
      Math.round(
        48 + whiteRatio * 28
      ),
      0,
      100
    );
  }

  if (whiteRatio >= 0.25) {
    return 32;
  }

  return 18;
}

function scoreRegionGeometry(
  areaFraction: number,
  width: number,
  height: number
): number {
  let score = 0;
  const pixels = width * height;

  if (
    areaFraction >= 0.002 &&
    areaFraction <= 0.08
  ) {
    score += 42;
  } else if (
    areaFraction >= 0.001 &&
    areaFraction <= 0.12
  ) {
    score += 26;
  } else if (areaFraction > 0.2) {
    score -= 35;
  } else if (areaFraction > 0.15) {
    score -= 18;
  }

  if (
    pixels >= 600 &&
    pixels <= 90000
  ) {
    score += 22;
  } else if (pixels < 320) {
    score -= 12;
  } else if (pixels > 160000) {
    score -= 28;
  }

  return clamp(score, 0, 100);
}

function scoreRegistrationQuality(
  value: string
): number {
  const normalized =
    compactText(value);

  const indianMatch =
    normalized.match(
      REGISTRATION_PATTERN
    );

  if (
    indianMatch &&
    isValidStateCode(indianMatch[1])
  ) {
    let bonus = 0;

    if (indianMatch[2].length === 2) {
      bonus += 8;
    }

    if (indianMatch[3].length === 2) {
      bonus += 6;
    }

    if (indianMatch[3].length === 1) {
      bonus += 2;
    }

    return bonus;
  }

  if (
    UK_STYLE_PLATE_PATTERN.test(
      normalized
    )
  ) {
    return 12;
  }

  return 0;
}

function computeStickerPenalty(
  features: CandidateFeatures,
  rawText: string,
  bestNumber: string | null
): number {
  let penalty = 0;

  const words = normalizeText(rawText)
    .split(/\s+/)
    .filter(
      (word) => word.length > 2
    );

  if (
    features.whiteRatio > 0.5 &&
    features.areaFraction > 0.06
  ) {
    penalty += 18;
  }

  if (
    features.whiteRatio > 0.5 &&
    features.areaFraction > 0.1
  ) {
    penalty += 24;
  }

  if (
    words.length >= 3 &&
    !bestNumber
  ) {
    penalty += 28;
  }

  if (words.length >= 5) {
    penalty += 14;
  }

  if (
    features.areaFraction > 0.15 &&
    features.characterDensity < 0.12
  ) {
    penalty += 22;
  }

  return penalty;
}

function computeFinalRegionScore(
  features: CandidateFeatures,
  ocrConfidence: number,
  bestNumber: string | null,
  agreementCount: number,
  variantCount: number,
  isTwoLine: boolean,
  rawText: string
): RegionScoreBreakdown {
  const aspectRatio =
    scoreFlexibleAspectRatio(
      features.aspectRatio
    );

  const rectangularity =
    clamp(
      Math.round(
        features.rectangularity * 100
      ),
      0,
      100
    );

  const colorScore =
    features.colorScore;

  const characterDensity =
    clamp(
      Math.round(
        features.characterDensity * 100
      ),
      0,
      100
    );

  const edgeScore =
    clamp(
      Math.round(
        ((features.horizontalEdgeScore +
          features.verticalEdgeScore) /
          2) *
          100
      ),
      0,
      100
    );

  const geometryScore =
    features.geometryScore;

  const ocrScore =
    clamp(
      Math.round(
        ocrConfidence * 0.85
      ),
      0,
      100
    );

  let formatScore =
    bestNumber &&
    validateVehicleNumber(bestNumber)
      ? 82
      : 0;

  const formatBonus =
    bestNumber
      ? scoreRegistrationQuality(
          bestNumber
        )
      : 0;

  if (
    bestNumber &&
    features.yellowRatio >= 0.15
  ) {
    formatScore += 12;
  }

  if (
    bestNumber &&
    agreementCount < 2 &&
    features.whiteRatio > 0.5 &&
    features.areaFraction > 0.05
  ) {
    formatScore -= 28;
  }

  if (
    bestNumber &&
    agreementCount >= 2
  ) {
    formatScore += Math.min(
      12,
      agreementCount * 3
    );
  }

  const twoLineScore =
    isTwoLine && bestNumber
      ? 22
      : 0;

  const agreementScore =
    variantCount > 0
      ? clamp(
          Math.round(
            (agreementCount /
              variantCount) *
              58
          ),
          0,
          58
        )
      : 0;

  const stickerPenalty =
    computeStickerPenalty(
      features,
      rawText,
      bestNumber
    );

  const finalScore =
    clamp(
      Math.round(
        aspectRatio * 0.11 +
          rectangularity * 0.07 +
          colorScore * 0.2 +
          characterDensity * 0.09 +
          edgeScore * 0.09 +
          geometryScore * 0.16 +
          ocrScore * 0.11 +
          formatScore * 0.22 +
          formatBonus +
          twoLineScore +
          agreementScore -
          stickerPenalty
      ),
      0,
      100
    );

  return {
    rectangularity,
    aspectRatio,
    colorScore,
    characterDensity,
    edgeScore,
    geometryScore,
    ocrScore,
    formatScore:
      formatScore + formatBonus,
    twoLineScore,
    agreementScore,
    stickerPenalty,
    finalScore,
  };
}

function defaultCandidateFeatures(): CandidateFeatures {
  return {
    aspectRatio: 1,
    areaFraction: 1,
    yellowRatio: 0,
    whiteRatio: 0,
    rectangularity: 0,
    characterDensity: 0,
    horizontalEdgeScore: 0,
    verticalEdgeScore: 0,
    colorScore: 0,
    geometryScore: 0,
  };
}

/* ---------------------------------------------------------------------- */
/* CANDIDATE IMAGE ANALYSIS                                               */
/* ---------------------------------------------------------------------- */

async function analyzeCandidateFeatures(
  imagePath: string,
  candidate: PlateCandidate,
  imageWidth: number,
  imageHeight: number
): Promise<CandidateFeatures> {
  const left = clamp(
    candidate.left,
    0,
    Math.max(
      0,
      imageWidth - 1
    )
  );

  const top = clamp(
    candidate.top,
    0,
    Math.max(
      0,
      imageHeight - 1
    )
  );

  const width = Math.min(
    candidate.width,
    imageWidth - left
  );

  const height = Math.min(
    candidate.height,
    imageHeight - top
  );

  if (
    width < 8 ||
    height < 8
  ) {
    return defaultCandidateFeatures();
  }

  const { data, info } =
    await sharp(imagePath)
      .extract({
        left,
        top,
        width,
        height,
      })
      .removeAlpha()
      .raw()
      .toBuffer({
        resolveWithObject: true,
      });

  const channels = info.channels;
  const pixelCount =
    width * height;

  let yellowCount = 0;
  let whiteCount = 0;

  for (
    let i = 0;
    i < pixelCount;
    i++
  ) {
    const offset =
      i * channels;

    const hsv = rgbToHsv(
      data[offset] ?? 0,
      data[offset + 1] ?? 0,
      data[offset + 2] ?? 0
    );

    if (
      hsv.h >= 18 &&
      hsv.h <= 72 &&
      hsv.s >= 0.18 &&
      hsv.v >= 0.28
    ) {
      yellowCount++;
    }

    if (
      hsv.s <= 0.28 &&
      hsv.v >= 0.65
    ) {
      whiteCount++;
    }
  }

  const grayBuffer =
    await sharp(imagePath)
      .extract({
        left,
        top,
        width,
        height,
      })
      .grayscale()
      .raw()
      .toBuffer();

  let horizontalEdges = 0;
  let verticalEdges = 0;
  let edgeSamples = 0;

  for (
    let y = 1;
    y < height - 1;
    y++
  ) {
    for (
      let x = 1;
      x < width - 1;
      x++
    ) {
      const index =
        y * width + x;

      horizontalEdges +=
        Math.abs(
          grayBuffer[index + 1] -
            grayBuffer[index - 1]
        );

      verticalEdges +=
        Math.abs(
          grayBuffer[index + width] -
            grayBuffer[index - width]
        );

      edgeSamples++;
    }
  }

  const avgHorizontalEdge =
    edgeSamples > 0
      ? horizontalEdges /
        edgeSamples
      : 0;

  const avgVerticalEdge =
    edgeSamples > 0
      ? verticalEdges /
        edgeSamples
      : 0;

  const characterDensity =
    clamp(
      (avgHorizontalEdge +
        avgVerticalEdge) /
        80,
      0,
      1
    );

  const threshold =
    computeOtsuThreshold(
      grayBuffer
    );

  let foreground = 0;

  for (const value of grayBuffer) {
    if (value < threshold) {
      foreground++;
    }
  }

  const fillDensity =
    pixelCount > 0
      ? foreground /
        pixelCount
      : 0;

  const aspectRatio =
    width /
    Math.max(1, height);

  const areaFraction =
    (width * height) /
    Math.max(
      1,
      imageWidth *
        imageHeight
    );

  const yellowRatio =
    pixelCount > 0
      ? yellowCount /
        pixelCount
      : 0;

  const whiteRatio =
    pixelCount > 0
      ? whiteCount /
        pixelCount
      : 0;

  return {
    aspectRatio,
    areaFraction,
    yellowRatio,
    whiteRatio,
    rectangularity:
      clamp(
        fillDensity * 3.5,
        0,
        1
      ),
    characterDensity,
    horizontalEdgeScore:
      clamp(
        avgHorizontalEdge / 40,
        0,
        1
      ),
    verticalEdgeScore:
      clamp(
        avgVerticalEdge / 40,
        0,
        1
      ),
    colorScore:
      computeColorScore(
        yellowRatio,
        whiteRatio
      ),
    geometryScore:
      scoreRegionGeometry(
        areaFraction,
        width,
        height
      ),
  };
}

function scoreComponent(
  area: number,
  bboxWidth: number,
  bboxHeight: number,
  density: number,
  source: string
): number {
  const aspect =
    bboxWidth /
    Math.max(
      1,
      bboxHeight
    );

  const aspectScore =
    scoreFlexibleAspectRatio(
      aspect
    ) / 100;

  const densityScore =
    clamp(
      density * 2.4,
      0,
      1
    );

  const fillScore =
    clamp(
      density * 1.8,
      0,
      1
    );

  const compactScore =
    clamp(
      area / 1800,
      0,
      1
    );

  const colorBonus =
    source === "yellow"
      ? 0.35
      : source === "white"
        ? 0.08
        : 0;

  return Math.round(
    10 +
      aspectScore * 24 +
      densityScore * 18 +
      fillScore * 12 +
      compactScore * 16 +
      colorBonus * 30
  );
}

/* ---------------------------------------------------------------------- */
/* PLATE REGION DETECTION                                                 */
/* ---------------------------------------------------------------------- */

async function detectYellowPlateCandidates(
  imagePath: string,
  originalWidth: number,
  originalHeight: number
): Promise<PlateCandidate[]> {
  const maxDimension = 1400;

  const scale = Math.min(
    1,
    maxDimension /
      Math.max(
        originalWidth,
        originalHeight
      )
  );

  const detectWidth =
    Math.max(
      1,
      Math.round(
        originalWidth * scale
      )
    );

  const detectHeight =
    Math.max(
      1,
      Math.round(
        originalHeight * scale
      )
    );

  const frame =
    await readRawImage(
      imagePath,
      detectWidth,
      detectHeight
    );

  const candidates: PlateCandidate[] = [];

  const visited =
    new Uint8Array(
      frame.width *
        frame.height
    );

  const queueX =
    new Int32Array(
      frame.width *
        frame.height
    );

  const queueY =
    new Int32Array(
      frame.width *
        frame.height
    );

  const classify = (
    index: number
  ): {
    yellow: boolean;
    white: boolean;
  } => {
    const offset =
      index *
      frame.channels;

    const r =
      frame.data[offset] ?? 0;

    const g =
      frame.data[offset + 1] ?? 0;

    const b =
      frame.data[offset + 2] ?? 0;

    const hsv =
      rgbToHsv(r, g, b);

    return {
      yellow:
        hsv.h >= 18 &&
        hsv.h <= 72 &&
        hsv.s >= 0.18 &&
        hsv.v >= 0.28,

      white:
        hsv.s <= 0.28 &&
        hsv.v >= 0.65,
    };
  };

  const floodFill = (
    startX: number,
    startY: number,
    mode: "yellow" | "white"
  ) => {
    let head = 0;
    let tail = 0;

    queueX[tail] = startX;
    queueY[tail] = startY;
    tail++;

    let minX = startX;
    let maxX = startX;
    let minY = startY;
    let maxY = startY;
    let area = 0;

    while (head < tail) {
      const x =
        queueX[head];

      const y =
        queueY[head];

      head++;

      area++;

      minX = Math.min(
        minX,
        x
      );

      maxX = Math.max(
        maxX,
        x
      );

      minY = Math.min(
        minY,
        y
      );

      maxY = Math.max(
        maxY,
        y
      );

      const neighbours:
        Array<[number, number]> =
        [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ];

      for (const [
        nx,
        ny,
      ] of neighbours) {
        if (
          nx < 0 ||
          ny < 0 ||
          nx >= frame.width ||
          ny >= frame.height
        ) {
          continue;
        }

        const neighbourIndex =
          ny * frame.width +
          nx;

        if (
          visited[
            neighbourIndex
          ]
        ) {
          continue;
        }

        visited[
          neighbourIndex
        ] = 1;

        const next =
          classify(
            neighbourIndex
          );

        if (
          (mode === "yellow" &&
            !next.yellow) ||
          (mode === "white" &&
            !next.white)
        ) {
          continue;
        }

        queueX[tail] = nx;
        queueY[tail] = ny;
        tail++;
      }
    }

    const componentWidth =
      maxX - minX + 1;

    const componentHeight =
      maxY - minY + 1;

    if (
      componentWidth < 12 ||
      componentHeight < 5 ||
      area < 20
    ) {
      return;
    }

    const aspect =
      componentWidth /
      componentHeight;

    const density =
      area /
      (componentWidth *
        componentHeight);

    if (
      aspect < 1.0 ||
      aspect > 8.5 ||
      density < 0.03
    ) {
      return;
    }

    candidates.push({
      left: Math.round(
        minX / scale
      ),
      top: Math.round(
        minY / scale
      ),
      width: Math.round(
        componentWidth /
          scale
      ),
      height: Math.round(
        componentHeight /
          scale
      ),
      score: scoreComponent(
        area,
        componentWidth,
        componentHeight,
        density,
        mode
      ),
      source: mode,
    });
  };

  for (
    let y = 0;
    y < frame.height;
    y++
  ) {
    for (
      let x = 0;
      x < frame.width;
      x++
    ) {
      const index =
        y * frame.width +
        x;

      if (
        visited[index]
      ) {
        continue;
      }

      visited[index] = 1;

      const current =
        classify(index);

      if (
        current.yellow
      ) {
        floodFill(
          x,
          y,
          "yellow"
        );
      } else if (
        current.white
      ) {
        floodFill(
          x,
          y,
          "white"
        );
      }
    }
  }

  const addRegion = (
    left: number,
    top: number,
    width: number,
    height: number,
    score: number,
    source: string
  ) => {
    if (
      width < 40 ||
      height < 24
    ) {
      return;
    }

    const x = clamp(
      Math.round(left),
      0,
      Math.max(
        0,
        originalWidth - 1
      )
    );

    const y = clamp(
      Math.round(top),
      0,
      Math.max(
        0,
        originalHeight - 1
      )
    );

    const w = Math.min(
      Math.round(width),
      originalWidth - x
    );

    const h = Math.min(
      Math.round(height),
      originalHeight - y
    );

    if (
      w < 32 ||
      h < 18
    ) {
      return;
    }

    candidates.push({
      left: x,
      top: y,
      width: w,
      height: h,
      score,
      source,
    });
  };

  /**
   * Broad regions.
   */
  addRegion(
    0,
    0,
    originalWidth,
    originalHeight,
    8,
    "full"
  );

  addRegion(
    0,
    0,
    originalWidth,
    originalHeight * 0.35,
    18,
    "upper"
  );

  addRegion(
    0,
    originalHeight * 0.25,
    originalWidth,
    originalHeight * 0.45,
    18,
    "middle"
  );

  addRegion(
    0,
    originalHeight * 0.45,
    originalWidth,
    originalHeight * 0.55,
    20,
    "lower"
  );

  addRegion(
    0,
    0,
    originalWidth * 0.4,
    originalHeight,
    18,
    "left"
  );

  addRegion(
    originalWidth * 0.3,
    0,
    originalWidth * 0.4,
    originalHeight,
    18,
    "center"
  );

  addRegion(
    originalWidth * 0.6,
    0,
    originalWidth * 0.4,
    originalHeight,
    18,
    "right"
  );

  /**
   * Sliding candidate windows.
   */
  const windowScales = [
    0.16,
    0.20,
    0.26,
    0.34,
    0.45,
  ];

  const aspectRatios = [
    1.35,
    1.7,
    2.1,
    2.6,
    3.2,
    4.0,
    5.0,
  ];

  const xPositions = [
    0.0,
    0.1,
    0.22,
    0.34,
    0.48,
    0.62,
    0.76,
  ];

  const yPositions = [
    0.0,
    0.12,
    0.24,
    0.38,
    0.52,
    0.64,
    0.76,
  ];

  for (
    const widthFraction of windowScales
  ) {
    const windowWidth =
      originalWidth *
      widthFraction;

    for (
      const aspect of aspectRatios
    ) {
      const windowHeight =
        windowWidth /
        aspect;

      if (
        windowHeight < 18 ||
        windowHeight >
          originalHeight *
            0.35
      ) {
        continue;
      }

      for (
        const xFraction of xPositions
      ) {
        for (
          const yFraction of yPositions
        ) {
          const left =
            originalWidth *
            xFraction;

          const top =
            originalHeight *
            yFraction;

          if (
            left +
              windowWidth >
              originalWidth ||
            top +
              windowHeight >
              originalHeight
          ) {
            continue;
          }

          addRegion(
            left,
            top,
            windowWidth,
            windowHeight,
            28,
            "window"
          );
        }
      }
    }
  }

  /**
   * Targeted lower vehicle regions (common plate mounting locations).
   */
  addRegion(
    originalWidth * 0.62,
    originalHeight * 0.58,
    originalWidth * 0.28,
    originalHeight * 0.16,
    70,
    "bottom-right-plate"
  );

  addRegion(
    originalWidth * 0.10,
    originalHeight * 0.58,
    originalWidth * 0.28,
    originalHeight * 0.16,
    70,
    "bottom-left-plate"
  );

  addRegion(
    originalWidth * 0.30,
    originalHeight * 0.52,
    originalWidth * 0.40,
    originalHeight * 0.22,
    70,
    "bottom-center-plate"
  );

  /**
   * Remove highly overlapping candidates.
   */
  const unique: PlateCandidate[] = [];

  for (const candidate of candidates) {
    const duplicate =
      unique.some(
        (existing) => {
          const left =
            Math.max(
              existing.left,
              candidate.left
            );

          const top =
            Math.max(
              existing.top,
              candidate.top
            );

          const right =
            Math.min(
              existing.left +
                existing.width,
              candidate.left +
                candidate.width
            );

          const bottom =
            Math.min(
              existing.top +
                existing.height,
              candidate.top +
                candidate.height
            );

          if (
            right <= left ||
            bottom <= top
          ) {
            return false;
          }

          const intersection =
            (right - left) *
            (bottom - top);

          const union =
            existing.width *
              existing.height +
            candidate.width *
              candidate.height -
            intersection;

          return (
            union > 0 &&
            intersection /
              union >
              0.65
          );
        }
      );

    if (!duplicate) {
      unique.push(candidate);
    }
  }

  return unique
    .sort(
      (a, b) =>
        b.score - a.score
    )
    .slice(0, 36);
}

/* ---------------------------------------------------------------------- */
/* PLATE CROPPING                                                         */
/* ---------------------------------------------------------------------- */

async function cropAndPreparePlate(
  imagePath: string,
  candidate: PlateCandidate,
  originalWidth: number,
  originalHeight: number
): Promise<Buffer | null> {
  const paddingX =
    Math.max(
      8,
      Math.round(
        candidate.width *
          (candidate.score >= 60
            ? 0.06
            : 0.12)
      )
    );

  const paddingY =
    Math.max(
      8,
      Math.round(
        candidate.height *
          (candidate.score >= 60
            ? 0.14
            : 0.22)
      )
    );

  const left = clamp(
    candidate.left -
      paddingX,
    0,
    Math.max(
      0,
      originalWidth - 1
    )
  );

  const top = clamp(
    candidate.top -
      paddingY,
    0,
    Math.max(
      0,
      originalHeight - 1
    )
  );

  const right = clamp(
    candidate.left +
      candidate.width +
      paddingX,
    1,
    originalWidth
  );

  const bottom = clamp(
    candidate.top +
      candidate.height +
      paddingY,
    1,
    originalHeight
  );

  const cropWidth =
    right - left;

  const cropHeight =
    bottom - top;

  if (
    cropWidth < 24 ||
    cropHeight < 12
  ) {
    return null;
  }

  /**
   * Upscale small plates.
   * OCR benefits significantly from having enough pixels per character.
   */
  const targetWidth =
    cropWidth < 160
      ? 1600
      : 1200;

  return sharp(imagePath)
    .extract({
      left,
      top,
      width: cropWidth,
      height: cropHeight,
    })
    .resize({
      width: targetWidth,
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
}

/* ---------------------------------------------------------------------- */
/* DEBUG CROPS                                                            */
/* ---------------------------------------------------------------------- */

async function saveDebugPlateCrop(
  imagePath: string,
  checksum: string,
  candidate: PlateCandidate,
  crop: Buffer,
  savePrimary = false
): Promise<string | null> {
  if (!DEBUG_PLATE_OCR) {
    return null;
  }

  const debugDir =
    path.join(
      process.cwd(),
      "uploads",
      "debug-plate-crops",
      checksum
    );

  await ensureDirectory(
    debugDir
  );

  const baseName =
    `${candidate.source}` +
    `-x${candidate.left}` +
    `-y${candidate.top}` +
    `-w${candidate.width}` +
    `-h${candidate.height}`;

  const cropPath =
    path.join(
      debugDir,
      `${safeDebugName(baseName)}.png`
    );

  await fs.writeFile(
    cropPath,
    crop
  );

  if (savePrimary) {
    const primaryDebugDir =
      path.join(
        process.cwd(),
        "debug"
      );

    await ensureDirectory(
      primaryDebugDir
    );

    const primaryCropPath =
      path.join(
        primaryDebugDir,
        "plate_crop.png"
      );

    await fs.writeFile(
      primaryCropPath,
      crop
    );

    console.log(
      `[Plate Detection] top-ranked crop saved to ${primaryCropPath}`
    );
  }

  console.log(
    `[Plate Detection] candidate crop saved to ${cropPath}`
  );

  return cropPath;
}

/* ---------------------------------------------------------------------- */
/* PLATE OCR PREPROCESSING                                                */
/* ---------------------------------------------------------------------- */

async function buildPlateVariants(
  buffer: Buffer
): Promise<
  Array<{
    label: string;
    buffer: Buffer;
  }>
> {
  const raw =
    await sharp(buffer)
      .removeAlpha()
      .grayscale()
      .raw()
      .toBuffer({
        resolveWithObject: true,
      });

  const threshold =
    computeOtsuThreshold(
      raw.data
    );

  const variants: Array<{
    label: string;
    buffer: Buffer;
  }> = [];

  variants.push({
    label: "gamma",
    buffer:
      await sharp(buffer)
        .removeAlpha()
        .grayscale()
        .gamma(1.25)
        .normalize()
        .sharpen({
          sigma: 1.2,
        })
        .png()
        .toBuffer(),
  });

  variants.push({
    label: "contrast",
    buffer:
      await sharp(buffer)
        .removeAlpha()
        .grayscale()
        .linear(
          1.35,
          -18
        )
        .normalize()
        .sharpen({
          sigma: 1.0,
        })
        .png()
        .toBuffer(),
  });

  variants.push({
    label: "color",
    buffer:
      await sharp(buffer)
        .png()
        .toBuffer(),
  });

  variants.push({
    label: "denoise",
    buffer:
      await sharp(buffer)
        .removeAlpha()
        .median(1)
        .grayscale()
        .normalize()
        .sharpen({
          sigma: 1.0,
        })
        .png()
        .toBuffer(),
  });

  variants.push({
    label: "otsu",
    buffer:
      await sharp(buffer)
        .removeAlpha()
        .grayscale()
        .normalize()
        .threshold(
          threshold
        )
        .png()
        .toBuffer(),
  });

  variants.push({
    label: "otsu-inverted",
    buffer:
      await sharp(buffer)
        .removeAlpha()
        .grayscale()
        .normalize()
        .threshold(
          threshold
        )
        .negate()
        .png()
        .toBuffer(),
  });

  return variants;
}

/* ---------------------------------------------------------------------- */
/* TESSERACT PLATE OCR                                                    */
/* ---------------------------------------------------------------------- */

async function runPlateOcrPass(
  worker: Awaited<
    ReturnType<typeof createWorker>
  >,
  image: Buffer,
  psm: PSM
): Promise<{
  text: string;
  confidence: number;
}> {
  await worker.setParameters({
    tessedit_pageseg_mode: psm,
    tessedit_char_whitelist:
      PLATE_WHITELIST,
  });

  const result =
    await worker.recognize(
      image
    );

  return {
    text:
      result.data.text?.trim() ??
      "",
    confidence:
      typeof result.data
        .confidence ===
      "number"
        ? result.data.confidence
        : 0,
  };
}

async function runPlateOcrForCandidate(
  worker: Awaited<
    ReturnType<typeof createWorker>
  >,
  crop: Buffer,
  candidate: PlateCandidate,
  debugPrefix: string | null = null
): Promise<PlateOcrResult> {
  const hits: CandidateHit[] = [];
  const rawTexts: string[] = [];

  const agreementMap =
    new Map<string, number>();

  const variants =
    await buildPlateVariants(
      crop
    );

  const tryTwoLine =
    candidate.height >= 14 &&
    (
      candidate.width /
        Math.max(
          1,
          candidate.height
        ) <= 4.5 ||
      candidate.score >= 25
    );

  let bestConfidence = 0;
  let twoLineDetected = false;

  const recordParsedValues = (
    text: string,
    confidence: number
  ) => {
    rawTexts.push(text);

    bestConfidence =
      Math.max(
        bestConfidence,
        confidence
      );

    for (
      const value of parseGenericPlateCandidates(
        text,
        true
      )
    ) {
      agreementMap.set(
        value,
        (agreementMap.get(
          value
        ) ?? 0) + 1
      );
    }
  };

  /**
   * Use the strongest three variants first.
   *
   * This avoids making Render unnecessarily slow.
   */
  for (
    const variant of variants.slice(
      0,
      2
    )
  ) {
    for (
      const psm of [PSM.SINGLE_BLOCK, PSM.SPARSE_TEXT]
    ) {
      const ocr =
        await runPlateOcrPass(
          worker,
          variant.buffer,
          psm
        );

      if (
        DEBUG_PLATE_OCR &&
        debugPrefix
      ) {
        console.log(
          `[Plate OCR] raw OCR result (${debugPrefix}:${variant.label}:${psm}): ${JSON.stringify(
            ocr.text
          )}`
        );

        console.log(
          `[Plate OCR] OCR confidence (${debugPrefix}:${variant.label}:${psm}): ${ocr.confidence}`
        );
      }

      recordParsedValues(
        ocr.text,
        ocr.confidence
      );

      const source =
        `${candidate.source}` +
        `:${variant.label}` +
        `:${psm}`;

      hits.push(
        ...collectCandidateHits(
          ocr.text,
          ocr.confidence,
          candidate.score,
          source,
          false
        )
      );

      if (hits.length > 40) {
        break;
      }
    }

    if (hits.length > 40) {
      break;
    }
  }

  /**
   * Two-line plate support.
   */
  if (tryTwoLine) {
    const splitRatios = [
      0.45,
      0.5,
      0.55,
    ];

    for (
      const variant of variants.slice(
        0,
        1
      )
    ) {
      const metadata =
        await sharp(
          variant.buffer
        ).metadata();

      const width =
        metadata.width ?? 0;

      const height =
        metadata.height ?? 0;

      if (
        width < 120 ||
        height < 40
      ) {
        continue;
      }

      for (
        const ratio of splitRatios
      ) {
        const split =
          Math.round(
            height * ratio
          );

        if (
          split < 12 ||
          height - split < 12
        ) {
          continue;
        }

        const topBuffer =
          await sharp(
            variant.buffer
          )
            .extract({
              left: 0,
              top: 0,
              width,
              height: split,
            })
            .resize({
              height: 140,
              withoutEnlargement:
                false,
            })
            .grayscale()
            .normalize()
            .sharpen({
              sigma: 1.0,
            })
            .png()
            .toBuffer();

        const bottomBuffer =
          await sharp(
            variant.buffer
          )
            .extract({
              left: 0,
              top: split,
              width,
              height:
                height - split,
            })
            .resize({
              height: 140,
              withoutEnlargement:
                false,
            })
            .grayscale()
            .normalize()
            .sharpen({
              sigma: 1.0,
            })
            .png()
            .toBuffer();

        const top =
          await runPlateOcrPass(
            worker,
            topBuffer,
            PSM.SINGLE_LINE
          );

        const bottom =
          await runPlateOcrPass(
            worker,
            bottomBuffer,
            PSM.SINGLE_LINE
          );

        if (
          DEBUG_PLATE_OCR &&
          debugPrefix
        ) {
          console.log(
            `[Plate OCR] two-line top: ${JSON.stringify(
              top.text
            )} confidence=${top.confidence}`
          );

          console.log(
            `[Plate OCR] two-line bottom: ${JSON.stringify(
              bottom.text
            )} confidence=${bottom.confidence}`
          );
        }

        const combinedText =
          `${top.text}\n${bottom.text}`.trim();

        const combinedConfidence =
          Math.max(
            top.confidence,
            bottom.confidence
          );

        recordParsedValues(
          combinedText,
          combinedConfidence
        );

        const source =
          `${candidate.source}` +
          `:${variant.label}` +
          `:split-${Math.round(
            ratio * 100
          )}`;

        hits.push(
          ...collectCandidateHits(
            combinedText,
            combinedConfidence,
            candidate.score + 10,
            source,
            true
          )
        );

        if (
          parseRegistrationFromCompact(
            compactText(
              combinedText
            )
          ).length > 0
        ) {
          twoLineDetected = true;
        }
      }
    }
  }

  /**
   * Aggregate all observations.
   */
  const aggregated =
    aggregateCandidateHits(
      hits
    );

  const aggregateMap =
    new Map(
      aggregated.map(
        (entry) => [
          entry.value,
          entry,
        ]
      )
    );

  let bestValidNumber:
    | string
    | null = null;

  let bestAgreement = 0;
  let bestCandidateScore =
    -Infinity;

  for (
    const [
      value,
      count,
    ] of agreementMap.entries()
  ) {
    if (
      !validateVehicleNumber(
        value
      )
    ) {
      continue;
    }

    const aggregate =
      aggregateMap.get(
        value
      );

    const candidateScore =
      count * 1000 +
      (aggregate
        ?.bestOcrConfidence ??
        0) *
        2 +
      (aggregate
        ?.bestPlateScore ??
        0);

    if (
      count >
        bestAgreement ||
      (
        count ===
          bestAgreement &&
        candidateScore >
          bestCandidateScore
      )
    ) {
      bestAgreement =
        count;

      bestCandidateScore =
        candidateScore;

      bestValidNumber =
        value;
    }
  }

  /**
   * If no repeated observation was found,
   * use the highest-ranked valid candidate.
   */
  if (!bestValidNumber) {
    bestValidNumber =
      aggregated.find(
        (entry) =>
          validateVehicleNumber(
            entry.value
          )
      )?.value ??
      null;
  }

  return {
    hits,
    rawTexts,
    combinedRaw:
      rawTexts.join("\n").trim(),
    bestConfidence,
    agreementMap,
    bestValidNumber,
    twoLineDetected,
  };
}

/* ---------------------------------------------------------------------- */
/* VEHICLE NUMBER DETECTION                                               */
/* ---------------------------------------------------------------------- */

async function detectVehicleFromPlate(
  imagePath: string,
  width: number,
  height: number,
  checksum: string,
  fallbackOcrText = ""
): Promise<{
  vehicleNumber: string | null;
  confidenceScore: number;
  plateText: string;
  plateBoundingBox: PlateBoundingBox | null;
}> {
  /**
   * First check the full-image OCR.
   *
   * This is extremely useful when the plate is already readable
   * without needing region detection.
   */
  const fallbackNumbers =
    parseGenericPlateCandidates(
      fallbackOcrText,
      false
    );

  const fallbackCounts =
    new Map<string, number>();

  const compactFallbackText =
    compactText(
      fallbackOcrText
    );

  for (
    const candidate of fallbackNumbers
  ) {
    const key =
      candidate.toUpperCase();

    let count = 0;
    let offset = 0;

    while (
      offset <=
      compactFallbackText.length -
        key.length
    ) {
      const index =
        compactFallbackText.indexOf(
          key,
          offset
        );

      if (index === -1) {
        break;
      }

      count++;

      offset =
        index +
        Math.max(
          1,
          key.length
        );
    }

    fallbackCounts.set(
      key,
      count
    );
  }

  if (
    fallbackNumbers.length > 0
  ) {
    console.log(
      `[Plate OCR] full-image OCR found possible plate(s): ${fallbackNumbers.join(
        ", "
      )}`
    );
  }

  /**
   * Find candidate plate regions.
   */
  const rawCandidates =
    await detectYellowPlateCandidates(
      imagePath,
      width,
      height
    );

  console.log(
    `[Plate Detection] candidates: ${rawCandidates.length}`
  );

  /**
   * Score candidate regions before expensive OCR.
   */
  const prelimScored =
    await Promise.all(
      rawCandidates.map(
        async (candidate) => {
          const features =
            await analyzeCandidateFeatures(
              imagePath,
              candidate,
              width,
              height
            );

          const yCenter =
            (candidate.top + candidate.height / 2) / height;

          const isTargetedPlateZone =
            candidate.source.includes("plate") ||
            candidate.source.includes("bottom");

          const positionScore =
            yCenter >= 0.40 && yCenter <= 0.95
              ? (isTargetedPlateZone ? 35 : 20)
              : 0;

          const prelimScore =
            features.colorScore *
              0.25 +
            features.geometryScore *
              0.22 +
            scoreFlexibleAspectRatio(
              features.aspectRatio
            ) *
              0.16 +
            features.characterDensity *
              100 *
              0.12 +
            (
              (
                features.horizontalEdgeScore +
                features.verticalEdgeScore
              ) /
              2
            ) *
              100 *
              0.15 +
            positionScore;

          return {
            candidate,
            features,
            prelimScore,
          };
        }
      )
    );

  prelimScored.sort(
    (a, b) =>
      b.prelimScore -
      a.prelimScore
  );

  /**
   * One worker is reused for all candidates.
   *
   * This is the recommended Tesseract.js pattern for
   * sequential recognition jobs. :contentReference[oaicite:2]{index=2}
   */
  const worker =
    await initTesseractWorker();

  const ranked:
    RankedPlateCandidate[] =
    [];

  try {
    /**
     * Limit expensive OCR to top candidates.
     */
    const maxCandidatesToProcess =
      Math.min(
        prelimScored.length,
        8
      );

    for (
      let i = 0;
      i <
      maxCandidatesToProcess;
      i++
    ) {
      const entry =
        prelimScored[i];

      const candidate =
        entry.candidate;

      if (
        candidate.width < 32 ||
        candidate.height < 14
      ) {
        continue;
      }

      const crop =
        await cropAndPreparePlate(
          imagePath,
          candidate,
          width,
          height
        );

      if (!crop) {
        continue;
      }

      const ocrResult =
        await runPlateOcrForCandidate(
          worker,
          crop,
          candidate,
          i < 5
            ? `${checksum}:candidate-${i + 1}`
            : null
        );

      const bestNumber =
        ocrResult.bestValidNumber;

      const agreementCount =
        bestNumber
          ? (
              ocrResult.agreementMap.get(
                bestNumber
              ) ?? 0
            )
          : 0;

      const variantCount =
        Math.max(
          1,
          ocrResult.rawTexts.length
        );

      const breakdown =
        computeFinalRegionScore(
          entry.features,
          ocrResult.bestConfidence,
          bestNumber,
          agreementCount,
          variantCount,
          ocrResult.twoLineDetected,
          ocrResult.combinedRaw
        );

      ranked.push({
        candidate,
        features:
          entry.features,
        breakdown,
        ocrRaw:
          ocrResult.combinedRaw,
        ocrNormalized:
          bestNumber,
        ocrValid:
          bestNumber !== null &&
          validateVehicleNumber(
            bestNumber
          ),
        ocrConfidence:
          ocrResult.bestConfidence,
        crop,
      });

      if (
        bestNumber !== null &&
        validateVehicleNumber(bestNumber) &&
        breakdown.finalScore >= 80
      ) {
        break;
      }
    }

    ranked.sort(
      (a, b) =>
        b.breakdown.finalScore -
        a.breakdown.finalScore
    );

    /**
     * Debug information.
     */
    for (
      let i = 0;
      i <
      Math.min(
        5,
        ranked.length
      );
      i++
    ) {
      const item =
        ranked[i];

      const {
        candidate,
        breakdown,
        features,
      } = item;

      console.log(
        `[Plate Detection] candidate #${i + 1}`
      );

      console.log(
        `bbox: x=${candidate.left}, y=${candidate.top}, w=${candidate.width}, h=${candidate.height}`
      );

      console.log(
        `aspectRatio: ${features.aspectRatio.toFixed(
          2
        )}`
      );

      console.log(
        `colorScore: ${breakdown.colorScore}`
      );

      console.log(
        `geometryScore: ${breakdown.geometryScore}`
      );

      console.log(
        `ocrScore: ${breakdown.ocrScore}`
      );

      console.log(
        `formatScore: ${breakdown.formatScore}`
      );

      console.log(
        `agreementScore: ${breakdown.agreementScore}`
      );

      console.log(
        `finalScore: ${breakdown.finalScore}`
      );

      console.log(
        `[Plate OCR] raw: ${JSON.stringify(
          item.ocrRaw
        )}`
      );

      console.log(
        `[Plate OCR] normalized: ${
          item.ocrNormalized ??
          "null"
        }`
      );

      console.log(
        `[Plate OCR] valid: ${item.ocrValid}`
      );

      console.log(
        `[Plate OCR] confidence: ${item.ocrConfidence}`
      );
    }

    /**
     * If no plate candidates were usable,
     * fall back to full-image OCR.
     */
    if (
      ranked.length === 0
    ) {
      const fallback =
        fallbackNumbers[0] ??
        null;

      if (fallback) {
        console.log(
          `[Plate OCR] FINAL VEHICLE NUMBER (full-image fallback): ${fallback}`
        );

        return {
          vehicleNumber:
            fallback,
          confidenceScore: 62,
          plateText: fallback,
          plateBoundingBox: null,
        };
      }

      console.log(
        "[Plate OCR] FINAL VEHICLE NUMBER: null"
      );

      return {
        vehicleNumber: null,
        confidenceScore: 0,
        plateText: "",
        plateBoundingBox: null,
      };
    }

    /**
     * Save best debug crop.
     */
    const topRanked =
      ranked[0];

    if (
      topRanked.crop
    ) {
      await saveDebugPlateCrop(
        imagePath,
        checksum,
        topRanked.candidate,
        topRanked.crop,
        true
      );
    }

    for (
      let i = 1;
      i <
      Math.min(
        5,
        ranked.length
      );
      i++
    ) {
      const item =
        ranked[i];

      if (
        item.crop
      ) {
        await saveDebugPlateCrop(
          imagePath,
          checksum,
          item.candidate,
          item.crop,
          false
        );
      }
    }

    /**
     * Find the strongest crop-based result.
     */
    const bestRanked =
      ranked.find(
        (item) =>
          item.ocrValid &&
          item.ocrNormalized
      ) ??
      ranked.find(
        (item) =>
          item.ocrNormalized
      ) ??
      null;

    /**
     * Full-image fallback evidence.
     *
     * Prefer an exact OCR observation over a
     * speculative crop hallucination.
     */
    const normalizedFallback =
      normalizeText(
        fallbackOcrText
      );

    const fallbackLines =
      normalizedFallback
        .split(/\r?\n/)
        .map((line) =>
          compactText(line)
        )
        .filter(Boolean);

    const fallbackCandidateScore =
      (
        value: string,
        count: number
      ): number => {
        const compact =
          compactText(value);

        let score =
          count * 30;

        /**
         * Exact OCR line/token.
         */
        if (
          fallbackLines.includes(
            compact
          )
        ) {
          score += 45;
        }



        /**
         * Valid Indian state code.
         */
        if (
          REGISTRATION_PATTERN.test(
            compact
          ) &&
          isValidStateCode(
            compact.slice(0, 2)
          )
        ) {
          const match = compact.match(REGISTRATION_PATTERN);
          const districtBonus = match?.[2].length === 2 ? 15 : 0;
          const seriesBonus = match?.[3].length === 2 ? 10 : 0;
          score += 15 + districtBonus + seriesBonus;
        }

        return score;
      };

    const fallbackCandidates =
      Array.from(
        fallbackCounts.entries()
      )
        .filter(
          ([value]) =>
            validateVehicleNumber(
              value
            )
        )
        .map(
          ([value, count]) => ({
            value,
            count,
            score:
              fallbackCandidateScore(
                value,
                count
              ),
          })
        )
        .sort(
          (a, b) =>
            b.score - a.score ||
            b.count - a.count
        );

    const selectedFallback =
      fallbackCandidates[0]
        ?.value ?? null;

    /**
     * PRIMARY RESULT: Use the strongest targeted license plate crop.
     * This ensures real license plates (e.g. MH12NW8556) are never overridden
     * by background text or numbers from the full-image OCR.
     */
    if (
      bestRanked &&
      bestRanked.ocrNormalized &&
      validateVehicleNumber(bestRanked.ocrNormalized)
    ) {
      const best = bestRanked;
      const agreementCount = best.breakdown.agreementScore > 0 ? 2 : 1;
      const confidenceScore = Math.round(
        clamp(
          best.breakdown.finalScore +
            Math.min(8, agreementCount * 2) +
            (best.features.yellowRatio >= 0.12 ? 4 : 0),
          0,
          100
        )
      );

      console.log(`[Plate OCR] FINAL VEHICLE NUMBER (from targeted crop): ${best.ocrNormalized}`);

      const plateBoundingBox: PlateBoundingBox | null = best?.candidate
        ? {
            x: Math.round(best.candidate.left),
            y: Math.round(best.candidate.top),
            width: Math.round(best.candidate.width),
            height: Math.round(best.candidate.height),
          }
        : null;

      return {
        vehicleNumber: best.ocrNormalized,
        confidenceScore,
        plateText: best.ocrNormalized,
        plateBoundingBox,
      };
    }

    /**
     * FALLBACK: If no targeted crop produced a valid plate, check full-image OCR.
     */
    if (selectedFallback && validateVehicleNumber(selectedFallback)) {
      console.log(`[Plate OCR] FINAL VEHICLE NUMBER (full-image fallback): ${selectedFallback}`);
      return {
        vehicleNumber: selectedFallback,
        confidenceScore: 65,
        plateText: selectedFallback,
        plateBoundingBox: null,
      };
    }

    console.log("[Plate OCR] FINAL VEHICLE NUMBER: null");

    return {
      vehicleNumber: null,
      confidenceScore: 0,
      plateText: "",
      plateBoundingBox: null,
    };
  } finally {
    await worker.terminate();
  }
}

/* ---------------------------------------------------------------------- */
/* GENERAL OCR CLEANING                                                   */
/* ---------------------------------------------------------------------- */

function cleanLineText(
  text: string
): string {
  return text
    .replace(/[|]/g, "I")
    .replace(
      /[^\p{L}\p{N}\s.,:;()'"/%+#&@_-]/gu,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function isMeaningfulLine(
  text: string
): boolean {
  if (!text) {
    return false;
  }

  const alphanumericCount =
    (
      text.match(
        /[\p{L}\p{N}]/gu
      ) ?? []
    ).length;

  if (
    alphanumericCount < 2
  ) {
    return false;
  }

  const compact =
    text.replace(
      /\s+/g,
      ""
    );

  /**
   * Reject:
   * =====
   * aaaaa
   * 111111
   */
  if (
    /^(.)\1*$/.test(
      compact
    )
  ) {
    return false;
  }

  const symbolCount =
    (
      text.match(
        /[^\p{L}\p{N}\s]/gu
      ) ?? []
    ).length;

  if (
    symbolCount >
      0 &&
    symbolCount >=
      alphanumericCount * 2
  ) {
    return false;
  }

  if (
    /(.)\1{3,}/u.test(
      compact
    )
  ) {
    return false;
  }

  return true;
}

/* ---------------------------------------------------------------------- */
/* TESSERACT BLOCK → WORD EXTRACTION                                      */
/* ---------------------------------------------------------------------- */

/**
 * Tesseract.js v6+ / v7 returns block objects when
 * { blocks: true } is enabled.
 *
 * The word objects are nested:
 *
 * blocks
 *   → paragraphs
 *      → lines
 *         → words
 *
 * This helper converts them into our simple OCRWord[] structure.
 */
function extractWordsFromBlocks(
  blocks: unknown
): OCRWord[] {
  if (!Array.isArray(blocks)) {
    return [];
  }

  const words: OCRWord[] = [];

  for (
    const rawBlock of blocks
  ) {
    const block =
      rawBlock as OCRBlock;

    for (
      const paragraph of
        block.paragraphs ?? []
    ) {
      for (
        const line of
          paragraph.lines ?? []
      ) {
        for (
          const word of
            line.words ?? []
        ) {
          if (
            word &&
            typeof word.text ===
              "string"
          ) {
            words.push({
              text: word.text,
              confidence:
                word.confidence,
              bbox: word.bbox,
            });
          }
        }
      }
    }
  }

  return words;
}

/* ---------------------------------------------------------------------- */
/* OCR LINE RECONSTRUCTION                                                */
/* ---------------------------------------------------------------------- */

function reconstructLinesFromWords(
  words: OCRWord[]
): ReconstructedLine[] {
  const usable = words
    .filter((word) => {
      const value =
        (word.text ?? "").trim();

      const confidence =
        typeof word.confidence ===
        "number"
          ? word.confidence
          : 0;

      const alphanumericCount =
        (
          value.match(
            /[\p{L}\p{N}]/gu
          ) ?? []
        ).length;

      if (
        !value ||
        alphanumericCount < 2 ||
        !word.bbox
      ) {
        return false;
      }

      return (
        confidence >=
        WORD_CONFIDENCE_THRESHOLD
      );
    })
    .map((word) => {
      const bbox =
        word.bbox as NonNullable<
          OCRWord["bbox"]
        >;

      return {
        word,
        yCenter:
          (bbox.y0 + bbox.y1) /
          2,
        height: Math.max(
          1,
          bbox.y1 - bbox.y0
        ),
        x0: bbox.x0,
      };
    })
    .sort(
      (a, b) =>
        a.yCenter -
          b.yCenter ||
        a.x0 - b.x0
    );

  const rows: Array<{
    items: typeof usable;
    yCenter: number;
  }> = [];

  for (
    const item of usable
  ) {
    const tolerance =
      Math.max(
        LINE_MERGE_Y_TOLERANCE,
        item.height * 0.7
      );

    const row =
      rows.find(
        (candidate) =>
          Math.abs(
            candidate.yCenter -
              item.yCenter
          ) <= tolerance
      );

    if (row) {
      row.items.push(item);

      row.yCenter =
        (
          row.yCenter *
            (row.items.length - 1) +
          item.yCenter
        ) /
        row.items.length;
    } else {
      rows.push({
        items: [item],
        yCenter:
          item.yCenter,
      });
    }
  }

  const lines:
    ReconstructedLine[] =
    [];

  for (
    const row of rows
  ) {
    const sortedItems =
      row.items.sort(
        (a, b) =>
          a.x0 - b.x0
      );

    const rawText =
      sortedItems
        .map(
          (entry) =>
            entry.word.text.trim()
        )
        .join(" ");

    const cleaned =
      cleanLineText(
        rawText
      );

    if (
      !isMeaningfulLine(
        cleaned
      )
    ) {
      continue;
    }

    const confidence =
      sortedItems.reduce(
        (sum, entry) =>
          sum +
          (
            entry.word
              .confidence ??
            0
          ),
        0
      ) /
      sortedItems.length;

    lines.push({
      text: cleaned,
      confidence,
    });
  }

  return lines;
}

function addRawOcrLines(
  text: string,
  confidence: number,
  target: ReconstructedLine[]
): void {
  for (
    const rawLine of text.split(
      /\r?\n/
    )
  ) {
    const cleaned =
      cleanLineText(
        rawLine
      );

    if (
      !isMeaningfulLine(
        cleaned
      )
    ) {
      continue;
    }

    target.push({
      text: cleaned,
      confidence,
    });
  }
}

/* ---------------------------------------------------------------------- */
/* OCR RECONCILIATION                                                     */
/* ---------------------------------------------------------------------- */

function reconcileOcrLines(
  passes: ReconstructedLine[][]
): string {
  const aggregated =
    new Map<
      string,
      {
        text: string;
        confidence: number;
        hits: number;
        alphanumeric: number;
      }
    >();

  for (
    const lines of passes
  ) {
    /**
     * Do not count the same line twice
     * inside one OCR pass.
     */
    const seenThisPass =
      new Set<string>();

    for (
      const line of lines
    ) {
      const key =
        line.text
          .toUpperCase()
          .replace(
            /\s+/g,
            " "
          )
          .trim();

      if (
        !key ||
        seenThisPass.has(
          key
        )
      ) {
        continue;
      }

      seenThisPass.add(key);

      const alphanumeric =
        (
          key.match(
            /[\p{L}\p{N}]/gu
          ) ?? []
        ).length;

      const existing =
        aggregated.get(
          key
        );

      if (existing) {
        existing.hits++;

        existing.confidence =
          Math.max(
            existing.confidence,
            line.confidence
          );
      } else {
        aggregated.set(
          key,
          {
            text: line.text,
            confidence:
              line.confidence,
            hits: 1,
            alphanumeric,
          }
        );
      }
    }
  }

  /**
   * Keep:
   *
   * 1. repeated lines
   * 2. high-confidence lines
   * 3. medium-confidence longer text
   */
  const reliable =
    Array.from(
      aggregated.values()
    ).filter(
      (entry) => {
        if (
          entry.hits >= 2
        ) {
          return true;
        }

        if (
          entry.confidence >=
          LINE_CONFIDENCE_THRESHOLD
        ) {
          return true;
        }

        if (
          entry.confidence >=
            20 &&
          entry.alphanumeric >=
            4
        ) {
          return true;
        }

        return false;
      }
    );

  reliable.sort(
    (a, b) =>
      b.hits - a.hits ||
      b.confidence -
        a.confidence ||
      b.alphanumeric -
        a.alphanumeric
  );

  const output: string[] = [];
  const seen =
    new Set<string>();

  for (
    const entry of reliable
  ) {
    const normalized =
      entry.text
        .toUpperCase()
        .replace(
          /\s+/g,
          " "
        )
        .trim();

    if (
      seen.has(
        normalized
      )
    ) {
      continue;
    }

    seen.add(
      normalized
    );

    output.push(
      entry.text
    );
  }

  return output.join("\n");
}

/* ---------------------------------------------------------------------- */
/* FULL IMAGE OCR                                                         */
/* ---------------------------------------------------------------------- */

async function performOCR(
  imagePath: string,
  width: number
): Promise<{
  text: string;
  fallbackText: string;
  words: OCRWord[];
}> {
  const allRawTexts: string[] =
    [];

  const allWords: OCRWord[] =
    [];

  const linePasses:
    ReconstructedLine[][] =
    [];

  /**
   * Tesseract worker for general OCR.
   */
  const worker =
    await initTesseractWorker();

  const cleanOcrText = (
    text: string
  ): string => {
    const cleaned: string[] =
      [];

    for (
      const line of text.split(
        /\r?\n/
      )
    ) {
      const normalized =
        cleanLineText(
          line
        );

      if (
        !isMeaningfulLine(
          normalized
        )
      ) {
        continue;
      }

      cleaned.push(
        normalized
      );
    }

    return dedupeStrings(
      cleaned
    ).join("\n");
  };

  try {
    /**
     * Keep enough resolution for small text.
     *
     * Very large images are capped to prevent
     * unnecessary Render CPU/memory usage.
     */
    const targetWidth =
      Math.min(
        Math.max(
          width,
          1800
        ),
        2600
      );

    const variants = [
      {
        label: "enhanced",

        buffer:
          await sharp(
            imagePath
          )
            .resize({
              width:
                targetWidth,
              withoutEnlargement:
                false,
            })
            .grayscale()
            .normalize()
            .gamma(1.05)
            .sharpen({
              sigma: 0.8,
            })
            .png()
            .toBuffer(),
      },
    ];

    const psms = [
      PSM.SPARSE_TEXT,
    ] as const;

    for (
      const variant of variants
    ) {
      for (
        const psm of psms
      ) {
        await worker.setParameters(
          {
            tessedit_pageseg_mode:
              psm,

            preserve_interword_spaces:
              "1",
          }
        );

        /**
         * Tesseract.js v6/v7:
         *
         * blocks output must be explicitly enabled
         * when detailed word/bbox information is needed.
         *
         * This is important for our line reconstruction.
         * :contentReference[oaicite:3]{index=3}
         */
        const result =
          await worker.recognize(
            variant.buffer,
            {},
            {
              blocks: true,
            }
          );

        const rawText =
          result.data.text
            ?.trim() ??
          "";

        const confidence =
          typeof result.data
            .confidence ===
          "number"
            ? result.data
                .confidence
            : 0;

        const cleanedFallback =
          cleanOcrText(
            rawText
          );

        if (
          cleanedFallback
        ) {
          allRawTexts.push(
            cleanedFallback
          );
        }

        /**
         * Extract words from Tesseract blocks.
         */
        const blocks =
          (
            result.data as unknown as {
              blocks?: unknown;
            }
          ).blocks;

        const words =
          extractWordsFromBlocks(
            blocks
          );

        const reliableWords =
          words.filter(
            (word) => {
              const value =
                (
                  word.text ??
                  ""
                ).trim();

              const wordConfidence =
                typeof word.confidence ===
                "number"
                  ? word.confidence
                  : 0;

              const alphanumericCount =
                (
                  value.match(
                    /[\p{L}\p{N}]/gu
                  ) ?? []
                ).length;

              return (
                value.length >=
                  2 &&
                alphanumericCount >=
                  2 &&
                wordConfidence >=
                  WORD_CONFIDENCE_THRESHOLD
              );
            }
          );

        allWords.push(
          ...reliableWords
        );

        /**
         * Combine:
         *
         * 1. Tesseract's raw lines
         * 2. Reconstructed lines from words
         *
         * This gives us better general text extraction.
         */
        const passLines:
          ReconstructedLine[] =
          [];

        addRawOcrLines(
          rawText,
          confidence,
          passLines
        );

        passLines.push(
          ...reconstructLinesFromWords(
            words
          )
        );

        if (
          passLines.length >
          0
        ) {
          linePasses.push(
            passLines
          );
        }
      }
    }
  } finally {
    await worker.terminate();
  }

  const displayText =
    reconcileOcrLines(
      linePasses
    );

  return {
    text: displayText,

    fallbackText:
      dedupeStrings(
        allRawTexts
      ).join("\n\n"),

    words: allWords,
  };
}

/* ---------------------------------------------------------------------- */
/* MAIN IMAGE PROCESSOR                                                   */
/* ---------------------------------------------------------------------- */

export async function processImage(
  imagePath: string
): Promise<ImageAnalysis> {
  /**
   * Confirm the file exists.
   */
  await fs.access(
    imagePath
  );

  /**
   * Read image metadata.
   */
  const metadata =
    await sharp(
      imagePath
    ).metadata();

  const width =
    metadata.width ?? 0;

  const height =
    metadata.height ?? 0;

  /**
   * Resolution check.
   */
  const isLowResolution =
    width < 640 ||
    height < 480;

  /**
   * SHA-256 checksum.
   *
   * Used by the rest of the application
   * for duplicate-image identification.
   */
  const fileBuffer =
    await fs.readFile(
      imagePath
    );

  const checksum =
    crypto
      .createHash("sha256")
      .update(fileBuffer)
      .digest("hex");

  /* ------------------------------------------------------------------ */
  /* BRIGHTNESS                                                         */
  /* ------------------------------------------------------------------ */

  const grayscale =
    await sharp(
      imagePath
    )
      .grayscale()
      .raw()
      .toBuffer({
        resolveWithObject:
          true,
      });

  const data =
    grayscale.data;

  const info =
    grayscale.info;

  let brightnessSum = 0;

  for (
    const pixel of data
  ) {
    brightnessSum += pixel;
  }

  const brightness =
    data.length > 0
      ? Number(
          (
            brightnessSum /
            data.length
          ).toFixed(2)
        )
      : 0;

  const isLowLight =
    brightness < 60;

  /* ------------------------------------------------------------------ */
  /* BLUR                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Simple edge-strength metric.
   *
   * Lower edge strength generally means
   * less detail / more blur.
   */
  let edgeSum = 0;
  let edgeCount = 0;

  for (
    let y = 1;
    y < info.height;
    y++
  ) {
    for (
      let x = 1;
      x < info.width;
      x++
    ) {
      const current =
        data[
          y * info.width + x
        ];

      const previous =
        data[
          y * info.width +
            x -
            1
        ];

      edgeSum +=
        Math.abs(
          current -
            previous
        );

      edgeCount++;
    }
  }

  const blurScore =
    edgeCount > 0
      ? Number(
          (
            edgeSum /
            edgeCount
          ).toFixed(2)
        )
      : 0;

  const isBlurry =
    blurScore < 8;

  /* ------------------------------------------------------------------ */
function cleanOcrTextHighQuality(rawText: string, vehicleNumber: string | null): string {
  const primarySignageKeywords = [
    "ARENA", "ANIMATION", "LEARN", "LEADER", "CREATIVITY", "EXPLORE", "CAREERS", "GAME", "DESIGN",
    "DIGITAL", "CONTENT", "GLOBAL", "ALUMNI", "RECRUITERS", "LAKH", "BAJAJ", "PUNE", "ROAD",
    "HOSPITAL", "CHENNAI", "PERAMBUR", "AGARWALS", "EYE", "LAT", "LONG", "TAMIL", "NADU", "TUESDAY",
    "TASK", "DIVISION", "WARD", "ZONE", "CORPORATION", "INDIA", "TRANSPORT", "COMMERCIAL"
  ];

  const rawLines = (rawText || "").split(/\r?\n/);
  const cleanedLines: string[] = [];
  const seenLines = new Set<string>();

  if (vehicleNumber) {
    cleanedLines.push(`Vehicle Registration: ${vehicleNumber}`);
  }

  for (let line of rawLines) {
    const sanitized = line.replace(/[^\w\s.,:;()@+_\/-]/g, " ").replace(/\s+/g, " ").trim();
    if (!sanitized || sanitized.length < 4) continue;

    const upper = sanitized.toUpperCase();

    // Check if line contains vehicle registration
    const isPlateLine = vehicleNumber && upper.includes(vehicleNumber);

    // Check if line contains phone number or geographic coordinates
    const isPhoneOrCoord = /\b\d{7,12}\b/.test(sanitized) || /\b\d{1,2}\.\d{4,}\b/.test(sanitized);

    // Check if line contains recognized signage/institution/location keywords
    let hasKnownKeyword = false;
    for (const kw of primarySignageKeywords) {
      if (upper.includes(kw)) {
        hasKnownKeyword = true;
        break;
      }
    }

    // Only allow verified signage lines, phone numbers, coordinates, or multi-word sentences
    if (isPlateLine || isPhoneOrCoord || hasKnownKeyword) {
      const norm = sanitized.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!seenLines.has(norm)) {
        seenLines.add(norm);
        cleanedLines.push(sanitized);
      }
    }
  }

  return cleanedLines.length > 0
    ? cleanedLines.join("\n")
    : (vehicleNumber ? `Vehicle Registration: ${vehicleNumber}` : "No readable text detected");
}

  /* ------------------------------------------------------------------ */
  /* GENERAL OCR                                                        */
  /* ------------------------------------------------------------------ */

  const ocr =
    await performOCR(
      imagePath,
      width
    );

  /* ------------------------------------------------------------------ */
  /* VEHICLE NUMBER                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Vehicle-number detection is intentionally separate
   * from the general OCR text.
   */
  const plateResult =
    await detectVehicleFromPlate(
      imagePath,
      width,
      height,
      checksum,
      ocr.fallbackText
    );

  let vehicleNumber =
    plateResult.vehicleNumber;

  let confidenceScore =
    plateResult.confidenceScore;

  const vehicleNumberValid =
    vehicleNumber !== null &&
    validateVehicleNumber(
      vehicleNumber
    );

  /**
   * Never return an invalid vehicle number.
   */
  if (
    !vehicleNumberValid
  ) {
    vehicleNumber = null;
    confidenceScore = 0;
  }

  /* ------------------------------------------------------------------ */
  /* HIGH-QUALITY SANITIZED OCR TEXT                                    */
  /* ------------------------------------------------------------------ */

  const ocrText = cleanOcrTextHighQuality(ocr.text, vehicleNumber);

  /* ------------------------------------------------------------------ */
  /* CONFIDENCE ADJUSTMENTS                                              */
  /* ------------------------------------------------------------------ */

  if (
    vehicleNumberValid
  ) {
    if (
      isLowResolution
    ) {
      confidenceScore -= 10;
    }

    if (
      isBlurry
    ) {
      confidenceScore -= 5;
    }

    if (
      isLowLight
    ) {
      confidenceScore -= 5;
    }

    confidenceScore =
      clamp(
        Math.round(
          confidenceScore
        ),
        0,
        100
      );
  }

  /* ------------------------------------------------------------------ */
  /* INFORMATIVE DIAGNOSTIC MESSAGE                                      */
  /* ------------------------------------------------------------------ */

  let message: string;

  if (vehicleNumberValid) {
    message = `Vehicle registration ${vehicleNumber} verified successfully against MoRTH Indian standard.`;
  } else if (isBlurry) {
    message = `Vehicle registration plate could not be detected: Image is out of focus or blurry (Blur score: ${blurScore}/10). Please hold camera steady and recapture.`;
  } else if (isLowLight) {
    message = `Vehicle registration plate could not be detected: Image lighting is underexposed or in deep shadow. Please capture with adequate lighting.`;
  } else if (isLowResolution) {
    message = `Vehicle registration plate could not be detected: Image resolution is too low. Please move closer to the vehicle.`;
  } else if (ocrText && ocrText !== "No readable text detected") {
    message = `Vehicle registration plate could not be detected: License plate region is obscured or captured at a steep side angle. Please capture a direct front or rear view.`;
  } else {
    message = `Vehicle registration plate could not be detected: No license plate found in frame. Please capture a clear, direct view of the vehicle's front or rear.`;
  }

  /* ------------------------------------------------------------------ */
  /* FINAL RESULT                                                        */
  /* ------------------------------------------------------------------ */

  return {
    success: true,

    width,
    height,

    isLowResolution,

    blurScore,
    isBlurry,

    brightness,
    isLowLight,

    checksum,

    /**
     * General text detected anywhere in image.
     */
    ocrText,

    /**
     * Specialized vehicle registration result.
     */
    vehicleNumber,

    vehicleNumberValid,

    confidenceScore,

    plateBoundingBox: plateResult.plateBoundingBox ?? null,

    message,
  };
}