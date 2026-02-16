# MedAssist - Egypt's Digital Health Platform

**Phase 1: Manual Entry MVP**

## 🎯 Project Overview

MedAssist is a doctor-led digital health record and clinical operations platform designed specifically for the Egypt healthcare market. Phase 1 focuses on **highly optimized structured manual entry** to establish behavioral foundations before introducing AI in later phases.

### Core Value Propositions

- **For Doctors**: Clinical documentation faster than paper (≤45 seconds target)
- **For Patients**: Centralized health records with medication reminders
- **For Clinics**: Administrative burden reduction via front desk accounts

## 🏗️ Architecture

**Stack:**
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS with custom design system
- **Database**: Supabase (PostgreSQL + Auth + Realtime)
- **UI Components**: shadcn/ui + Radix UI
- **State**: Zustand (minimal client state)
- **Search**: Fuse.js (ICD-10 and drug autocomplete)

**Design Pattern**: Modular Monolithic
- Clean separation between UI, business logic, and data layers
- Role-based route groups for Doctor/Patient/Front Desk
- Server-first architecture with client interactivity where needed

## 📁 Project Structure

```
medassist/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth pages (login, register)
│   ├── (doctor)/                 # Doctor dashboard & features
│   ├── (patient)/                # Patient dashboard & features
│   ├── (frontdesk)/              # Front desk scheduling
│   ├── globals.css               # Global styles
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Landing page
├── components/
│   ├── ui/                       # shadcn/ui base components
│   ├── forms/                    # Clinical forms, chips, autocomplete
│   ├── layouts/                  # Role-specific layouts
│   └── shared/                   # Cross-role components
├── lib/
│   ├── supabase/                 # Supabase clients & types
│   ├── data/                     # Data access layer
│   ├── auth/                     # Role-based auth logic
│   ├── analytics/                # Event tracking
│   └── utils/                    # Helper functions
├── data/
│   ├── icd10/                    # Static ICD-10 database
│   ├── drugs/                    # Egypt drug database
│   └── templates/                # Specialty templates (JSON)
├── supabase/
│   ├── migrations/               # DB schema migrations
│   └── seed.sql                  # Initial data
└── public/                       # Static assets
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account (free tier works)
- (Optional) Twilio account for SMS

### Installation

1. **Clone and install dependencies**
   ```bash
   git clone <repository>
   cd medassist
   npm install
   ```

2. **Set up Supabase**
   
   Follow the comprehensive guide in [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md)
   
   Quick steps:
   - Create Supabase project
   - Copy credentials to `.env.local`
   - Run migration: `supabase/migrations/001_initial_schema.sql`
   - Seed templates: `supabase/seed.sql`

3. **Configure environment**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your Supabase credentials
   ```

4. **Run development server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000)

## 🎨 Design System

### Color Palette

**Role-Based Colors:**
- **Doctor (Primary Blue)**: `#2563EB` - Trust, medical authority
- **Patient (Secondary Red)**: `#EF4444` - Care, attention, reminders
- **Front Desk (Accent Purple)**: `#8B5CF6` - Administrative operations

**System Colors:**
- **Success**: `#10B981` - Medication accepted, sync complete
- **Warning**: `#F59E0B` - Pending actions
- **Neutral Grays**: `#F9FAFB` to `#111827`

### Typography

- **Font Family**: Arial (universal support in Egypt)
- **Heading Sizes**: 36px (H1), 28px (H2), 24px (H3)
- **Body**: 16px default

## 📊 Database Schema

### Core Tables

- **users**: Unified auth (phone, email, role)
- **doctors**: Doctor profiles (specialty, unique_id)
- **patients**: Patient profiles (unique_id, registered status)
- **clinics**: Clinic information
- **clinic_doctors**: Many-to-many clinic-doctor relationships
- **appointments**: Scheduling with overlap detection
- **clinical_notes**: Structured documentation
- **medication_reminders**: Patient handshake workflow
- **messages**: Doctor-patient chat
- **templates**: Specialty-specific templates
- **doctor_templates**: Saved/favorite templates
- **analytics_events**: UX telemetry

See full schema in `supabase/migrations/001_initial_schema.sql`

## 🔐 Security & RLS

**Row Level Security (RLS) enforced on all tables:**

- Front desk accounts **cannot access**:
  - Clinical notes
  - Diagnoses
  - Medications
  - Messages
  
- Doctors can only access:
  - Their own clinical notes
  - Their appointments
  - Messages with their patients

- Patients can only access:
  - Their own data
  - Notes explicitly synced by doctors

## 📈 Analytics & UX Benchmarks

**Release Gates (Non-negotiable):**
- ✅ Session completion ≤ 45 seconds (median)
- ✅ Keystrokes per visit ≤ 10 (excluding free text)
- ✅ One-screen completion for ≥80% of visits
- ✅ Chip usage in ≥70% of sessions

See `Med_Assist_Analytics_Specification___Section_13_Ux_Metrics.docx` for full metrics.

## 🧪 Testing Strategy

**Phase 1 Focus:**
- Manual QA for critical paths
- TypeScript for type safety
- Supabase RLS policy testing
- Performance monitoring (session duration)

**Future Phases:**
- Unit tests (Vitest)
- E2E tests (Playwright)
- Load testing

## 🛣️ Development Roadmap

### ✅ Gate 1: Foundation (COMPLETE)
- [x] Next.js project scaffolding
- [x] Tailwind CSS with design system
- [x] Database schema design
- [x] Supabase setup documentation
- [x] Specialty templates (4 specialties)

### 🚧 Gate 2: Auth & Data Model (NEXT)
- [ ] Supabase auth integration
- [ ] Role selection flow
- [ ] User registration (doctor/patient)
- [ ] Clinic account creation
- [ ] RLS policy testing

### 🔜 Gate 3: Doctor Core Feature
- [ ] Clinical session form
- [ ] Template loading
- [ ] Chip-based entry
- [ ] ICD-10 autocomplete
- [ ] Drug autocomplete
- [ ] Save & sync logic
- [ ] Analytics tracking

### 🔜 Gate 4: Patient & Front Desk
- [ ] Patient medication acceptance
- [ ] Dashboard
- [ ] Front desk appointment booking
- [ ] Schedule management

### 🔜 Gate 5: Polish & Launch
- [ ] Messaging system
- [ ] Notifications
- [ ] Analytics dashboard (admin)
- [ ] Performance optimization
- [ ] Deployment

## 📝 Key Documents

- **PRD**: `Med_Assist_Phase_1_Prd___Updated__egypt_Market__Doctor-led__Clinic-ready_.docx`
- **UX Metrics**: `Med_Assist_Analytics_Specification___Section_13_Ux_Metrics.docx`
- **Vibe Coding Prompt**: Original engineering guidelines
- **Supabase Setup**: `SUPABASE_SETUP.md`

## 🤝 Contributing

**Vibe Coding Principles:**
1. PRD is the single source of truth
2. No guessing on missing requirements
3. Build iteratively, pause at gates
4. Boring, readable solutions over clever abstractions
5. Performance benchmarks are non-negotiable

## 📄 License

Proprietary - MedAssist Egypt

---

**Built with discipline. Shipped with care.** 🚀
