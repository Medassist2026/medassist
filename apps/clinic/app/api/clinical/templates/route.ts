export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@shared/lib/supabase/server'

/**
 * GET /api/clinical/templates - Get doctor's custom prescription templates
 * POST /api/clinical/templates - Create/update a prescription template
 */

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch doctor's templates from prescription_templates table
    // If table doesn't exist, return empty array gracefully
    try {
      const { data: templates, error } = await supabase
        .from('prescription_templates')
        .select('*')
        .eq('doctor_id', user.id)
        .order('usage_count', { ascending: false })

      if (error) {
        // Table might not exist yet — return empty
        return NextResponse.json({ templates: [] })
      }

      return NextResponse.json({
        templates: (templates || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          medications: t.medications || [],
          createdBy: t.doctor_id,
        })),
      })
    } catch {
      return NextResponse.json({ templates: [] })
    }
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Template id required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('prescription_templates')
      .delete()
      .eq('id', id)
      .eq('doctor_id', user.id) // enforce ownership

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { name, medications } = body

    if (!name || !medications || medications.length === 0) {
      return NextResponse.json({ error: 'Template name and medications required' }, { status: 400 })
    }

    try {
      const { data, error } = await supabase
        .from('prescription_templates')
        .insert({
          doctor_id: user.id,
          name,
          medications,
          usage_count: 0,
        })
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ template: data })
    } catch {
      return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
    }
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
