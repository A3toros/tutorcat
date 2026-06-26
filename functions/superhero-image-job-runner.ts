import { neon } from '@neondatabase/serverless';
import { loadBundleForSuperheroImageJob, type SuperheroImageJobInput } from './superhero-ai-shared.js';
import { runSuperheroImagePipeline } from './superhero-image-worker.js';
import {
  superheroPortraitPath,
  uploadSuperheroDataUrl,
  type StoredSuperheroResult,
} from './superhero-supabase-storage.js';

export type SuperheroImageJobProcessOutcome = 'completed' | 'failed' | 'skipped' | 'lost_race';

export async function processSuperheroImageJob(jobId: string): Promise<SuperheroImageJobProcessOutcome> {
  const databaseUrl = process.env.NEON_DATABASE_URL;
  if (!databaseUrl) {
    console.error('superhero-image-job-runner: NEON_DATABASE_URL not configured');
    return 'failed';
  }

  const sql = neon(databaseUrl);

  const jobRows = await sql`
    SELECT id, user_id, student_lesson_id, status, input_json
    FROM superhero_image_jobs
    WHERE id = ${jobId}
  `;

  const job = jobRows[0] as
    | {
        id: string;
        user_id: string | null;
        student_lesson_id: string | null;
        status: string;
        input_json: unknown;
      }
    | undefined;

  if (!job) {
    console.warn('superhero-image-job-runner: job not found', { jobId });
    return 'skipped';
  }

  if (job.status !== 'processing') {
    console.log('superhero-image-job-runner: skip — already handled', {
      jobId,
      status: job.status,
    });
    return 'skipped';
  }

  const claimed = await sql`
    UPDATE superhero_image_jobs
    SET status = 'generating', updated_at = NOW()
    WHERE id = ${jobId} AND status = 'processing'
    RETURNING id
  `;

  if (claimed.length === 0) {
    console.log('superhero-image-job-runner: lost race', { jobId });
    return 'lost_race';
  }

  try {
    console.log('superhero-image-job-runner: starting pipeline', { jobId });
    const bundle = await loadBundleForSuperheroImageJob(sql, job);
    const result = await runSuperheroImagePipeline(bundle);

    const input = (job.input_json || {}) as Partial<SuperheroImageJobInput>;
    const selfieStoragePath =
      typeof input.selfie_storage_path === 'string' ? input.selfie_storage_path : null;
    if (!selfieStoragePath) {
      throw new Error('Job is missing selfie storage path');
    }

    const portraitPath = superheroPortraitPath(jobId);
    await uploadSuperheroDataUrl(portraitPath, result.image_data_url);

    const storedResult: StoredSuperheroResult = {
      job_id: jobId,
      portrait_storage_path: portraitPath,
      selfie_storage_path: selfieStoragePath,
      model: result.model,
      generation_method: result.generation_method,
      prompt_used: result.prompt_used,
      facial_features: result.facial_features,
      look_design: result.look_design,
      why_chosen: result.why_chosen,
    };

    await sql`
      UPDATE superhero_image_jobs
      SET
        status = 'completed',
        result_json = ${JSON.stringify(storedResult)}::jsonb,
        error = NULL,
        updated_at = NOW()
      WHERE id = ${jobId}
    `;

    console.log('superhero-image-job-runner: completed', {
      jobId,
      method: result.generation_method,
      model: result.model,
    });
    return 'completed';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image generation failed';
    console.error('superhero-image-job-runner: failed', { jobId, message, error });
    await sql`
      UPDATE superhero_image_jobs
      SET
        status = 'failed',
        error = ${message},
        updated_at = NOW()
      WHERE id = ${jobId}
    `;
    return 'failed';
  }
}

export function superheroImageProcessFunctionName(): string {
  return process.env.NETLIFY_DEV === 'true'
    ? 'superhero-image-process'
    : 'run-superhero-image-background';
}

export function superheroImageProcessUrl(baseUrl: string): string {
  const fn = superheroImageProcessFunctionName();
  return `${String(baseUrl).replace(/\/$/, '')}/.netlify/functions/${fn}`;
}
