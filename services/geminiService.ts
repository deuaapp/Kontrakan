
import { GoogleGenAI } from "@google/genai";
import { AppData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const getSmartAnalysis = async (data: AppData) => {
  try {
    const prompt = `
      Anda adalah asisten manajer properti pintar. 
      Berikut adalah data kontrakan saat ini:
      Unit: ${JSON.stringify(data.units)}
      Penyewa: ${JSON.stringify(data.tenants)}
      Pembayaran: ${JSON.stringify(data.payments)}

      Tugas:
      1. Identifikasi penyewa yang belum membayar penuh (cicilan belum lunas) atau telat (berdasarkan tanggal hari ini: ${new Date().toISOString().split('T')[0]}).
      2. Berikan ringkasan pendapatan bulan ini.
      3. Berikan saran tindak lanjut untuk penyewa tertentu.
      4. Buatkan draf pesan WhatsApp pengingat bayar yang sopan namun tegas untuk penyewa yang menunggak.

      Format jawaban: Gunakan Markdown yang rapi dengan heading dan poin-poin.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text;
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return "Maaf, gagal menganalisis data saat ini. Silakan coba lagi nanti.";
  }
};
