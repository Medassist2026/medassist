# MedAssist Supabase Setup Guide

## 1. Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Click "New Project"
3. Fill in:
   - **Project name**: `medassist-egypt`
   - **Database password**: (Generate strong password - save it!)
   - **Region**: Choose closest to Egypt (e.g., `eu-central-1` or `ap-south-1`)
4. Click "Create new project"
5. Wait 2-3 minutes for provisioning

## 2. Get API Credentials

Once project is created:

1. Go to **Settings** → **API**
2. Copy the following values:

```bash
# Project URL
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co

# Anon/Public Key (safe for client-side)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Service Role Key (NEVER expose to client - server only!)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

3. Create `.env.local` file in project root:

```bash
cp .env.example .env.local
# Then paste your actual values
```

## 3. Run Database Migrations

### Option A: Using Supabase SQL Editor (Recommended for Phase 1)

1. Go to **SQL Editor** in Supabase Dashboard
2. Click "New query"
3. Copy the entire contents of `/supabase/migrations/001_initial_schema.sql`
4. Paste and click "Run"
5. Verify no errors in output

### Option B: Using Supabase CLI (Advanced)

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

## 4. Verify Database Setup

Run this query in SQL Editor to check tables:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

You should see:
- analytics_events
- appointments
- clinic_doctors
- clinics
- clinical_notes
- doctor_templates
- doctors
- medication_reminders
- messages
- patients
- templates
- users

## 5. Seed Initial Data

### Seed Templates

1. Go to **SQL Editor**
2. Run the seed script from `/supabase/seed.sql`
3. This will populate the 4 specialty templates

### Create Test Accounts (Optional)

```sql
-- Test Doctor Account
INSERT INTO auth.users (id, email, phone, encrypted_password, email_confirmed_at)
VALUES (
  gen_random_uuid(),
  'doctor@test.com',
  '+201234567890',
  crypt('password123', gen_salt('bf')),
  now()
) RETURNING id;

-- Copy the returned ID and use it to create doctor profile
INSERT INTO users (id, phone, email, role)
VALUES ('paste-uuid-here', '+201234567890', 'doctor@test.com', 'doctor');

INSERT INTO doctors (id, unique_id, specialty)
VALUES ('paste-uuid-here', 'DR001', 'general-practitioner');
```

## 6. Configure Row Level Security (RLS)

The migration file already includes RLS policies, but verify:

1. Go to **Authentication** → **Policies**
2. You should see policies for each table
3. Test by logging in with test account

## 7. Enable Realtime (for messaging)

1. Go to **Database** → **Replication**
2. Find the `messages` table
3. Enable "Realtime" toggle
4. This allows instant message delivery

## 8. Configure Auth Settings

### Email Auth (Primary)

1. Go to **Authentication** → **Providers**
2. Ensure "Email" is enabled
3. Disable email confirmation for MVP:
   - **Settings** → **Auth** → **Email Auth**
   - Uncheck "Enable email confirmations"
   - Click "Save"

### Phone Auth (For Egypt market)

1. **Authentication** → **Providers** → **Phone**
2. Enable "Phone"
3. SMS Provider: Twilio
4. Enter Twilio credentials (when available)

## 9. Environment Variables Checklist

In your `.env.local`:

```bash
✅ NEXT_PUBLIC_SUPABASE_URL
✅ NEXT_PUBLIC_SUPABASE_ANON_KEY
✅ SUPABASE_SERVICE_ROLE_KEY
⚠️  TWILIO_ACCOUNT_SID (optional Phase 1)
⚠️  TWILIO_AUTH_TOKEN (optional Phase 1)
⚠️  TWILIO_PHONE_NUMBER (optional Phase 1)
```

## 10. Test Connection

Run the app:

```bash
npm install
npm run dev
```

Open browser console and run:

```javascript
const supabase = createClient()
const { data, error } = await supabase.from('users').select('count')
console.log('Connected:', !error)
```

## Troubleshooting

### "Failed to fetch" error
- Check if project URL is correct
- Verify project is not paused (free tier pauses after inactivity)

### "JWT expired" error
- Regenerate anon key from Settings → API
- Update .env.local

### RLS policy errors
- Check if policies were created correctly
- Use service role key for admin operations

### Migration fails
- Check for syntax errors in SQL
- Run migrations one table at a time
- Check Supabase logs: Settings → Logs

## Next Steps

Once Supabase is set up:

1. ✅ Run `npm run dev`
2. ✅ Test auth flow
3. ✅ Create first doctor account
4. ✅ Verify templates are loaded
5. ✅ Test RBAC policies

---

## Security Checklist

- [ ] Service role key is NOT in client-side code
- [ ] RLS policies are enabled on all tables
- [ ] Email confirmation is disabled for MVP
- [ ] Database password is stored securely
- [ ] `.env.local` is in `.gitignore`

---

**You're ready to build!** 🚀
