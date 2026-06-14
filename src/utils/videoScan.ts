import { mkdir, readdir, rm, unlink } from "node:fs/promises";
import { join } from "node:path";

import { COVERED_NSFW_CLASSES, detectNudity, NSFW_CLASSES } from "../nudenetDetector.ts";
import type { Detection } from "../nudenetDetector.ts";

const FPS = 4;
const SAMPLE_DURATION_SEC = 5;
const SAMPLE_INTERVAL_SEC = 300; // every 5 min for long videos
const FULL_SCAN_THRESHOLD_SEC = 300; // videos ≤ 5 min are fully scanned

async function getVideoDuration(filePath: string): Promise<number | null> {
  try {
    const proc = Bun.spawn(
      ["ffprobe", "-v", "error", "-show_entries", "format=duration",
       "-of", "default=noprint_wrappers=1:nokey=1", filePath],
      { stdout: "pipe", stderr: "pipe" },
    );
    await proc.exited;
    const text = await new Response(proc.stdout).text();
    const dur = parseFloat(text.trim());
    return Number.isFinite(dur) && dur > 0 ? dur : null;
  } catch {
    return null;
  }
}

async function extractFrames(
  filePath: string,
  outDir: string,
  startSec: number,
  durationSec: number | null,
): Promise<string[]> {
  const args = [
    "ffmpeg",
    "-ss", String(startSec),
    "-i", filePath,
    ...(durationSec !== null ? ["-t", String(durationSec)] : []),
    "-vf", `fps=${FPS},scale=640:360:force_original_aspect_ratio=decrease`,
    "-q:v", "3",
    join(outDir, "frame_%06d.jpg"),
    "-y",
  ];
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  await proc.exited;
  const files = await readdir(outDir).catch(() => [] as string[]);
  return files.filter((f) => f.endsWith(".jpg")).sort().map((f) => join(outDir, f));
}

export async function scanVideoForNsfw(
  filePath: string,
  confThreshold: number,
  blockCovered: boolean,
): Promise<Detection | null> {
  const duration = await getVideoDuration(filePath);
  console.log(`[NSFW] videoScan duration=${duration} file=${filePath}`);

  // duration may be unreliable for short WEBM stickers — scan whole file if suspicious
  const durationUnreliable = !duration || duration < 2;

  const offsets: number[] = (!durationUnreliable && duration! > FULL_SCAN_THRESHOLD_SEC)
    ? Array.from(
        { length: Math.ceil(duration! / SAMPLE_INTERVAL_SEC) },
        (_, i) => i * SAMPLE_INTERVAL_SEC,
      )
    : [0];

  const tmpDir = `/tmp/nsfw_vid_${Date.now()}`;
  await mkdir(tmpDir, { recursive: true });

  try {
    for (const offset of offsets) {
      const segDur = durationUnreliable
        ? null // no -t: extract everything
        : duration! > FULL_SCAN_THRESHOLD_SEC
          ? SAMPLE_DURATION_SEC
          : duration!;
      const frames = await extractFrames(filePath, tmpDir, offset, segDur);
      console.log(`[NSFW] videoScan frames=${frames.length} offset=${offset} segDur=${segDur}`);

      for (const framePath of frames) {
        const detections = await detectNudity(framePath, confThreshold).catch(() => [] as Detection[]);
        await unlink(framePath).catch(() => {});

        const hit = detections.find(
          (d) => NSFW_CLASSES.has(d.className) || (blockCovered && COVERED_NSFW_CLASSES.has(d.className)),
        );
        if (hit) return hit;
      }
    }
    return null;
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
