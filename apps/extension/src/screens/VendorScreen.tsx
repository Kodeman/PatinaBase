/**
 * Vendor capture — wraps the existing VendorCaptureForm and the saveVendor
 * effect. Self-contained: extracts vendor data on mount and owns its save state
 * (vendor mode is orthogonal to the product draft). Reached via the header toggle
 * or URL auto-detect. A native VendorScreen redesign lands in Phase 5.
 */
import { useEffect, useState } from 'react';
import type { ExtractedVendorData, VendorCaptureInput } from '@patina/shared';
import { useCapture } from '../state/CaptureProvider';
import { VendorCaptureForm } from '../components/VendorCaptureForm';
import { saveVendor } from '../state/effects';

export function VendorScreen() {
  const { session } = useCapture();
  const [vendorData, setVendorData] = useState<ExtractedVendorData | null>(null);
  const [currentUrl, setCurrentUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url) setCurrentUrl(tabs[0].url);
    });
    chrome.runtime.sendMessage({ type: 'EXTRACT_VENDOR_REQUEST' }, (res) => {
      if (chrome.runtime.lastError || !res?.success) return;
      setVendorData(res.data as ExtractedVendorData);
    });
  }, []);

  const onSave = async (data: VendorCaptureInput) => {
    if (!session.user) return;
    setSaving(true);
    setError('');
    try {
      await saveVendor(data, session.user);
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save vendor');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border-l-[3px] border-rust bg-rust/5 px-3 py-2 text-[0.82rem] text-rust">
          {error}
        </div>
      )}
      <VendorCaptureForm
        extractedVendorData={vendorData}
        currentUrl={currentUrl}
        onSave={onSave}
        isSaving={saving}
        saveSuccess={success}
      />
      <button
        type="button"
        onClick={() => {
          const form = document.querySelector('form');
          if (form) form.requestSubmit();
        }}
        disabled={saving}
        className={`w-full rounded-md py-3 text-[0.85rem] font-medium transition-colors disabled:opacity-50 ${
          success ? 'bg-verdigris text-paper' : 'bg-ink text-paper hover:bg-ink-2'
        }`}
      >
        {saving ? 'Saving…' : success ? 'Vendor saved' : 'Save vendor'}
      </button>
    </div>
  );
}
