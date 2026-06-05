'use client';

import { forwardRef, useImperativeHandle, useState } from 'react';
import { Button } from '@/components/ui/controls';
import {
  ProductPickerModal,
  type ProductPickResult,
} from '@/components/portal/proposals/product-picker-modal';
import {
  AllowanceForm,
  TbdForm,
  type AllowanceFormState,
  type TbdFormState,
  type FormRoom,
} from './ffe-item-forms';

export interface AddFFEItemControlsHandle {
  openProduct: (roomId?: string | null, categorySlug?: string | null) => void;
  openAllowance: () => void;
  openTbd: () => void;
}

interface AddFFEItemControlsProps {
  rooms: FormRoom[];
  categories: Array<{ slug: string; label: string }>;
  pickerScope?: 'catalog' | 'library';
  /** Room pre-selected when the built-in product button is used (null → Unassigned). */
  defaultScopeRoomId?: string | null;
  /** Pending state from the caller's add mutation; disables the form save buttons. */
  isSaving: boolean;
  /**
   * Each handler performs the actual write. Return the mutation promise so the
   * inline allowance/TBD form closes only after a successful save (and stays
   * open on error). The caller's mutation surfaces its own error toast.
   */
  onAddProduct: (result: ProductPickResult, ffeCategorySlug: string | null) => void | Promise<unknown>;
  onAddAllowance: (form: AllowanceFormState) => void | Promise<unknown>;
  onAddTbd: (form: TbdFormState) => void | Promise<unknown>;
  /** Hide the built-in button cluster and drive entirely via the imperative handle. */
  hideButtons?: boolean;
  /** Label for the primary product button. */
  productLabel?: string;
}

/**
 * Shared "+ Add product / Allowance / TBD" cluster + product picker + inline
 * allowance/TBD forms. Surface-agnostic: the caller supplies the writes via
 * callbacks (proposal → useAddProposalItem, project → useAddProjectFFEItem).
 * Per-room triggers open the picker pre-targeted via the imperative handle.
 */
export const AddFFEItemControls = forwardRef<AddFFEItemControlsHandle, AddFFEItemControlsProps>(
  function AddFFEItemControls(
    {
      rooms,
      categories,
      pickerScope = 'library',
      defaultScopeRoomId = null,
      isSaving,
      onAddProduct,
      onAddAllowance,
      onAddTbd,
      hideButtons = false,
      productLabel = '+ Add Product',
    },
    ref
  ) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerCtx, setPickerCtx] = useState<{
      scopeRoomId: string | null;
      ffeCategorySlug: string | null;
    }>({ scopeRoomId: defaultScopeRoomId, ffeCategorySlug: null });
    const [allowanceMode, setAllowanceMode] = useState(false);
    const [tbdMode, setTbdMode] = useState(false);

    const openProduct = (
      roomId: string | null = defaultScopeRoomId,
      categorySlug: string | null = null
    ) => {
      setAllowanceMode(false);
      setTbdMode(false);
      setPickerCtx({ scopeRoomId: roomId, ffeCategorySlug: categorySlug });
      setPickerOpen(true);
    };
    const openAllowance = () => {
      setTbdMode(false);
      setAllowanceMode(true);
    };
    const openTbd = () => {
      setAllowanceMode(false);
      setTbdMode(true);
    };

    useImperativeHandle(ref, () => ({ openProduct, openAllowance, openTbd }));

    return (
      <div>
        {!hideButtons && !allowanceMode && !tbdMode && (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => openProduct()}>
              {productLabel}
            </Button>
            <Button variant="secondary" onClick={openAllowance}>
              + Add Allowance
            </Button>
            <Button variant="ghost" onClick={openTbd}>
              + Add TBD
            </Button>
          </div>
        )}

        {allowanceMode && (
          <div className="mt-3">
            <AllowanceForm
              rooms={rooms}
              categories={categories}
              isSaving={isSaving}
              onCancel={() => setAllowanceMode(false)}
              onSave={async (form) => {
                try {
                  await onAddAllowance(form);
                  setAllowanceMode(false);
                } catch {
                  /* caller's mutation surfaces the error toast; keep the form open */
                }
              }}
            />
          </div>
        )}

        {tbdMode && (
          <div className="mt-3">
            <TbdForm
              rooms={rooms}
              categories={categories}
              isSaving={isSaving}
              onCancel={() => setTbdMode(false)}
              onSave={async (form) => {
                try {
                  await onAddTbd(form);
                  setTbdMode(false);
                } catch {
                  /* keep the form open on error */
                }
              }}
            />
          </div>
        )}

        <ProductPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          scope={pickerScope}
          defaultCategorySlug={pickerCtx.ffeCategorySlug ?? undefined}
          rooms={rooms}
          defaultScopeRoomId={pickerCtx.scopeRoomId}
          onPick={(r) => {
            void onAddProduct(r, pickerCtx.ffeCategorySlug);
          }}
        />
      </div>
    );
  }
);
