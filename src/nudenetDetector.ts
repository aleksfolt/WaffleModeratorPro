import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as ort from "onnxruntime-node";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODEL_PATH = join(__dirname, "../models/320n.onnx");
const MODEL_URL =
  "https://github.com/notAI-tech/NudeNet/releases/download/v3.4-weights/320n.onnx";

const CLASSES = [
  "FEMALE_GENITALIA_COVERED",
  "FACE_FEMALE",
  "BUTTOCKS_EXPOSED",
  "FEMALE_BREAST_EXPOSED",
  "FEMALE_GENITALIA_EXPOSED",
  "MALE_BREAST_EXPOSED",
  "ANUS_EXPOSED",
  "FEET_EXPOSED",
  "BELLY_COVERED",
  "FEET_COVERED",
  "ARMPITS_COVERED",
  "ARMPITS_EXPOSED",
  "FACE_MALE",
  "BELLY_EXPOSED",
  "MALE_GENITALIA_EXPOSED",
  "ANUS_COVERED",
  "FEMALE_BREAST_COVERED",
  "BUTTOCKS_COVERED",
];

export const NSFW_CLASSES = new Set([
  "BUTTOCKS_EXPOSED",
  "FEMALE_BREAST_EXPOSED",
  "FEMALE_GENITALIA_EXPOSED",
  "MALE_GENITALIA_EXPOSED",
  "ANUS_EXPOSED",
]);

// Прикрытые, но откровенные — купальники, бельё, нижнее бельё
export const COVERED_NSFW_CLASSES = new Set([
  "FEMALE_BREAST_COVERED",
  "BUTTOCKS_COVERED",
  "FEMALE_GENITALIA_COVERED",
  "ANUS_COVERED",
]);

const MODEL_SIZE = 320;

let _session: ort.InferenceSession | null = null;

export async function downloadModelIfNeeded(): Promise<void> {
  if (existsSync(MODEL_PATH)) return;

  // GitHub releases for this repo require auth — extract from Python package instead
  console.log("[NudeNet] Model not found, downloading via pip wheel (~12 MB)...");
  await mkdir(dirname(MODEL_PATH), { recursive: true });

  // Download the nudenet Python wheel (public PyPI, no auth needed)
  const pypiRes = await fetch("https://pypi.org/pypi/nudenet/json");
  if (!pypiRes.ok) throw new Error("Failed to fetch nudenet package info from PyPI");

  const pypiData = (await pypiRes.json()) as {
    urls: { filename: string; url: string; packagetype: string }[];
  };
  const wheel = pypiData.urls.find(
    (f) => f.packagetype === "bdist_wheel" && f.filename.endsWith("-py3-none-any.whl"),
  );
  if (!wheel) throw new Error("nudenet wheel not found on PyPI");

  console.log(`[NudeNet] Downloading ${wheel.filename}...`);
  const whlRes = await fetch(wheel.url);
  if (!whlRes.ok) throw new Error(`Failed to download wheel: ${whlRes.status}`);

  const whlPath = MODEL_PATH.replace("320n.onnx", "nudenet.whl");
  await writeFile(whlPath, Buffer.from(await whlRes.arrayBuffer()));

  // Extract 320n.onnx from the wheel (zip format)
  const { execSync } = await import("node:child_process");
  execSync(`unzip -o "${whlPath}" "nudenet/320n.onnx" -d "${dirname(MODEL_PATH)}/_whl_tmp"`);
  const { rename, rm } = await import("node:fs/promises");
  await rename(`${dirname(MODEL_PATH)}/_whl_tmp/nudenet/320n.onnx`, MODEL_PATH);
  await rm(`${dirname(MODEL_PATH)}/_whl_tmp`, { recursive: true });
  await rm(whlPath);

  console.log("[NudeNet] Model ready.");
}

export async function getNudenetSession(): Promise<ort.InferenceSession> {
  if (!_session) {
    await downloadModelIfNeeded();
    _session = await ort.InferenceSession.create(MODEL_PATH, {
      executionProviders: ["cpu"],
    });
  }
  return _session;
}

export interface Detection {
  className: string;
  confidence: number;
}

export async function detectNudity(imagePath: string, confThreshold: number): Promise<Detection[]> {
  const session = await getNudenetSession();

  // Resize to 320×320, HWC uint8 → NCHW float32 [0, 1]
  const raw = await sharp(imagePath)
    .resize(MODEL_SIZE, MODEL_SIZE, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();

  const pixels = MODEL_SIZE * MODEL_SIZE;
  const float32 = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i++) {
    float32[i] = (raw[i * 3] as number) / 255;
    float32[pixels + i] = (raw[i * 3 + 1] as number) / 255;
    float32[2 * pixels + i] = (raw[i * 3 + 2] as number) / 255;
  }

  const inputName = session.inputNames[0] as string;
  const outputName = session.outputNames[0] as string;
  const inputTensor = new ort.Tensor("float32", float32, [1, 3, MODEL_SIZE, MODEL_SIZE]);
  const result = await session.run({ [inputName]: inputTensor });

  // Output shape: [1, 4+numClasses, numAnchors]
  const out = result[outputName]!;
  const data = out.data as Float32Array;
  const numAnchors = out.dims[2] as number;
  const numClasses = CLASSES.length;

  const detections: Detection[] = [];

  for (let i = 0; i < numAnchors; i++) {
    let maxScore = 0;
    let maxClass = 0;

    for (let c = 0; c < numClasses; c++) {
      const score = (data[(4 + c) * numAnchors + i] as number);
      if (score > maxScore) {
        maxScore = score;
        maxClass = c;
      }
    }

    if (maxScore >= confThreshold) {
      detections.push({ className: CLASSES[maxClass] as string, confidence: maxScore });
    }
  }

  return detections;
}
