/**
 * Row mappers for /api/waitlist routes.
 * Keep response shapes in sync with src/services/waitlist.ts types.
 */

export function mapWaitlistRow(row: any) {
  return {
    id: row.id,
    email: row.email,
    source: row.source,
    role: row.role,
    utmSource: row.utm_source,
    utmMedium: row.utm_medium,
    utmCampaign: row.utm_campaign,
    utmContent: row.utm_content,
    utmTerm: row.utm_term,
    referrer: row.referrer,
    signupPage: row.signup_page,
    ctaText: row.cta_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    convertedAt: row.converted_at,
    authUserId: row.auth_user_id,
    qualificationStage: row.qualification_stage ?? 'new',
    assignedAdminId: row.assigned_admin_id,
    fullName: row.full_name,
    companyName: row.company_name,
    phone: row.phone,
    notes: row.notes,
    lastContactedAt: row.last_contacted_at,
    nextFollowUpAt: row.next_follow_up_at,
    disqualifiedReason: row.disqualified_reason,
  };
}

export function mapWaitlistActivityRow(row: any) {
  return {
    id: row.id,
    waitlistId: row.waitlist_id,
    actorAdminId: row.actor_admin_id,
    kind: row.kind,
    body: row.body,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

export function mapWaitlistTaskRow(row: any) {
  return {
    id: row.id,
    waitlistId: row.waitlist_id,
    assignedAdminId: row.assigned_admin_id,
    createdBy: row.created_by,
    title: row.title,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
