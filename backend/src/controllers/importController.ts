import { Request, Response } from 'express';
import csvService from '../services/csvService.js';
import mappingService from '../services/mappingService.js';
import aiService from '../services/aiService.js';
import * as llm from '../utils/llmClient.js';

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '25', 10);

/**
 * ImportController — orchestrates the import and streams progress over SSE.
 * No business logic beyond wiring services together + progress plumbing.
 */
class ImportController {
  /**
   * POST /api/upload — parse a CSV and return a preview. NO AI here.
   */
  async uploadPreview(req: Request, res: Response): Promise<Response | void> {
    const csvData = ImportController.extractCSV(req);
    if (!csvData) return res.status(400).json({ error: 'No CSV file or text provided' });
    if (!csvData.trim()) return res.status(400).json({ error: 'CSV data is empty' });

    const preview = csvService.buildPreview(csvData, 50);
    if (!preview.headers.length) {
      return res.status(422).json({ error: 'Could not detect any columns in this CSV' });
    }
    return res.json(preview);
  }

  /**
   * POST /api/import — extraction streamed over SSE with live progress.
   */
  async importLeads(req: Request, res: Response): Promise<void> {
    const csvData = ImportController.extractCSV(req);
    if (!csvData) {
      res.status(400).json({ error: 'No CSV file or text provided' });
      return;
    }
    if (!csvData.trim()) {
      res.status(400).json({ error: 'CSV data is empty' });
      return;
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    const send = (payload: any) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

    const { headers, rows } = csvService.parse(csvData);
    if (!rows.length) {
      send({ type: 'error', message: 'No valid records found in CSV' });
      res.end();
      return;
    }

    const apiKey = req.headers['x-gemini-key'] as string | undefined;

    // Column mapping hint (local, instant) — powers the UI + the single AI call.
    const { mapping, source } = mappingService.detectSchema(headers);
    send({ type: 'mapping', mapping, source, engine: llm.isConfigured(apiKey) ? llm.model : 'local-pattern-engine' });

    const totalRecords = rows.length;
    const totalBatches = Math.ceil(totalRecords / BATCH_SIZE);
    send({ type: 'start', totalRecords, totalBatches, batchSize: BATCH_SIZE });

    let processedRecords = 0;

    for (let i = 0; i < totalBatches; i++) {
      const batch = rows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
      const batchStartRecords = processedRecords;
      const batchEndRecords = batchStartRecords + batch.length;

      // Heartbeat: while this batch's (atomic) AI call is in flight, ease the
      // reported progress from the batch start toward — but never reaching —
      // the batch end, so the bar keeps visibly moving instead of sitting still.
      let eased = batchStartRecords;
      const heartbeat = setInterval(() => {
        const gap = batchEndRecords - 0.5 - eased;
        if (gap > 0) eased += gap * 0.18; // asymptotic approach to the boundary
        send({
          type: 'progress',
          batchIndex: i,
          processedRecords: Math.min(Math.round(eased), batchEndRecords - 1),
          totalRecords,
          totalBatches,
        });
      }, 600);

      try {
        console.log(`[import] batch ${i + 1}/${totalBatches} (${batch.length} rows)…`);
        const data = await aiService.processBatch(batch, mapping, apiKey);
        clearInterval(heartbeat);
        processedRecords = batchEndRecords;
        send({ type: 'batch', batchIndex: i, success: true, data, processedRecords, totalRecords });
      } catch (err: any) {
        clearInterval(heartbeat);
        console.error(`[import] batch ${i + 1} failed after retries:`, err.message);
        const data = batch.map((row) => ({
          status: 'skipped',
          reason: `AI processing failed: ${err.message}`,
          confidence: 0,
          data: {},
          rawData: row,
        }));
        processedRecords = batchEndRecords;
        send({ type: 'batch', batchIndex: i, success: false, error: err.message, data, processedRecords, totalRecords });
      }
    }

    send({ type: 'complete', processedRecords, totalRecords });
    res.end();
  }

  /** Pull CSV text from an uploaded file or a JSON body. */
  static extractCSV(req: Request): string | null {
    if (req.file) return req.file.buffer.toString('utf8');
    if (req.body && req.body.csvText) return req.body.csvText as string;
    return null;
  }
}

export default new ImportController();
