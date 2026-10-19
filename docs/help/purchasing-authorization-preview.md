# Preview a purchasing authorization

Before sending a purchasing authorization, read the saved document your client will receive.

## Save and preview

1. Select the pieces to release and review the selection and deposit.
2. Choose **Save draft & preview**.

Saving creates a draft and reserves these items. Nothing is sent to the client.

The preview shows the saved authorization’s rooms, quantities, units, client prices, allowances, total and deposit terms. **Preview · Not sent** identifies the studio’s preview controls, not text added to the client’s document. Signing and payment controls are not simulated here.

Choose **Send to client** only after reviewing the saved document. Existing agreement and checkpoint requirements still apply.

## Close, reopen or change a draft

Closing or going back does not send, void or change the draft. Its item reservations remain. Use **Preview** on the saved authorization or drafted release to reopen it without creating another draft.

Saved authorization items cannot be edited in place. To change them, explicitly **Void** the draft with a reason of at least five characters after trimming, then prepare a new draft and preview it.

## When something fails

- **Saving fails:** review the error and retry the save when appropriate.
- **Preview fails to load:** retry reading the saved preview. Do not create a replacement draft. If the save succeeded but its identity could not be recovered, open the authorization ledger rather than saving again.
- **Content changed after review:** reload the preview, review it again, then choose Send. Reloading never sends automatically. Both the current conflict response (`PT409`, HTTP 409) and the older `40001` response keep Send held until that explicit reload.
- **Draft is no longer available:** Send remains held. Check the saved authorization’s current state; do not recreate it automatically.
- **Authorization sent but email is pending or failed:** follow the saved authorization’s delivery status and existing email retry action. Do not create or send another authorization to retry notification.

Unsent drafts remain private to the authorized studio. Preview does not sign anything, acknowledge a checkpoint or grant purchasing authority.
