export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@shared/lib/supabase/server'

/**
 * GET    /api/clinical/templates           - List doctor's custom templates
 * POST   /api/clinical/templates           - Create a new template
 * PATCH  /api/clinical/templates?id=xxx    - Increment usage_count
 * PUT    /api/clinical/templates?id=xxx    - Rename template { name: string }
 * DELETE /api/clinical/templates?id=xxx    - Delete template
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

// ============================================================================
// PATCH /api/clinical/templates?id=xxx  — increment usage_count when applied
// ============================================================================

export async function PATCH(req: NextRequest) {
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

    // Use rpc increment if available, otherwise raw update with current+1
    const { error } = await supabase.rpc('increment_template_usage', { template_id: id, doc_id: user.id })

    if (error) {
      // Fallback: fetch current count and increment manually
      const { data: tpl } = await supabase
        .from('prescription_templates')
        .select('usage_count')
        .eq('id', id)
        .eq('doctor_id', user.id)
        .single()

      await supabase
        .from('prescription_templates')
        .update({ usage_count: ((tpl?.usage_count || 0) as number) + 1 })
        .eq('id', id)
        .eq('doctor_id', user.id)
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ============================================================================
// POST /api/clinical/templates — create a new template
// ============================================================================

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

// PUT /api/clinical/templates?id=xxx — rename a template
export async function PUT(req: NextRequest) {
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

    const body = await req.json()
    const { name, medications } = body
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Template name required' }, { status: 400 })
    }

    const updatePayload: Record<string, any> = { name: name.trim(), updated_at: new Date().toISOString() }
    if (medications !== undefined) updatePayload.medications = medications

    const { error } = await supabase
      .from('prescription_templates')
      .update(updatePayload)
      .eq('id', id)
      .eq('doctor_id', user.id)  // enforce ownership

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
