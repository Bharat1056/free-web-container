import { NextResponse } from "next/server";

export async function GET() {
  try {
    return NextResponse.json({ message: "Healthy" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: "unhealthy" }, { status: 503 });
  }
}
