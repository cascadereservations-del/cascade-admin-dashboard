import { useEffect, useRef, useState, type ClipboardEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, Copy, ImagePlus, MessageSquareReply } from 'lucide-react';
import { toAppError } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { draftGuestReply, guestReplyError, MAX_GUEST_TEXT, type GuestPlatform, type GuestReplyDraft } from './guest-reply-api';
import { shrinkImage } from './guest-reply-image';

// "Cassy reply" (S76): draft one or two warm replies to a guest message, from pasted text or a screenshot. It drafts only; the host
// copies a draft and sends it herself. Show this button to owner/admin only (the function refuses everyone else); the page decides.

export function GuestReplyButton({ variant = 'outline' }: { variant?: 'outline' | 'default' }) {
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant={variant}><MessageSquareReply aria-hidden /> Cassy reply</Button></DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <Body />
      </DialogContent>
    </Dialog>
  );
}

type Mode = 'text' | 'screenshot';

// Closing the dialog unmounts Body, so a new open always starts clean.
function Body() {
  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState<GuestPlatform>('messenger');
  const [file, setFile] = useState<File | null>(null);
  const draft = useMutation({
    mutationFn: async (): Promise<GuestReplyDraft> => {
      const common = { guestName: name, platform };
      if (mode === 'text') return draftGuestReply({ text: text.trim(), ...common });
      // An image the browser cannot decode (HEIC, a renamed non-image) gets the same warm sentence as the function's bad_image.
      const image = await shrinkImage(file!).catch(() => { throw guestReplyError('bad_image', 400); });
      return draftGuestReply({ image, ...common });
    },
  });
  const titleRef = useRef<HTMLHeadingElement>(null);
  const refocusTitle = useRef(false);
  // Any edit clears a stale error.
  const edit = (fn: () => void) => { draft.reset(); fn(); };
  const ready = mode === 'text' ? text.trim().length > 0 : file !== null;

  const startOver = () => { refocusTitle.current = true; draft.reset(); setText(''); setName(''); setFile(null); };
  // The Result view replaces the form, so focus would fall to the page; put it back on the heading after Start over.
  useEffect(() => { if (!draft.isSuccess && refocusTitle.current) { refocusTitle.current = false; titleRef.current?.focus(); } }, [draft.isSuccess]);
  // Only the screenshot tab takes a pasted image; in the Text tab a paste goes into the box as usual.
  const onPaste = (e: ClipboardEvent) => {
    if (mode !== 'screenshot') return;
    const img = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
    if (img) { e.preventDefault(); edit(() => setFile(img)); }
  };

  const live = <p className="sr-only" role="status" aria-live="polite">{draft.isPending ? 'Cassy is writing the replies.' : draft.isSuccess ? 'The replies are ready.' : ''}</p>;
  if (draft.isSuccess) return <>{live}<Result d={draft.data} onStartOver={startOver} /></>;
  return (
    <form onPaste={onPaste} onSubmit={(e) => { e.preventDefault(); if (ready && !draft.isPending) draft.mutate(); }} className="grid gap-4">
      {live}
      <DialogHeader>
        <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">What did the guest send?</DialogTitle>
        <DialogDescription>Cassy writes one or two replies in her voice. Nothing is sent to the guest from here.</DialogDescription>
      </DialogHeader>
      <Tabs value={mode} onValueChange={(v) => edit(() => setMode(v as Mode))}>
        <TabsList aria-label="What the guest sent">
          <TabsTrigger value="text">Text</TabsTrigger>
          <TabsTrigger value="screenshot">Screenshot</TabsTrigger>
        </TabsList>
        <TabsContent value="text" className="mt-3 grid gap-1.5">
          <Label htmlFor="gr-text">Guest message</Label>
          <Textarea id="gr-text" value={text} onChange={(e) => edit(() => setText(e.target.value))} maxLength={MAX_GUEST_TEXT} rows={5} placeholder="Paste what the guest wrote." className="text-base" />
        </TabsContent>
        <TabsContent value="screenshot" className="mt-3 grid gap-1.5">
          <Label htmlFor="gr-file">Screenshot of the message</Label>
          <Input id="gr-file" type="file" accept="image/*" onChange={(e) => edit(() => setFile(e.target.files?.[0] ?? null))} />
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
            <ImagePlus className="size-3.5" aria-hidden />
            {file ? `Ready: ${file.name || 'pasted image'}. It is shrunk here before it is sent.` : 'Choose a file, or paste an image anywhere in this window.'}
          </p>
        </TabsContent>
      </Tabs>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="gr-name">Guest name <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="gr-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" />
        </div>
        <div className="grid gap-1.5">
          <span id="gr-platform" className="text-sm leading-none font-medium">Where it came from</span>
          <ToggleGroup type="single" variant="outline" aria-labelledby="gr-platform" value={platform} onValueChange={(v) => { if (v) setPlatform(v as GuestPlatform); }}>
            <ToggleGroupItem value="messenger">Messenger</ToggleGroupItem>
            <ToggleGroupItem value="airbnb">Airbnb</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
      {draft.isPending && <p className="text-sm text-muted-foreground">Cassy is writing the replies. This takes a few seconds.</p>}
      {draft.isError && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">{toAppError(draft.error).message}</p>}
      <DialogFooter>
        <Button type="submit" disabled={!ready || draft.isPending}>{draft.isPending ? 'Writing…' : 'Write replies'}</Button>
      </DialogFooter>
    </form>
  );
}

function Result({ d, onStartOver }: { d: GuestReplyDraft; onStartOver: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">Draft replies</DialogTitle>
        <DialogDescription className="line-clamp-3 whitespace-pre-wrap break-words">Replying to: {d.guest_text}</DialogDescription>
      </DialogHeader>
      <ul className="grid gap-3" aria-label="Draft replies">
        {d.replies.map((r, i) => <ReplyCard key={i} n={i + 1} text={r} />)}
      </ul>
      <DialogFooter><Button variant="outline" onClick={onStartOver}>Start over</Button></DialogFooter>
    </div>
  );
}

function ReplyCard({ n, text }: { n: number; text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setState('copied'); } catch { setState('failed'); }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  };
  return (
    <li className="rounded-lg border bg-card p-3">
      <p className="whitespace-pre-wrap break-words text-sm">{text}</p>
      <div className="mt-2 flex items-center justify-end gap-2">
        <span role="status" className={state === 'failed' ? 'text-xs text-muted-foreground' : 'sr-only'}>{state === 'failed' ? 'Could not copy. Select the text and copy it by hand.' : state === 'copied' ? `Reply ${n} copied.` : ''}</span>
        <Button size="sm" variant="outline" onClick={() => void copy()} aria-label={`Copy reply ${n}`}>
          {state === 'copied' ? <><Check aria-hidden /> Copied</> : <><Copy aria-hidden /> Copy</>}
        </Button>
      </div>
    </li>
  );
}
