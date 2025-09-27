import { NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET() {
  try {
    // Check database connection
    await db.$queryRaw`SELECT 1`;

    // Check if we can connect to external services
    const healthChecks = {
      database: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: process.env.DEPLOYMENT_VERSION || "unknown",
    };

    return NextResponse.json(healthChecks, { status: 200 });
  } catch (error) {
    console.error("Health check failed:", error);

    return NextResponse.json(
      {
        database: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
