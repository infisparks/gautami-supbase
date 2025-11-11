import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const pdfFile = formData.get('pdfFile') as Blob | null;
    const caption = formData.get('caption') as string | null;
    const filename = formData.get('filename') as string | null; // Get filename from FormData as well

    if (!pdfFile || !caption || !filename) {
      return NextResponse.json({ message: 'Missing required fields.' }, { status: 400 });
    }

    // Convert Blob to Buffer for Supabase upload
    const decodedPdf = Buffer.from(await pdfFile.arrayBuffer());

    // 2. Upload to Supabase bucket
    const { data, error: uploadError } = await supabase.storage
      .from('dpr-documents') // Changed to new bucket
      .upload(`dpr/${filename}`, decodedPdf, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return NextResponse.json({ message: `Failed to upload PDF: ${uploadError.message}` }, { status: 500 });
    }

    // 3. Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('dpr-documents') // Changed to new bucket
      .getPublicUrl(data.path);

    const pdfUrl = publicUrlData.publicUrl; // Renamed for clarity

    if (!pdfUrl) {
      return NextResponse.json({ message: 'Failed to get public URL for PDF.' }, { status: 500 });
    }

    // 4. [START] UPDATED WHATSAPP API CALL
    const whatsappApiUrl = 'https://evo.infispark.in/message/sendMedia/medfordlab'; // New URL
    // IMPORTANT: Use a server-side environment variable (e.g., in .env.local)
    // Do NOT expose this key with NEXT_PUBLIC_
    const apiKey =  "4nAJab0oyVlworJu1veRaGfmvkO0yxf2"; 
    const recipientNumber = '918907866786'; // Your provided number

    // New payload structure for documents
    const whatsappPayload = {
      number: recipientNumber,
      mediatype: "document",
      mimetype: "application/pdf",
      caption: caption,
      media: pdfUrl, // The public Supabase URL
      fileName: filename, // The filename from FormData
    };

    const whatsappRes = await fetch(whatsappApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey // New header
      },
      body: JSON.stringify(whatsappPayload), // New payload
    });
    // [END] UPDATED WHATSAPP API CALL

    if (whatsappRes.ok) {
      const whatsappResult = await whatsappRes.json();
      return NextResponse.json({ message: 'DPR sent successfully to Meraj Sir!', whatsappResult }, { status: 200 });
    } else {
      // --- MODIFICATION START: Robust error handling ---
      let errorDetail = "Unknown API error";
      try {
        const errorData = await whatsappRes.json();
        console.error('WhatsApp API error (Full Response):', errorData); // Log the full object

        // Try to find a meaningful error message
        if (errorData.message) {
          errorDetail = errorData.message;
        } else if (errorData.error) {
          errorDetail = errorData.error;
        } else if (errorData.details) {
          errorDetail = errorData.details;
        } else {
          // Fallback to stringifying the whole object if no common key is found
          errorDetail = JSON.stringify(errorData); 
        }

      } catch (jsonError) {
        // If .json() fails, read the response as text (e.g., "401 Unauthorized" string)
        errorDetail = await whatsappRes.text();
        console.error('WhatsApp API error (Non-JSON Response):', errorDetail);
      }
      
      return NextResponse.json({ message: `Failed to send WhatsApp message: ${errorDetail}` }, { status: whatsappRes.status });
      // --- MODIFICATION END ---
    }
  } catch (error: any) {
    console.error('API route error:', error);
    return NextResponse.json({ message: `Internal server error: ${error.message}` }, { status: 500 });
  }
}