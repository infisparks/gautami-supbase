import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { p_date } = await req.json();

  try {
    const response = await fetch(
      "https://labapi.infispark.in/rest/v1/rpc/get_registration_count_xray",
      {
        method: "POST",
        headers: {
          apikey: process.env.LAB_API_KEY as string,
          Authorization: process.env.LAB_API_KEY as string,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_date, p_hospital: process.env.LAB_HOSPITAL_NAME }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Error from external API:", errorData);
      return NextResponse.json(
        { message: "Error fetching X-ray count", error: errorData },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Internal server error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}