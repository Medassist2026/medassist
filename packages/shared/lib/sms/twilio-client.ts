const TWILIO_API_URL = 'https://api.twilio.com/2010-04-01'

interface SMSResult {
  success: boolean
  sid?: string
  error?: string
}

export async function sendSMS(to: string, body: string): Promise<SMSResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    console.warn('Twilio not configured, SMS stubbed')
    return { success: true, sid: `stub_${Date.now()}` }
  }

  try {
    const response = await fetch(
      `${TWILIO_API_URL}/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: to,
          From: fromNumber,
          Body: body,
        }).toString(),
      }
    )

    const data = await response.json() as any

    if (response.ok) {
      return { success: true, sid: data.sid }
    }

    return { success: false, error: data.message || 'SMS send failed' }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

// Send WhatsApp message via Twilio
export async function sendWhatsApp(to: string, body: string): Promise<SMSResult> {
  return sendSMS(`whatsapp:${to}`, body)
}
