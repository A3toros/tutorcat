/**
 * Netlify Background Function: superhero portrait image-to-image (up to 15 min).
 * Filename suffix -background → callers get 202 immediately.
 */
import { processSuperheroImageJob } from './superhero-image-job-runner.js';

export default async (req: Request, _context?: unknown): Promise<void> => {
  if (req.method !== 'POST') return;

  let jobId: string;
  try {
    const body = (await req.json()) as { jobId?: string };
    const raw = body?.jobId;
    if (!raw || typeof raw !== 'string' || !raw.trim()) {
      console.error('run-superhero-image-background: missing or invalid jobId');
      return;
    }
    jobId = raw.trim();
  } catch {
    console.error('run-superhero-image-background: invalid JSON body');
    return;
  }

  await processSuperheroImageJob(jobId);
};
