import * as heuristics from "../utils/heuristicEngine.js";

/**
 * mappingService — computes the column -> CRM field mapping hint.
 *
 * This is deliberately LOCAL and instant (no API call): the mapping is only a
 * hint that we feed into the single extraction call in aiService, and it powers
 * the "detected columns" display in the UI. Keeping it local means the whole
 * import is exactly one AI request per batch, not two.
 */
class MappingService {
  /**
   * Detect CRM schema mapping from headers.
   */
  detectSchema(headers: string[]): {
    mapping: Record<string, string>;
    source: string;
  } {
    if (!headers || headers.length === 0)
      return { mapping: {}, source: "empty" };
    return { mapping: heuristics.detectMapping(headers), source: "local" };
  }
}

export default new MappingService();
