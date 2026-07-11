import request from "supertest";
import app from "../src/server.js";
import AIService from "../src/services/aiService.js";
import * as heuristics from "../src/utils/heuristicEngine.js";

describe("AI CSV Importer Backend Tests", () => {
  beforeAll(() => {
    delete process.env.GEMINI_API_KEY;
  });
  describe("Local pattern engine — mapping", () => {
    it("maps a clean lead row across renamed columns", () => {
      const rows = [
        {
          "Full Name": "Jane Doe",
          "E-mail Address": "jane.doe@example.com",
          "Phone Number": "+91 98765 43210",
          "Company Name": "GrowEasy Inc",
          "City Location": "Mumbai",
          "Status Field": "Sale Done",
          "Lead Source": "Meridian Tower",
        },
      ];

      const [rec] = heuristics.extractBatch(rows);
      expect(rec.status).toBe("success");
      expect(rec.data.name).toBe("Jane Doe");
      expect(rec.data.email).toBe("jane.doe@example.com");
      expect(rec.data.mobile_without_country_code).toBe("9876543210");
      expect(rec.data.country_code).toBe("+91");
      expect(rec.data.company).toBe("GrowEasy Inc");
      expect(rec.data.city).toBe("Mumbai");
      expect(rec.data.crm_status).toBe("SALE_DONE");
      expect(rec.data.data_source).toBe("meridian_tower");
      expect(rec.confidence).toBeGreaterThanOrEqual(70);
    });

    it("finds contacts by VALUE even when the column name is meaningless", () => {
      // No "email"/"phone" in the headers at all.
      const rows = [
        {
          Person: "John Smith",
          col_a: "reach me at john@company.io",
          col_b: "9988776655",
        },
      ];
      const [rec] = heuristics.extractBatch(rows);
      expect(rec.status).toBe("success");
      expect(rec.data.email).toBe("john@company.io");
      expect(rec.data.mobile_without_country_code).toBe("9988776655");
    });

    it("merges first/last name columns into one name", () => {
      const rows = [
        { first_name: "Priya", last_name: "Singh", mobile: "9876543210" },
      ];
      const [rec] = heuristics.extractBatch(rows);
      expect(rec.data.name).toBe("Priya Singh");
    });

    it("splits an embedded country code from the number", () => {
      const rows = [{ name: "Raj", phone: "919812345678" }];
      const [rec] = heuristics.extractBatch(rows);
      expect(rec.data.country_code).toBe("+91");
      expect(rec.data.mobile_without_country_code).toBe("9812345678");
    });
  });

  describe("Local pattern engine — skip logic", () => {
    it("skips a row with neither email nor mobile", () => {
      const rows = [
        { "Full Name": "No Contact", Company: "GrowEasy", City: "Delhi" },
      ];
      const [rec] = heuristics.extractBatch(rows);
      expect(rec.status).toBe("skipped");
      expect(rec.reason).toContain("No email or mobile number found");
      expect(rec.confidence).toBe(100);
    });
  });

  describe("Local pattern engine — multiple contacts", () => {
    it("keeps the first email/mobile and moves extras to crm_note", () => {
      const rows = [
        {
          Name: "Double Contact",
          Email: "first@example.com",
          "Secondary Email": "second@example.com",
          Mobile: "9876543210",
          "Alt Mobile": "9123456780",
        },
      ];
      const [rec] = heuristics.extractBatch(rows);
      expect(rec.status).toBe("success");
      expect(rec.data.email).toBe("first@example.com");
      expect(rec.data.mobile_without_country_code).toBe("9876543210");
      expect(rec.data.crm_note).toContain("second@example.com");
      expect(rec.data.crm_note).toContain("9123456780");
    });
  });

  describe("Status & source synonym mapping", () => {
    it("normalizes messy status wording to the CRM enums", () => {
      expect(heuristics.mapStatus("Booking Done")).toBe("SALE_DONE");
      expect(heuristics.mapStatus("No Answer, will call back")).toBe(
        "DID_NOT_CONNECT",
      );
      expect(heuristics.mapStatus("Junk / not interested")).toBe("BAD_LEAD");
      expect(heuristics.mapStatus("Hot lead")).toBe("GOOD_LEAD_FOLLOW_UP");
      expect(heuristics.mapStatus("random text")).toBe("");
    });
  });

  describe("aiService fallback", () => {
    it("exposes the heuristic path when no LLM key is set", () => {
      const rows = [
        { Name: "Alice", Email: "alice@example.com", Phone: "9876543210" },
      ];
      const out = AIService.processBatchHeuristics(rows);
      expect(out).toHaveLength(1);
      expect(out[0].data.name).toBe("Alice");
    });
  });

  describe("API Endpoints", () => {
    it("returns health status", async () => {
      const res = await request(app).get("/health");
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("status", "healthy");
      expect(res.body).toHaveProperty("apiConfigured");
    });

    it("previews an uploaded CSV without running AI", async () => {
      const csvText = "Name,Email,Phone\nAlice,alice@example.com,9876543210";
      const res = await request(app).post("/api/upload").send({ csvText });
      expect(res.statusCode).toBe(200);
      expect(res.body.headers).toEqual(["Name", "Email", "Phone"]);
      expect(res.body.totalRows).toBe(1);
    });

    it("rejects import when no file or text is sent", async () => {
      const res = await request(app).post("/api/import");
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("streams SSE events: mapping -> start -> batch -> complete", async () => {
      const csvText =
        "Name,Email,Phone,Company\nAlice,alice@example.com,9876543210,GrowEasy\nBob,,,NoContactCo";
      const res = await request(app).post("/api/import").send({ csvText });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/event-stream");

      const events = res.text
        .split("\n\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l.replace("data: ", "")));

      const types = events.map((e) => e.type);
      expect(types).toContain("mapping");
      expect(types).toContain("start");
      expect(types).toContain("batch");
      expect(types).toContain("complete");

      const start = events.find((e) => e.type === "start");
      expect(start.totalRecords).toBe(2);

      const batch = events.find((e) => e.type === "batch");
      expect(batch.success).toBe(true);
      expect(batch.data).toHaveLength(2);
      expect(batch.data[0].status).toBe("success");
      expect(batch.data[0].data.name).toBe("Alice");
      expect(typeof batch.data[0].confidence).toBe("number");
      expect(batch.data[1].status).toBe("skipped");
    });
  });
});
