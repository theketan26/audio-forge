import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import dotenv from 'dotenv';
import path from 'node:path';
import { z } from 'zod';
import { NeonDatabaseService } from './db.js';
import { AudioForgeGenerator } from './generator.js';
import { ForgeConfigSchema, type ForgeConfig } from './types.js';

dotenv.config();

export function createApp() {
  const app = new Hono();
  const db = new NeonDatabaseService();
  const apiKey = process.env.API_KEY || 'forge-secret-key';

  // 1. Health check (public, no auth required)
  app.get('/health', c => {
    return c.json({
      status: 'ok',
      service: 'audio-forge-gateway',
      timestamp: new Date().toISOString(),
    });
  });

  // 2. Authentication Middleware for /api/*
  app.use('/api/*', async (c, next) => {
    const authHeader = c.req.header('x-api-key') || c.req.header('authorization');
    let providedKey = '';

    if (authHeader) {
      providedKey = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : authHeader.trim();
    }

    if (!providedKey || providedKey !== apiKey) {
      return c.json(
        {
          error: 'Unauthorized: Invalid or missing API key',
          message: 'Please provide valid x-api-key header or Authorization: Bearer <key>',
        },
        401
      );
    }

    await next();
  });

  // Batch segment schema for API requests
  const ApiBatchSegmentSchema = z.object({
    id: z.string().optional(),
    text: z.string().min(1, 'Segment text cannot be empty'),
    speaker_id: z.number().int().nonnegative().optional(),
    voice_name: z.string().optional(),
    features: z
      .object({
        length_scale: z.number().positive().optional(),
        noise_scale: z.number().nonnegative().optional(),
        noise_w: z.number().nonnegative().optional(),
        sentence_silence: z.number().nonnegative().optional(),
      })
      .optional(),
  });

  // Input schema for /api/v1/generate (supports single text OR batch segments)
  const GenerateRequestSchema = z
    .object({
      text: z.string().optional(),
      batch: z.array(ApiBatchSegmentSchema).optional(),
      voice: z.string().default('en_US-lessac-low'),
      speaker_id: z.number().int().nonnegative().default(0),
      features: z
        .object({
          length_scale: z.number().positive().default(1.0),
          noise_scale: z.number().nonnegative().default(0.667),
          noise_w: z.number().nonnegative().default(0.8),
          sentence_silence: z.number().nonnegative().default(0.2),
        })
        .default({}),
      output_filename: z.string().optional(),
      cloud: z
        .object({
          enabled: z.boolean().default(true),
          upload_audio: z.boolean().default(true),
          upload_report: z.boolean().default(true),
          clean_local_after_upload: z.boolean().default(true),
        })
        .default({}),
    })
    .refine(data => !!data.text || (data.batch && data.batch.length > 0), {
      message: 'Either "text" or "batch" must be provided in the request body.',
    });

  // 3. GENERATE AUDIO API (Async with immediate ACK)
  app.post('/api/v1/generate', async c => {
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON request body' }, 400);
    }

    let config: ForgeConfig;
    let fullText = '';
    let voiceName = 'en_US-lessac-low';
    let segmentsCount = 1;

    // Check if body is a simplified request (single text or batch)
    const simpleParsed = GenerateRequestSchema.safeParse(rawBody);
    if (simpleParsed.success) {
      const data = simpleParsed.data;
      if (data.batch && data.batch.length > 0) {
        fullText = data.batch.map(b => b.text).join(' ');
        segmentsCount = data.batch.length;
      } else {
        fullText = data.text || '';
        segmentsCount = 1;
      }
      voiceName = data.voice;
      const fileName = data.output_filename || `api_${Date.now()}_${Math.random().toString(36).substring(7)}.wav`;

      config = {
        version: '1.0',
        input: {
          text: data.text,
          batch: data.batch,
        },
        voice: {
          name: data.voice,
          speaker_id: data.speaker_id,
          features: {
            length_scale: data.features.length_scale,
            noise_scale: data.features.noise_scale,
            noise_w: data.features.noise_w,
            sentence_silence: data.features.sentence_silence,
          },
        },
        piper_config: {
          auto_download_voice: true,
          use_cuda: false,
        },
        output: {
          path: path.join('./output', fileName),
          format: 'wav',
        },
        monitor: {
          enabled: true,
          report_path: path.join('./output', `${fileName}.json`),
          sample_interval_ms: 50,
        },
        cloud: {
          enabled: data.cloud.enabled,
          table_name: process.env.DB_TABLE_NAME || 'audio_generations',
          upload_audio: data.cloud.upload_audio,
          upload_report: data.cloud.upload_report,
          clean_local_after_upload: data.cloud.clean_local_after_upload,
        },
      };
    } else {
      // Try full ForgeConfigSchema
      const fullParsed = ForgeConfigSchema.safeParse(rawBody);
      if (!fullParsed.success) {
        return c.json(
          {
            error: 'Validation failed',
            details: fullParsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
          },
          400
        );
      }
      config = fullParsed.data;
      fullText = config.input.text || config.input.batch?.map(b => b.text).join(' ') || '';
      voiceName = config.voice.name || 'en_US-lessac-low';
      segmentsCount = config.input.batch?.length || 1;
    }

    // 1. Create initial record in Neon DB with 'processing' status
    const initRes = await db.createInitialRecord({
      voice: voiceName,
      text_input: fullText,
      text_characters: fullText.length,
      text_words: fullText.trim().split(/\s+/).filter(Boolean).length,
      segments_count: segmentsCount,
      config,
    });

    if (initRes.error || !initRes.id) {
      return c.json({ error: `Failed to initialize generation job: ${initRes.error}` }, 500);
    }

    const generationId = initRes.id;

    // 2. Fire and forget background worker (async execution)
    (async () => {
      try {
        const generator = new AudioForgeGenerator();
        const { report, outputPath, cloudResult } = await generator.generate(config);

        // Update DB record on success
        await db.updateRecord(generationId, {
          status: 'success',
          audio_file_name: path.basename(outputPath),
          storage_key: cloudResult?.r2StorageKey || null,
          storage_uri: cloudResult?.r2StorageUri || null,
          audio_url: cloudResult?.r2SecureSignedUrl || null,
          report_url: cloudResult?.r2ReportSignedUrl || null,
          audio_duration_seconds: report.timing.audio_duration_seconds,
          synthesis_ms: report.timing.synthesis_ms,
          total_elapsed_ms: report.timing.total_elapsed_ms,
          real_time_factor: report.timing.real_time_factor_rtf,
          cpu_avg_percent: report.resources.cpu.avg_percent,
          cpu_peak_percent: report.resources.cpu.peak_percent,
          memory_peak_rss_mb: report.resources.memory.peak_rss_mb,
          memory_peak_vms_mb: report.resources.memory.peak_vms_mb,
          output_bytes: report.resources.io.output_bytes,
          sample_rate: report.resources.io.sample_rate,
          report,
        });
      } catch (err: any) {
        console.error(`Generation failed for ${generationId}:`, err);
        await db.updateRecord(generationId, {
          status: 'failed',
          error_message: err.message || String(err),
          report: err.report || {},
        });
      }
    })();

    // 3. Return immediate acknowledgment (ACK)
    return c.json(
      {
        status: 'processing',
        message: 'Audio generation job successfully started',
        id: generationId,
        task: {
          voice: voiceName,
          text_length: fullText.length,
        },
        status_url: `/api/v1/generations/${generationId}`,
      },
      202
    );
  });

  // 4. FETCH STATUS API (Single Generation Details)
  app.get('/api/v1/generations/:id', async c => {
    const id = c.req.param('id');
    const record = await db.getRecordById(id);

    if (!record) {
      return c.json({ error: 'Generation record not found', id }, 404);
    }

    if (record.status === 'processing') {
      return c.json({
        id: record.id,
        status: 'processing',
        message: 'Audio generation is currently in progress',
        created_at: record.created_at,
        task: {
          voice: record.voice,
          text_characters: record.text_characters,
          text_words: record.text_words,
          segments_count: record.segments_count,
        },
      });
    }

    if (record.status === 'failed') {
      return c.json({
        id: record.id,
        status: 'failed',
        error: record.error_message || 'Audio generation failed',
        created_at: record.created_at,
        report: record.report,
      });
    }

    // Success response with full DB details, monitoring stats, and R2 signed URL
    return c.json({
      id: record.id,
      status: 'success',
      created_at: record.created_at,
      task: {
        voice: record.voice,
        text_input: record.text_input,
        text_characters: record.text_characters,
        text_words: record.text_words,
        segments_count: record.segments_count,
      },
      storage: {
        file_name: record.audio_file_name,
        storage_key: record.storage_key,
        storage_uri: record.storage_uri,
        audio_url: record.audio_url,
        report_url: record.report_url,
      },
      timing: {
        synthesis_ms: Number(record.synthesis_ms),
        total_elapsed_ms: Number(record.total_elapsed_ms),
        audio_duration_seconds: Number(record.audio_duration_seconds),
        real_time_factor_rtf: Number(record.real_time_factor),
      },
      resources: {
        cpu_avg_percent: Number(record.cpu_avg_percent),
        cpu_peak_percent: Number(record.cpu_peak_percent),
        memory_peak_rss_mb: Number(record.memory_peak_rss_mb),
        memory_peak_vms_mb: Number(record.memory_peak_vms_mb),
        output_bytes: Number(record.output_bytes),
        sample_rate: record.sample_rate,
      },
      report: record.report,
    });
  });

  // 5. LIST API (Paginated list of audio generations)
  app.get('/api/v1/generations', async c => {
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '10', 10)));
    const offset = (page - 1) * limit;

    const { items, total } = await db.listRecords(limit, offset);
    const totalPages = Math.ceil(total / limit);

    return c.json({
      total,
      page,
      limit,
      total_pages: totalPages,
      items: items.map(item => ({
        id: item.id,
        created_at: item.created_at,
        status: item.status,
        voice: item.voice,
        text_snippet:
          item.text_input && item.text_input.length > 80
            ? `${item.text_input.substring(0, 80)}...`
            : item.text_input,
        audio_duration_seconds: item.audio_duration_seconds ? Number(item.audio_duration_seconds) : null,
        real_time_factor: item.real_time_factor ? Number(item.real_time_factor) : null,
        storage_uri: item.storage_uri,
        audio_url: item.audio_url,
      })),
    });
  });

  return app;
}

export function startServer(port = 3000) {
  const app = createApp();
  console.log(`Starting Audio Forge API Gateway on port ${port}...`);
  return serve({
    fetch: app.fetch,
    port,
  });
}

// Direct execution entrypoint
if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  const port = parseInt(process.env.PORT || '3000', 10);
  startServer(port);
  console.log(`⚡ Audio Forge API Gateway running at: http://localhost:${port}`);
  console.log(`🔑 Using API Key: ${process.env.API_KEY || 'forge-secret-key'}`);
}
