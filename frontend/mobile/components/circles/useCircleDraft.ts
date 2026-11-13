import { useCallback, useMemo, useState } from 'react';

import type { Circle, CircleInput, UserLite } from '@/lib/types';

export type CircleDraft = {
  name: string;
  emoji: string;
  members: UserLite[];
  selected: Record<string, true>;
  setName: (v: string) => void;
  setEmoji: (v: string) => void;
  toggle: (u: UserLite) => void;
  /** Replace everything from a saved Circle. */
  reset: (c: Circle) => void;
  input: () => CircleInput;
  valid: boolean;
};

/** Local edit state for a Circle: name, emoji and members. */
export function useCircleDraft(initial?: Circle): CircleDraft {
  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '');
  const [members, setMembers] = useState<UserLite[]>(initial?.members ?? []);

  const selected = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, true as const])) as Record<string, true>,
    [members],
  );

  const toggle = useCallback(
    (u: UserLite) => setMembers((prev) => (prev.some((m) => m.id === u.id) ? prev.filter((m) => m.id !== u.id) : [...prev, u])),
    [],
  );

  const reset = useCallback((c: Circle) => {
    setName(c.name);
    setEmoji(c.emoji);
    setMembers(c.members);
  }, []);

  const input = useCallback(
    (): CircleInput => ({ name: name.trim(), emoji, member_ids: members.map((m) => m.id) }),
    [name, emoji, members],
  );

  return { name, emoji, members, selected, setName, setEmoji, toggle, reset, input, valid: name.trim().length > 0 };
}
