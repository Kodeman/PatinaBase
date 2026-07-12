'use client';

import { useState } from 'react';
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
import { Mail, User } from 'lucide-react';
import { useInviteDesigner } from '@/hooks/use-designers';
import { toast } from 'sonner';

interface InviteDesignerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Designer-onboarding program, Wave 4 — invites a designer through the
 * branded designer-invite edge function (not the plain Supabase invite the
 * general Create User flow uses). personalObservation is REQUIRED: the API
 * 400s without it (it renders inside the founder-voiced invite letter, so
 * it must be written deliberately, never defaulted).
 */
export function InviteDesignerDialog({ open, onOpenChange }: InviteDesignerDialogProps) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [personalObservation, setPersonalObservation] = useState('');
  const [errors, setErrors] = useState<{ email?: string; personalObservation?: string }>({});

  const inviteDesigner = useInviteDesigner();

  const validateForm = (): boolean => {
    const newErrors: { email?: string; personalObservation?: string } = {};

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!personalObservation.trim()) {
      newErrors.personalObservation =
        "Required — one specific, personal note about the designer's work";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const resetForm = () => {
    setEmail('');
    setDisplayName('');
    setPersonalObservation('');
    setErrors({});
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) resetForm();
    onOpenChange(isOpen);
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      const result = await inviteDesigner.mutateAsync({
        email: email.trim().toLowerCase(),
        displayName: displayName.trim() || undefined,
        personalObservation: personalObservation.trim(),
      });

      toast.success(`Invitation sent to ${result.email}`, {
        description: 'They will receive the branded designer invite letter by email.',
      });

      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Failed to invite designer';
      toast.error(message);
      console.error('Invite designer error:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Invite Designer</DialogTitle>
          <DialogDescription>
            Sends the branded designer invite letter and enrolls them in the Founding Invite
            sequence. They receive the independent_designer role once they accept.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="designer-email">
              Email Address <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="designer-email"
                type="email"
                placeholder="designer@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors({ ...errors, email: undefined });
                }}
                className={`pl-10 ${errors.email ? 'border-destructive' : ''}`}
              />
            </div>
            {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="designer-display-name">Display Name (optional)</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="designer-display-name"
                type="text"
                placeholder="Jane Doe"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="designer-observation">
              Personal Observation <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="designer-observation"
              rows={4}
              placeholder="e.g. The way you paired reclaimed oak with brass hardware in the Fillmore project — that restraint is exactly what we're building Patina for."
              value={personalObservation}
              onChange={(e) => {
                setPersonalObservation(e.target.value);
                if (errors.personalObservation) {
                  setErrors({ ...errors, personalObservation: undefined });
                }
              }}
              className={errors.personalObservation ? 'border-destructive' : ''}
            />
            <p className="text-sm text-muted-foreground">
              One specific, personal note about their work — this renders inside the invite
              letter.
            </p>
            {errors.personalObservation && (
              <p className="text-sm text-destructive">{errors.personalObservation}</p>
            )}
          </div>

          <Alert>
            <Mail className="h-4 w-4" />
            <AlertDescription>
              The email fails to send if the designer-invite template is missing — it never
              falls back to an unbranded send.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={inviteDesigner.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={inviteDesigner.isPending}>
            {inviteDesigner.isPending ? 'Sending…' : 'Send Invite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
