import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// ═══════════════════════════════════════════════════════════════════════════
// DESIGNER ONBOARDING HOOKS (Phase 3: Professional Auth)
// ═══════════════════════════════════════════════════════════════════════════

// Lazy client getter
const getSupabase = () => createBrowserClient();

// Type-safe table accessor for designer_applications
// This casts to 'any' until the migration is applied and types are regenerated
const getDesignerApplicationsTable = () => {
  const supabase = getSupabase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from('designer_applications');
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type DesignerApplicationStatus =
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected';

export interface DesignerApplication {
  id: string;
  userId: string;
  status: DesignerApplicationStatus;
  businessName: string | null;
  portfolioUrl: string | null;
  yearsExperience: number | null;
  specialties: string[];
  certifications: string[];
  referralSource: string | null;
  additionalInfo: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DesignerApplicationInput {
  businessName?: string;
  portfolioUrl?: string;
  yearsExperience?: number;
  specialties?: string[];
  certifications?: string[];
  referralSource?: string;
  additionalInfo?: string;
}

export interface DesignerApplicationWithProfile extends DesignerApplication {
  profile: {
    id: string;
    email: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// USER-FACING HOOKS (Applicants)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get current user's designer application status
 */
export function useMyDesignerApplication() {
  return useQuery({
    queryKey: ['my-designer-application'],
    queryFn: async () => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await getDesignerApplicationsTable()
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as DesignerApplication | null;
    },
  });
}

/**
 * Submit a designer application
 */
export function useSubmitDesignerApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DesignerApplicationInput) => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check for existing pending application
      const { data: existing } = await getDesignerApplicationsTable()
        .select('id, status')
        .eq('user_id', user.id)
        .in('status', ['pending', 'under_review'])
        .maybeSingle();

      if (existing) {
        throw new Error('You already have a pending application');
      }

      const { data, error } = await getDesignerApplicationsTable()
        .insert({
          user_id: user.id,
          status: 'pending',
          business_name: input.businessName,
          portfolio_url: input.portfolioUrl,
          years_experience: input.yearsExperience,
          specialties: input.specialties || [],
          certifications: input.certifications || [],
          referral_source: input.referralSource,
          additional_info: input.additionalInfo,
        })
        .select()
        .single();

      if (error) throw error;
      return data as DesignerApplication;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-designer-application'] });
    },
  });
}

/**
 * Update an existing designer application (only if pending)
 */
export function useUpdateDesignerApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      applicationId,
      ...input
    }: DesignerApplicationInput & { applicationId: string }) => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await getDesignerApplicationsTable()
        .update({
          business_name: input.businessName,
          portfolio_url: input.portfolioUrl,
          years_experience: input.yearsExperience,
          specialties: input.specialties,
          certifications: input.certifications,
          referral_source: input.referralSource,
          additional_info: input.additionalInfo,
          updated_at: new Date().toISOString(),
        })
        .eq('id', applicationId)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .select()
        .single();

      if (error) throw error;
      return data as DesignerApplication;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-designer-application'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN HOOKS (Reviewers)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all designer applications (admin only)
 */
export function useDesignerApplications(filters?: {
  status?: DesignerApplicationStatus;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['designer-applications', filters],
    queryFn: async () => {
      const supabase = getSupabase();

      let query = getDesignerApplicationsTable()
        .select(
          `
          *,
          profiles:user_id (id, email, display_name, avatar_url)
        `
        )
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as unknown as DesignerApplicationWithProfile[];
    },
  });
}

/**
 * Get a single designer application by ID (admin only)
 */
export function useDesignerApplication(applicationId: string) {
  return useQuery({
    queryKey: ['designer-application', applicationId],
    queryFn: async () => {
      const supabase = getSupabase();

      const { data, error } = await getDesignerApplicationsTable()
        .select(
          `
          *,
          profiles:user_id (id, email, display_name, avatar_url)
        `
        )
        .eq('id', applicationId)
        .single();

      if (error) throw error;
      return data as unknown as DesignerApplicationWithProfile;
    },
    enabled: !!applicationId,
  });
}

/**
 * Approve a designer application (admin only)
 * Grants the independent_designer role to the user
 */
export function useApproveDesignerApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      applicationId,
      notes,
    }: {
      applicationId: string;
      notes?: string;
    }) => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get the application
      const { data: application, error: appError } = await getDesignerApplicationsTable()
        .select('user_id')
        .eq('id', applicationId)
        .single();

      if (appError) throw appError;

      // Update application status
      const { error: updateError } = await getDesignerApplicationsTable()
        .update({
          status: 'approved',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', applicationId);

      if (updateError) throw updateError;

      // Get the independent_designer role ID
      const { data: role, error: roleError } = await supabase
        .from('roles')
        .select('id')
        .eq('name', 'independent_designer')
        .single();

      if (roleError) throw roleError;

      // Grant the designer role
      const { error: grantError } = await supabase
        .from('user_roles')
        .upsert(
          {
            user_id: application.user_id,
            role_id: role.id,
            granted_by: user.id,
            granted_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,role_id' }
        );

      if (grantError) throw grantError;

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['designer-applications'] });
      queryClient.invalidateQueries({ queryKey: ['designer-application'] });
    },
  });
}

/**
 * Reject a designer application (admin only)
 */
export function useRejectDesignerApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      applicationId,
      notes,
    }: {
      applicationId: string;
      notes?: string;
    }) => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await getDesignerApplicationsTable()
        .update({
          status: 'rejected',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', applicationId);

      if (error) throw error;
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['designer-applications'] });
      queryClient.invalidateQueries({ queryKey: ['designer-application'] });
    },
  });
}

/**
 * Mark application as under review (admin only)
 */
export function useMarkApplicationUnderReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ applicationId }: { applicationId: string }) => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await getDesignerApplicationsTable()
        .update({
          status: 'under_review',
          reviewed_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', applicationId)
        .eq('status', 'pending');

      if (error) throw error;
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['designer-applications'] });
      queryClient.invalidateQueries({ queryKey: ['designer-application'] });
    },
  });
}

/**
 * Get application statistics (admin only)
 */
export function useDesignerApplicationStats() {
  return useQuery({
    queryKey: ['designer-application-stats'],
    queryFn: async () => {
      const { data, error } = await getDesignerApplicationsTable()
        .select('status');

      if (error) throw error;

      // Cast data to expected shape since table isn't in types yet
      const applications = data as { status: string }[];

      const stats = {
        total: applications.length,
        pending: applications.filter(a => a.status === 'pending').length,
        underReview: applications.filter(a => a.status === 'under_review').length,
        approved: applications.filter(a => a.status === 'approved').length,
        rejected: applications.filter(a => a.status === 'rejected').length,
      };

      return stats;
    },
  });
}
