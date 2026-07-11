import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import importRoutes from "./routes/importRoutes.js";

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for frontend requests
app.use(
  cors({
    origin: "*", // Allow all origins for simplicity in development and review
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-gemini-key"],
  }),
);

// Parse JSON and URL-encoded payloads
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Route mounts
app.use("/api", importRoutes);

// Health Check Endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    apiConfigured: {
      gemini: !!process.env.GEMINI_API_KEY,
    },
    engine: process.env.GEMINI_API_KEY
      ? process.env.GEMINI_MODEL || "gemini-2.5-flash"
      : "local-pattern-engine",
  });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Unhandled Server Error:", err);

  // Check if response has already headers sent (in case error occurs during SSE stream)
  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
  });
});

// Start the server
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`  GrowEasy CSV Importer Server started!`);
    console.log(`  Listening on port: ${PORT}`);
    console.log(`  URL: http://localhost:${PORT}`);
    console.log(`===============================================`);
  });
}

export default app; // For testing
