declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_SUPABASE_URL: string
      NEXT_PUBLIC_SUPABASE_ANON_KEY: string
      SUPABASE_SERVICE_ROLE_KEY: string
      TWILIO_ACCOUNT_SID?: string
      TWILIO_AUTH_TOKEN?: string
      TWILIO_PHONE_NUMBER?: string
    }
  }
}

export {}
