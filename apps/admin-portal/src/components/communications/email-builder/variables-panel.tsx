'use client';

import { useState } from 'react';
import { Plus, Trash2, Copy, Check } from 'lucide-react';
import { isValidVariableName } from '@patina/shared';
import { useTemplateBuilderStore } from '@/stores/template-builder-store';
import { cn } from '@/lib/utils';

export function VariablesPanel() {
  const variables = useTemplateBuilderStore((s) => s.variables);
  const addVariable = useTemplateBuilderStore((s) => s.addVariable);
  const updateVariable = useTemplateBuilderStore((s) => s.updateVariable);
  const removeVariable = useTemplateBuilderStore((s) => s.removeVariable);
  const selectedBlockId = useTemplateBuilderStore((s) => s.selectedBlockId);
  const insertTokenIntoSelected = useTemplateBuilderStore((s) => s.insertTokenIntoSelected);
  const [copiedName, setCopiedName] = useState<string | null>(null);

  const copyToken = async (name: string) => {
    const token = `{{${name}}}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(token);
      }
    } catch {
      // ignore
    }
    setCopiedName(name);
    window.setTimeout(() => setCopiedName((c) => (c === name ? null : c)), 1200);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-patina-off-white">
      <div className="max-w-3xl mx-auto p-6 space-y-5">
        <div>
          <h2 className="text-lg font-display font-semibold text-patina-charcoal">
            Template Variables
          </h2>
          <p className="text-sm text-patina-clay-beige mt-1">
            Define merge tags authors can fill at send time. Tokens render as
            <code className="px-1 mx-1 rounded bg-white border border-patina-clay-beige/20 text-[12px]">{'{{name}}'}</code>
            in any text-bearing block.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-patina-clay-beige/20 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-patina-clay-beige/20">
            <h3 className="text-sm font-semibold text-patina-charcoal">
              Variables ({variables.length})
            </h3>
            <button
              onClick={addVariable}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-patina-mocha-brown text-white rounded-md hover:bg-patina-charcoal transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Variable
            </button>
          </div>

          {variables.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-patina-clay-beige">
                No variables yet. Add one to start using merge tags.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-patina-clay-beige/10">
              {variables.map((variable, index) => {
                const nameInvalid = variable.name.length > 0 && !isValidVariableName(variable.name);
                const duplicate =
                  variable.name.length > 0 &&
                  variables.findIndex((v) => v.name === variable.name) !== index;
                const canCopy = variable.name.length > 0 && !nameInvalid;

                return (
                  <li key={index} className="p-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-medium text-patina-clay-beige uppercase tracking-wider mb-1 block">
                          Name
                        </label>
                        <input
                          type="text"
                          value={variable.name}
                          onChange={(e) => updateVariable(index, { name: e.target.value.trim() })}
                          placeholder="firstName"
                          spellCheck={false}
                          className={cn(
                            'w-full px-2.5 py-2 text-sm border rounded-md bg-white focus:outline-none focus:ring-2 transition-colors font-mono',
                            nameInvalid || duplicate
                              ? 'border-red-300 focus:ring-red-200'
                              : 'border-patina-clay-beige/30 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown'
                          )}
                        />
                        {nameInvalid && (
                          <p className="mt-1 text-[11px] text-red-600">
                            Use letters, numbers, underscores. Must start with a letter or _.
                          </p>
                        )}
                        {!nameInvalid && duplicate && (
                          <p className="mt-1 text-[11px] text-red-600">Duplicate name.</p>
                        )}
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-patina-clay-beige uppercase tracking-wider mb-1 block">
                          Label
                        </label>
                        <input
                          type="text"
                          value={variable.label}
                          onChange={(e) => updateVariable(index, { label: e.target.value })}
                          placeholder="First name"
                          className="w-full px-2.5 py-2 text-sm border border-patina-clay-beige/30 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-medium text-patina-clay-beige uppercase tracking-wider mb-1 block">
                          Sample value
                        </label>
                        <input
                          type="text"
                          value={variable.sample}
                          onChange={(e) => updateVariable(index, { sample: e.target.value })}
                          placeholder="e.g. Avery"
                          className="w-full px-2.5 py-2 text-sm border border-patina-clay-beige/30 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown"
                        />
                      </div>

                      <div className="flex items-end justify-between gap-3">
                        <label className="flex items-center gap-2 text-xs text-patina-charcoal cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={variable.required}
                            onChange={(e) => updateVariable(index, { required: e.target.checked })}
                            className="w-4 h-4 rounded border-patina-clay-beige/40 text-patina-mocha-brown focus:ring-patina-mocha-brown"
                          />
                          Required at send time
                        </label>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          disabled={!canCopy}
                          onClick={() => copyToken(variable.name)}
                          className={cn(
                            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] font-medium transition-colors',
                            canCopy
                              ? 'border-patina-clay-beige/30 text-patina-charcoal hover:bg-patina-off-white'
                              : 'border-patina-clay-beige/20 text-patina-clay-beige/50 cursor-not-allowed'
                          )}
                          title={canCopy ? 'Copy token to clipboard' : 'Set a name to copy'}
                        >
                          {copiedName === variable.name ? (
                            <Check className="w-3 h-3 text-green-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          Copy {`{{${variable.name || 'name'}}}`}
                        </button>
                        <button
                          type="button"
                          disabled={!canCopy || !selectedBlockId}
                          onClick={() => insertTokenIntoSelected(variable.name)}
                          className={cn(
                            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] font-medium transition-colors',
                            canCopy && selectedBlockId
                              ? 'border-patina-mocha-brown/30 text-patina-mocha-brown hover:bg-patina-mocha-brown/5'
                              : 'border-patina-clay-beige/20 text-patina-clay-beige/50 cursor-not-allowed'
                          )}
                          title={
                            !selectedBlockId
                              ? 'Select a block first'
                              : !canCopy
                                ? 'Set a name first'
                                : 'Append token to the selected block'
                          }
                        >
                          Insert into selected block
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeVariable(index)}
                        className="flex items-center gap-1 text-[11px] text-patina-clay-beige hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-4">
          <h3 className="text-sm font-semibold text-patina-charcoal mb-1.5">
            Tip
          </h3>
          <p className="text-xs text-patina-clay-beige leading-relaxed">
            Sample values flow into the live preview, so you see realistic copy
            while editing. At send time the campaign or transactional payload
            replaces these with real values via the standard
            {' '}
            <code className="px-1 rounded bg-patina-off-white border border-patina-clay-beige/20 text-[11px]">{'{{name}}'}</code>
            {' '}interpolator.
          </p>
        </div>
      </div>
    </div>
  );
}
