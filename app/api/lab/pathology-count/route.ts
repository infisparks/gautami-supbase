import { NextRequest, NextResponse } from 'next/server'

function formatDateToDMy(dateInput: string): string {
  const date = new Date(dateInput)
  const day = date.getDate()
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  return `${day}-${month}-${year}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { date?: string; hospital?: string }
    const isoDate = body?.date || new Date().toISOString().slice(0, 10)
    const hospitalName = body?.hospital || process.env.LAB_HOSPITAL_NAME || ''

    if (!hospitalName) {
      return NextResponse.json({ error: 'LAB_HOSPITAL_NAME is not configured' }, { status: 500 })
    }

    const apiBaseUrl = process.env.LAB_API_URL || 'https://labapi.infispark.in'
    const apiKey = process.env.LAB_API_KEY || process.env.LAB_API_ANON_KEY
    const bearer = process.env.LAB_API_BEARER || apiKey

    if (!apiKey || !bearer) {
      return NextResponse.json({ error: 'LAB_API credentials are not configured' }, { status: 500 })
    }

    const formatted = formatDateToDMy(isoDate)
    const url = `${apiBaseUrl}/rest/v1/rpc/get_registration_count`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${bearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_date: formatted, p_hospital: hospitalName })
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json({ error: 'Failed to fetch pathology count', details: errorText }, { status: response.status })
    }

    let count: number = 0
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const data = await response.json()
      if (typeof data === 'number') {
        count = data
      } else if (Array.isArray(data) && typeof data[0] === 'number') {
        count = data[0]
      } else if (data && typeof data.count === 'number') {
        count = data.count
      } else {
        // last resort: try to coerce a primitive value
        count = Number(data)
      }
    } else {
      const text = await response.text()
      const coerced = Number(text)
      count = Number.isFinite(coerced) ? coerced : 0
    }

    return NextResponse.json({ count })
  } catch (error: any) {
    return NextResponse.json({ error: 'Unexpected error', details: error?.message || String(error) }, { status: 500 })
  }
}

