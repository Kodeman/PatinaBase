-- Migration: 00089_recommended_option_sync_trigger.sql
-- Keeps the per-option `is_recommended` flag in sync with the per-decision
-- `recommended_option_id` foreign key. Either field can be the source of
-- truth; the trigger ensures they don't drift.

CREATE OR REPLACE FUNCTION public.sync_decision_recommended_option()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- When an option is marked recommended, update the parent decision and
  -- unmark any sibling options.
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.is_recommended = TRUE THEN
    -- Unmark siblings (avoid recursion by skipping if already false)
    UPDATE public.client_decision_options
       SET is_recommended = FALSE
     WHERE decision_id = NEW.decision_id
       AND id <> NEW.id
       AND is_recommended = TRUE;

    -- Mirror onto parent
    UPDATE public.client_decisions
       SET recommended_option_id = NEW.id
     WHERE id = NEW.decision_id
       AND (recommended_option_id IS DISTINCT FROM NEW.id);
  END IF;

  -- When the only recommended option flips to false, clear the parent FK.
  IF (TG_OP = 'UPDATE') AND OLD.is_recommended = TRUE AND NEW.is_recommended = FALSE THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.client_decision_options
       WHERE decision_id = NEW.decision_id
         AND is_recommended = TRUE
         AND id <> NEW.id
    ) THEN
      UPDATE public.client_decisions
         SET recommended_option_id = NULL
       WHERE id = NEW.decision_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_decision_recommended_option_trg ON public.client_decision_options;
CREATE TRIGGER sync_decision_recommended_option_trg
AFTER INSERT OR UPDATE OF is_recommended ON public.client_decision_options
FOR EACH ROW
EXECUTE FUNCTION public.sync_decision_recommended_option();

-- Reverse direction: when recommended_option_id is set on the decision,
-- mark the matching option recommended (and others not).
CREATE OR REPLACE FUNCTION public.sync_decision_recommended_from_parent()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.recommended_option_id IS DISTINCT FROM OLD.recommended_option_id THEN
    IF NEW.recommended_option_id IS NOT NULL THEN
      UPDATE public.client_decision_options
         SET is_recommended = (id = NEW.recommended_option_id)
       WHERE decision_id = NEW.id;
    ELSE
      UPDATE public.client_decision_options
         SET is_recommended = FALSE
       WHERE decision_id = NEW.id
         AND is_recommended = TRUE;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_decision_recommended_from_parent_trg ON public.client_decisions;
CREATE TRIGGER sync_decision_recommended_from_parent_trg
AFTER UPDATE OF recommended_option_id ON public.client_decisions
FOR EACH ROW
EXECUTE FUNCTION public.sync_decision_recommended_from_parent();
