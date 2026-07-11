import Papa from "papaparse";

/**
 * csvService — all raw-CSV concerns live here (parsing, preview shaping,
 * sampling). Keeps the controller thin and the AI services CSV-agnostic.
 */
class CSVService {
  /**
   * Parse a raw CSV string into headers + row objects.
   */
  parse(csvText: string): { headers: string[]; rows: any[]; warnings: any[] } {
    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h: string) => (h || "").trim(),
    });

    const rows = Array.isArray(parsed.data) ? parsed.data : [];
    const headers =
      rows.length > 0
        ? Object.keys(rows[0] as object)
        : parsed.meta?.fields || [];

    return { headers, rows, warnings: parsed.errors || [] };
  }

  /**
   * Build a lightweight preview payload for the upload step (no AI).
   */
  buildPreview(csvText: string, previewLimit = 50) {
    const { headers, rows, warnings } = this.parse(csvText);
    return {
      headers,
      previewRows: rows.slice(0, previewLimit),
      totalRows: rows.length,
      warnings: warnings.slice(0, 5),
    };
  }

  /**
   * Take a representative sample of rows for schema detection (stage 1).
   * Grabs from the top so headers with sparse data still surface examples.
   */
  sampleRows(rows: any[], sampleSize = 3): any[] {
    return rows.slice(0, sampleSize);
  }
}

export default new CSVService();
