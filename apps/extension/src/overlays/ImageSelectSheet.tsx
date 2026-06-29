/** C3 — Image & variant select. Toggle which extracted images to keep. */
import { useCapture, useCaptureDispatch } from '../state/CaptureProvider';
import { OverlaySheet } from '../panel/OverlaySheet';

export function ImageSelectSheet() {
  const { draft } = useCapture();
  const dispatch = useCaptureDispatch();
  if (!draft) return null;
  const { all, selected } = draft.images;

  const toggle = (i: number) => {
    const next = selected.includes(i)
      ? selected.filter((s) => s !== i)
      : [...selected, i].sort((a, b) => a - b);
    dispatch({ type: 'IMAGES_SET', selected: next, variant: draft.images.variant });
  };

  return (
    <OverlaySheet title="Choose images" subtitle={`${selected.length} of ${all.length} kept`}>
      {all.length === 0 ? (
        <p className="py-8 text-center text-[0.85rem] text-ink-soft">No images were found on this page.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {all.map((img, i) => {
            const on = selected.includes(i);
            return (
              <button
                key={img.url + i}
                type="button"
                onClick={() => toggle(i)}
                className={`relative aspect-square overflow-hidden rounded-md border-2 transition-colors ${
                  on ? 'border-verdigris' : 'border-line opacity-60'
                }`}
              >
                <img src={img.url} alt="" className="h-full w-full object-cover" />
                {on && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-verdigris text-[0.6rem] text-paper">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </OverlaySheet>
  );
}
