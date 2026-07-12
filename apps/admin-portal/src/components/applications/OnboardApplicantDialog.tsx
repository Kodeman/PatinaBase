'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useOnboardApplication } from '@/hooks/use-applications';
import type {
  ApplicationType,
  DesignerApplication,
  MakerApplication,
} from '@/services/applications';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  type: ApplicationType;
  application: DesignerApplication | MakerApplication;
}

export function OnboardApplicantDialog({ open, onOpenChange, type, application }: Props) {
  const [displayName, setDisplayName] = useState('');
  const [personalObservation, setPersonalObservation] = useState('');
  const [observationError, setObservationError] = useState<string | undefined>();

  const isDesigner = type === 'designer';

  useEffect(() => {
    if (!open) return;
    if (type === 'designer') {
      const d = application as DesignerApplication;
      setDisplayName([d.first_name, d.last_name].filter(Boolean).join(' '));
    } else {
      const m = application as MakerApplication;
      setDisplayName(m.contact_name ?? m.brand_name ?? '');
    }
    setPersonalObservation('');
    setObservationError(undefined);
  }, [open, type, application]);

  const onboard = useOnboardApplication(type);

  const handleConfirm = () => {
    if (isDesigner && !personalObservation.trim()) {
      setObservationError("Required — one specific, personal note about the designer's work");
      return;
    }

    onboard.mutate(
      {
        id: application.id,
        displayName: displayName.trim() || undefined,
        personalObservation: isDesigner ? personalObservation.trim() : undefined,
      },
      {
        onSuccess: (result) => {
          toast.success(`Invited ${result.email} as ${result.roleAssigned}`);
          onOpenChange(false);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Onboarding failed'),
      },
    );
  };

  const roleName = type === 'designer' ? 'independent_designer' : 'brand_admin';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create account & invite</DialogTitle>
          <DialogDescription>
            Creates a Supabase auth user for {application.email}, assigns the
            <code className="mx-1 text-xs">{roleName}</code> role, and sends an invitation email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Shown on their profile"
            />
          </div>

          {isDesigner && (
            <div>
              <Label htmlFor="personal-observation">
                Personal observation <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="personal-observation"
                rows={4}
                value={personalObservation}
                onChange={(e) => {
                  setPersonalObservation(e.target.value);
                  if (observationError) setObservationError(undefined);
                }}
                placeholder="e.g. The restraint in how you paired reclaimed oak with brass hardware — that's exactly what we're building Patina for."
                className={observationError ? 'border-destructive' : ''}
              />
              <p className="mt-1 text-sm text-muted-foreground">
                One specific, personal note about their work — this renders inside the invite
                letter.
              </p>
              {observationError && (
                <p className="mt-1 text-sm text-destructive">{observationError}</p>
              )}
            </div>
          )}

          <Alert>
            <AlertDescription className="text-sm">
              The applicant will receive a magic-link email inviting them to activate their
              account. You can change their roles later under <b>Users</b>.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={onboard.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={onboard.isPending || (isDesigner && !personalObservation.trim())}
          >
            {onboard.isPending ? 'Inviting…' : 'Create & invite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
