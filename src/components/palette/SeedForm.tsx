import { useEffect, useId, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { Oklch } from '@/types';
import { DEFAULT_SEEDS, MAX_SEEDS, MIN_SEEDS, oklchToHex, parseColour } from '@/lib/colour-engine';
import { PROMPT_LIMIT } from '@/lib/interpretation/schema';

const EXAMPLE_BRIEFS = [
  'Something calm but not boring, warm yet sophisticated.',
  'A rainy evening, nostalgic, slightly melancholic but comforting.',
  'Bold, energetic and playful, but avoid anything too childish.',
  'A premium SaaS brand with cool blue undertones and a subtle lavender accent.',
];
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FieldLabel, Input, Textarea } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toaster';
import { useProjectStore } from '@/store/project-store';

const START_COLOUR = '#3867D6';

function SeedCount({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="lg" className="px-4" aria-label={`Number of colours: ${value}`}>
          {value} colours <ChevronDown strokeWidth={1.5} className="text-muted" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={String(value)} onValueChange={(v) => onChange(Number(v))}>
          {Array.from({ length: MAX_SEEDS - MIN_SEEDS + 1 }, (_, i) => MIN_SEEDS + i).map((n) => (
            <DropdownMenuRadioItem key={n} value={String(n)}>{n} colours</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The two ways to seed a palette: a base colour, or a brief.
 * The brief path uses AI interpretation when the server has credentials and the keyword lookup otherwise.
 * Whichever ran is named in the result — keyword matching is never presented as AI.
 */
export function SeedForm({ onPreview, onDone }: { onPreview?: (oklch: Oklch) => void; onDone?: () => void }) {
  const generateFromColour = useProjectStore((s) => s.generateFromColour);
  const generateFromBrief = useProjectStore((s) => s.generateFromBrief);
  const [interpreting, setInterpreting] = useState(false);
  const colourId = useId();
  const promptId = useId();
  const [mode, setMode] = useState('colour');
  const [text, setText] = useState(START_COLOUR);
  const [lastValid, setLastValid] = useState<Oklch>(() => {
    const p = parseColour(START_COLOUR);
    return p.ok ? p.oklch : { l: 0.55, c: 0.18, h: 262 };
  });
  const [colourError, setColourError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [promptNote, setPromptNote] = useState<string | null>(null);
  const [count, setCount] = useState(DEFAULT_SEEDS);

  useEffect(() => onPreview?.(lastValid), [lastValid, onPreview]);

  const onColourText = (value: string) => {
    setText(value);
    const parsed = parseColour(value);
    if (parsed.ok) {
      setLastValid(parsed.oklch);
      setColourError(null);
    }
  };

  const submitColour = () => {
    const result = generateFromColour(text, { count });
    if (!result.ok) {
      // Last valid value is preserved; the preview keeps showing it.
      setColourError(`${result.error} Still using ${oklchToHex(lastValid)}.`);
      return;
    }
    onDone?.();
  };

  const submitPrompt = async () => {
    if (interpreting) return;
    if (!prompt.trim()) {
      setPromptNote('Describe the feeling you want in a few words — or pick an example below.');
      return;
    }
    setInterpreting(true);
    setPromptNote(null);
    const result = await generateFromBrief(prompt, count);
    setInterpreting(false);
    if (result.status === 'empty') {
      setPromptNote(`${result.fallbackReason} The keyword fallback then found nothing it recognises in this brief. Try a colour name (“teal”), a mood (“calm”, “bold”) or an industry (“fintech”).`);
      return;
    }
    if (result.status !== 'ok') return;
    if (result.mode === 'fallback') {
      toast('Keyword fallback used', { description: `${result.fallbackReason}${result.unmatched?.length ? ` Ignored: ${result.unmatched.join(', ')}.` : ''}`, duration: 8000 });
    } else {
      toast('Brief interpreted', { description: 'Review what was understood below the palette.' });
    }
    onDone?.();
  };

  return (
    <Tabs value={mode} onValueChange={setMode}>
      <TabsList aria-label="Seed type">
        <TabsTrigger value="colour">From a colour</TabsTrigger>
        <TabsTrigger value="prompt">From a brief</TabsTrigger>
      </TabsList>

      <TabsContent value="colour" className="mt-4">
        <form onSubmit={(e) => { e.preventDefault(); submitColour(); }}>
          <FieldLabel htmlFor={colourId}>Base colour — HEX, RGB or HSL</FieldLabel>
          <div className="flex gap-2">
            <label className="swatch-edge relative block size-12 shrink-0 cursor-pointer overflow-hidden rounded-control focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand" style={{ background: oklchToHex(lastValid) }}>
              <span className="sr-only">Pick a base colour</span>
              <input type="color" value={oklchToHex(lastValid).toLowerCase()} onChange={(e) => onColourText(e.target.value.toUpperCase())} className="absolute inset-0 size-full cursor-pointer opacity-0" />
            </label>
            <Input
              id={colourId}
              value={text}
              onChange={(e) => onColourText(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={!!colourError}
              placeholder="#3867D6 · rgb(56 103 214) · hsl(222 66% 53%)"
              className="h-12 max-w-80 font-mono"
            />
          </div>
          <p role="alert" className={colourError ? 'mt-2 text-[13px] leading-[18px] text-danger' : 'hidden'}>{colourError}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="submit" variant="primary" size="lg">Generate palette</Button>
            <SeedCount value={count} onChange={setCount} />
          </div>
        </form>
      </TabsContent>

      <TabsContent value="prompt" className="mt-4">
        <form onSubmit={(e) => { e.preventDefault(); void submitPrompt(); }}>
          <FieldLabel htmlFor={promptId}>Describe the feeling</FieldLabel>
          <Textarea
            id={promptId}
            rows={2}
            value={prompt}
            maxLength={PROMPT_LIMIT}
            disabled={interpreting}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submitPrompt(); } }}
            placeholder="A quiet Sunday afternoon, warm sunlight through curtains, a little nostalgic but still modern."
            className="max-w-[520px]"
          />
          <div className="mt-1.5 flex max-w-[520px] justify-between gap-4 text-[12px] leading-4 text-muted">
            <span>Read by an AI model when one is set up, otherwise by keyword matching. The result always says which.</span>
            <span className="shrink-0 tabular-nums">{prompt.length}/{PROMPT_LIMIT}</span>
          </div>
          <p role="alert" className={promptNote ? 'mt-2 max-w-[520px] text-[13px] leading-[18px] text-danger' : 'hidden'}>{promptNote}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" variant="primary" size="lg" disabled={interpreting}>{interpreting && <Loader2 className="animate-spin" strokeWidth={1.5} />}{interpreting ? 'Interpreting…' : 'Interpret and generate'}</Button>
            <SeedCount value={count} onChange={setCount} />
          </div>
          <div className="mt-4 max-w-[520px] squat:hidden">
            <p className="mb-1 text-[13px] font-medium text-label">Try an example</p>
            <ul className="space-y-0.5">
              {EXAMPLE_BRIEFS.map((example) => (
                <li key={example}>
                  <button type="button" onClick={() => { setPrompt(example); setPromptNote(null); }} className="rounded-field text-left text-[13px] leading-5 text-muted underline decoration-line underline-offset-4 hover:text-ink hover:decoration-ink">
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </form>
      </TabsContent>
    </Tabs>
  );
}
