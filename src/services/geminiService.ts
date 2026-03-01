import { GoogleGenAI, Type } from "@google/genai";
import { PayrollRecord } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const payrollSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      serial_no: { type: Type.STRING },
      activity: { type: Type.STRING },
      duration: { type: Type.STRING },
      name: { type: Type.STRING },
      working_hours: { type: Type.NUMBER },
      total_days: { type: Type.NUMBER },
      rate: { type: Type.NUMBER },
      meal_allowance: { type: Type.NUMBER },
      total: { type: Type.NUMBER },
      net_pay: { type: Type.NUMBER },
      advance: { type: Type.NUMBER },
      balance: { type: Type.NUMBER },
    },
    required: ["name", "total", "balance"],
  },
};

export async function extractPayrollFromImage(base64Image: string): Promise<PayrollRecord[]> {
  const model = "gemini-3-flash-preview";
  
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image.split(",")[1] || base64Image,
            },
          },
          {
            text: "Extract all payroll/work log records from this image. The table has columns for Serial No, Activity, Duration, Name, Working Hours, Total Days, Rate, Meal Allowance, Total, Net Pay, Advance, and Balance. Return the data as a JSON array.",
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: payrollSchema,
    },
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return [];
  }
}
