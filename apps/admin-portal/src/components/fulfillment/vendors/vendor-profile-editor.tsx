'use client';

import { useEffect, useState } from 'react';
import type { VendorProfileDTO } from '@patina/fulfillment';
import { buildVendorProfilePatch, vendorProfileToFormState, type VendorProfileFormState } from '@patina/fulfillment';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// The vendor protocol-sheet editor (S4, spec §7, R1.6 — "all other protocol
// facts are data fields the operator fills in"). Pure form-state <-> RPC-patch
// mapping lives in @patina/fulfillment/vendor-form.ts (unit-tested there);
// this component is the field layout + save wiring only.

export interface VendorProfileEditorProps {
  vendorId: string;
  vendorName: string;
  profile: VendorProfileDTO | null;
  onSave: (patch: Record<string, unknown>) => void;
  saving: boolean;
}

const FIELD_LABEL = 'mt-3 block text-[0.6rem] uppercase tracking-[0.08em] text-[var(--text-muted)]';
const FIELD_STYLE = { fontFamily: 'var(--font-meta)' } as const;

export function VendorProfileEditor({ vendorName, profile, onSave, saving }: VendorProfileEditorProps) {
  const [form, setForm] = useState<VendorProfileFormState>(() => vendorProfileToFormState(profile));

  useEffect(() => {
    setForm(vendorProfileToFormState(profile));
  }, [profile]);

  const patch = (p: Partial<VendorProfileFormState>) => setForm((prev) => ({ ...prev, ...p }));

  return (
    <div data-testid="vendor-profile-editor" className="max-w-xl">
      <label className={FIELD_LABEL} style={FIELD_STYLE}>
        Transmission type
      </label>
      <Select value={form.transmissionType} onValueChange={(v) => patch({ transmissionType: v as VendorProfileFormState['transmissionType'] })}>
        <SelectTrigger data-testid="vendor-transmission-type" className="mt-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="email">Email</SelectItem>
          <SelectItem value="portal">Portal</SelectItem>
          <SelectItem value="csv">CSV</SelectItem>
        </SelectContent>
      </Select>

      {form.transmissionType === 'email' && (
        <>
          <label className={FIELD_LABEL} style={FIELD_STYLE}>
            PO email
          </label>
          <Input
            data-testid="vendor-po-email"
            className="mt-1"
            value={form.poEmail}
            onChange={(e) => patch({ poEmail: e.target.value })}
            placeholder="orders@vendor.example"
          />
        </>
      )}

      {form.transmissionType === 'portal' && (
        <>
          <label className={FIELD_LABEL} style={FIELD_STYLE}>
            Portal URL
          </label>
          <Input
            data-testid="vendor-portal-url"
            className="mt-1"
            value={form.portalUrl}
            onChange={(e) => patch({ portalUrl: e.target.value })}
            placeholder="https://portal.vendor.example"
          />
        </>
      )}

      {form.transmissionType === 'csv' && (
        <>
          <label className={FIELD_LABEL} style={FIELD_STYLE}>
            CSV column spec (comma-separated)
          </label>
          <Input
            data-testid="vendor-csv-columns"
            className="mt-1"
            value={form.csvColumnsCsv}
            onChange={(e) => patch({ csvColumnsCsv: e.target.value })}
            placeholder="sku, qty, ship_to, side_mark"
          />
        </>
      )}

      <label className={FIELD_LABEL} style={FIELD_STYLE}>
        Payment terms
      </label>
      <Select value={form.paymentTerms} onValueChange={(v) => patch({ paymentTerms: v as VendorProfileFormState['paymentTerms'] })}>
        <SelectTrigger data-testid="vendor-payment-terms" className="mt-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="prepay">Prepay</SelectItem>
          <SelectItem value="fifty_fifty">50 / 50</SelectItem>
          <SelectItem value="net_30">Net 30</SelectItem>
        </SelectContent>
      </Select>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className={FIELD_LABEL} style={FIELD_STYLE}>
            Deposit %
          </label>
          <Input
            data-testid="vendor-deposit-pct"
            type="number"
            className="mt-1"
            value={form.depositPct}
            onChange={(e) => patch({ depositPct: e.target.value })}
          />
        </div>
        <div>
          <label className={FIELD_LABEL} style={FIELD_STYLE}>
            Commission rate %
          </label>
          <Input
            data-testid="vendor-commission-rate"
            type="number"
            className="mt-1"
            value={form.commissionRatePct}
            onChange={(e) => patch({ commissionRatePct: e.target.value })}
            placeholder="16 (config default)"
          />
        </div>
        <div>
          <label className={FIELD_LABEL} style={FIELD_STYLE}>
            Lead time (days)
          </label>
          <Input
            data-testid="vendor-lead-time"
            type="number"
            className="mt-1"
            value={form.leadTimeDays}
            onChange={(e) => patch({ leadTimeDays: e.target.value })}
          />
        </div>
        <div>
          <label className={FIELD_LABEL} style={FIELD_STYLE}>
            Change window (days)
          </label>
          <Input
            data-testid="vendor-change-window"
            type="number"
            className="mt-1"
            value={form.changeWindowDays}
            onChange={(e) => patch({ changeWindowDays: e.target.value })}
          />
        </div>
        <div>
          <label className={FIELD_LABEL} style={FIELD_STYLE}>
            Claims window (days)
          </label>
          <Input
            data-testid="vendor-claims-window"
            type="number"
            className="mt-1"
            value={form.claimsWindowDays}
            onChange={(e) => patch({ claimsWindowDays: e.target.value })}
          />
        </div>
      </div>

      <label className={FIELD_LABEL} style={FIELD_STYLE}>
        Inspection window (days)
      </label>
      <div className="mt-1 grid grid-cols-3 gap-3">
        <Input
          data-testid="vendor-inspection-parcel"
          type="number"
          placeholder="Parcel"
          value={form.inspectionParcelDays}
          onChange={(e) => patch({ inspectionParcelDays: e.target.value })}
        />
        <Input
          data-testid="vendor-inspection-ltl"
          type="number"
          placeholder="LTL"
          value={form.inspectionLtlDays}
          onChange={(e) => patch({ inspectionLtlDays: e.target.value })}
        />
        <Input
          data-testid="vendor-inspection-white-glove"
          type="number"
          placeholder="White glove"
          value={form.inspectionWhiteGloveDays}
          onChange={(e) => patch({ inspectionWhiteGloveDays: e.target.value })}
        />
      </div>

      <label className={FIELD_LABEL} style={FIELD_STYLE}>
        Freight arrangement
      </label>
      <Input
        data-testid="vendor-freight-arrangement"
        className="mt-1"
        value={form.freightArrangement}
        onChange={(e) => patch({ freightArrangement: e.target.value })}
        placeholder="vendor_arranged / patina_arranged"
      />

      <div className="mt-4 flex items-center gap-2">
        <Switch
          id="vendor-blind-ship"
          data-testid="vendor-blind-ship"
          checked={form.blindShip}
          onCheckedChange={(checked) => patch({ blindShip: checked })}
        />
        <Label htmlFor="vendor-blind-ship" className="text-[0.78rem]">
          Blind ship (Patina identity hidden from the client-facing package)
        </Label>
      </div>

      <div className="mt-6">
        <Button
          type="button"
          data-testid="vendor-profile-save"
          disabled={saving}
          onClick={() => onSave(buildVendorProfilePatch(form))}
        >
          {saving ? 'Saving…' : `Save ${vendorName}'s protocol sheet`}
        </Button>
      </div>
    </div>
  );
}
