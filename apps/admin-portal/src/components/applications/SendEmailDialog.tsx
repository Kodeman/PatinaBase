'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { useSendApplicationEmail } from '@/hooks/use-applications';
import type {
  ApplicationType,
  DesignerApplication,
  MakerApplication,
} from '@/services/applications';
import { EMAIL_PRESETS } from './email-presets';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  type: ApplicationType;
  application: DesignerApplication | MakerApplication;
}

export function SendEmailDialog({ open, onOpenChange, type, application }: Props) {
  const presets = EMAIL_PRESETS[type];
  const [presetSlug, setPresetSlug] = useState<string>(presets[0]?.slug ?? '');
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');

  const send = useSendApplicationEmail(type);

  useEffect(() => {
    if (!open) return;
    const preset = presets.find((p) => p.slug === presetSlug) ?? presets[0];
    if (preset) {
      setSubject(preset.subject);
      setHtml(preset.html);
    }
  }, [open, presetSlug, presets]);

  const vars = useMemo(() => buildVars(type, application), [type, application]);
  const previewSubject = substitute(subject, vars);
  const previewHtml = substitute(html, vars);

  const handleSend = () => {
    send.mutate(
      {
        id: application.id,
        subject,
        html,
        presetSlug,
      },
      {
        onSuccess: () => {
          toast.success(`Email sent to ${application.email}`);
          onOpenChange(false);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Send failed'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send email</DialogTitle>
          <DialogDescription>
            To {application.email}. Variables like {'{{first_name}}'} are substituted at send time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1 block">Preset</Label>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <Button
                  key={p.slug}
                  type="button"
                  size="sm"
                  variant={presetSlug === p.slug ? 'default' : 'outline'}
                  onClick={() => setPresetSlug(p.slug)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            {previewSubject !== subject && (
              <p className="mt-1 text-xs text-muted-foreground">Preview: {previewSubject}</p>
            )}
          </div>

          <div>
            <Label htmlFor="email-html">Body (HTML)</Label>
            <Textarea
              id="email-html"
              rows={10}
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <div>
            <Label className="mb-1 block">Preview</Label>
            <div
              className="rounded-md border p-4 text-sm max-h-48 overflow-auto"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={send.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={send.isPending || !subject.trim() || !html.trim()}
          >
            {send.isPending ? 'Sending…' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function buildVars(
  type: ApplicationType,
  application: DesignerApplication | MakerApplication,
): Record<string, string> {
  if (type === 'designer') {
    const d = application as DesignerApplication;
    return {
      email: d.email,
      first_name: d.first_name,
      last_name: d.last_name,
      company: d.company ?? '',
      contact_name: '',
      brand_name: '',
    };
  }
  const m = application as MakerApplication;
  return {
    email: m.email,
    first_name: '',
    last_name: '',
    company: '',
    contact_name: m.contact_name,
    brand_name: m.brand_name,
  };
}

function substitute(content: string, vars: Record<string, string>) {
  return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => vars[key] ?? '');
}
