'use client';

import { useState, useRef, useEffect } from 'react';
import { useCreateLead } from '@patina/supabase';
import { Button, Input, Textarea, Select } from '@/components/ui/controls';
import { FieldLabel } from '@patina/help-system';

interface AddLeadFormProps {
  open: boolean;
  onClose: () => void;
}

// Option values map 1:1 to the column comments in migration 00014.
const PROJECT_TYPE_OPTIONS = [
  { value: 'full_room', label: 'Full Room' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'single_piece', label: 'Single Piece' },
  { value: 'staging', label: 'Staging' },
];

const BUDGET_OPTIONS = [
  { value: '', label: '—' },
  { value: 'under_5k', label: 'Under $5k' },
  { value: '5k_15k', label: '$5k – $15k' },
  { value: '15k_50k', label: '$15k – $50k' },
  { value: '50k_100k', label: '$50k – $100k' },
  { value: 'over_100k', label: 'Over $100k' },
];

const TIMELINE_OPTIONS = [
  { value: '', label: '—' },
  { value: 'asap', label: 'ASAP' },
  { value: '1_3_months', label: '1 – 3 months' },
  { value: '3_6_months', label: '3 – 6 months' },
  { value: '6_12_months', label: '6 – 12 months' },
  { value: 'flexible', label: 'Flexible' },
];

export function AddLeadDialog({ open, onClose }: AddLeadFormProps) {
  const [projectType, setProjectType] = useState('full_room');
  const [budgetRange, setBudgetRange] = useState('');
  const [timeline, setTimeline] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [stateRegion, setStateRegion] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const createLead = useCreateLead();

  useEffect(() => {
    if (open && containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const firstInput = containerRef.current.querySelector('select, input');
      (firstInput as HTMLElement | null)?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setSuccessMessage(null);
      setErrorMessage(null);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectType) return;

    createLead.mutate(
      {
        project_type: projectType,
        budget_range: budgetRange || undefined,
        timeline: timeline || undefined,
        project_description: description.trim() || undefined,
        location_city: city.trim() || undefined,
        location_state: stateRegion.trim() || undefined,
        contact_name: contactName.trim() || undefined,
        contact_email: contactEmail.trim() || undefined,
      },
      {
        onSuccess: () => {
          const label = contactName.trim() || 'New lead';
          setSuccessMessage(`${label} added to your pipeline.`);
          // Reset form
          setProjectType('full_room');
          setBudgetRange('');
          setTimeline('');
          setDescription('');
          setCity('');
          setStateRegion('');
          setContactName('');
          setContactEmail('');
          // Close after a confirmation beat
          setTimeout(() => {
            setSuccessMessage(null);
            onClose();
          }, 2500);
        },
        onError: (err: Error) => {
          setErrorMessage(err.message ?? 'Something went wrong. Please try again.');
        },
      }
    );
  };

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className="mb-8 border-b border-[var(--border-default)] pb-8"
    >
      <h2 className="type-item-name mb-6">Add Lead</h2>

      {successMessage && (
        <div
          role="status"
          className="mb-4 rounded-sm border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
        >
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="mb-4 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-md space-y-4">
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="add-lead-type" required>
            Project Type
          </FieldLabel>
          <Select
            id="add-lead-type"
            value={projectType}
            onChange={(e) => setProjectType(e.target.value)}
          >
            {PROJECT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor="add-lead-budget" optional>
              Budget
            </FieldLabel>
            <Select
              id="add-lead-budget"
              value={budgetRange}
              onChange={(e) => setBudgetRange(e.target.value)}
            >
              {BUDGET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor="add-lead-timeline" optional>
              Timeline
            </FieldLabel>
            <Select
              id="add-lead-timeline"
              value={timeline}
              onChange={(e) => setTimeline(e.target.value)}
            >
              {TIMELINE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="add-lead-description" optional>
            Project Notes
          </FieldLabel>
          <Textarea
            id="add-lead-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What is the prospect looking for?"
            className="resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor="add-lead-city" optional>
              City
            </FieldLabel>
            <Input
              id="add-lead-city"
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Austin"
            />
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor="add-lead-state" optional>
              State
            </FieldLabel>
            <Input
              id="add-lead-state"
              type="text"
              value={stateRegion}
              onChange={(e) => setStateRegion(e.target.value)}
              placeholder="TX"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="add-lead-contact-name" optional>
            Contact Name
          </FieldLabel>
          <Input
            id="add-lead-contact-name"
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="James & Lin Chen"
          />
        </div>

        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="add-lead-contact-email" optional>
            Contact Email
          </FieldLabel>
          <Input
            id="add-lead-contact-email"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="james@example.com"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            type="submit"
            variant="primary"
            disabled={createLead.isPending || !projectType}
          >
            {createLead.isPending ? 'Adding…' : 'Add Lead'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
