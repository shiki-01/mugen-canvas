// Connector chain utilities — shared by presentation playback and alignment.
// LoiLoNote-style: connected cards form an ordered sequence (from → to).

import type { Card, Connector } from '../types';

/**
 * Returns the ordered list of cards in the chain containing `cardId`.
 * Walks backwards to the chain root, then forwards following connectors.
 * Branches are resolved by taking the first outgoing connector.
 * Returns [card] if the card has no connections.
 */
export function getChain(cards: Card[], connectors: Connector[], cardId: string): Card[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  if (!byId.has(cardId)) return [];

  const prev = new Map<string, string>(); // toCardId -> fromCardId
  const next = new Map<string, string>(); // fromCardId -> toCardId
  for (const conn of connectors) {
    if (!prev.has(conn.toCardId)) prev.set(conn.toCardId, conn.fromCardId);
    if (!next.has(conn.fromCardId)) next.set(conn.fromCardId, conn.toCardId);
  }

  // Walk back to the root (guard against cycles)
  let root = cardId;
  const seen = new Set<string>([root]);
  while (prev.has(root)) {
    const p = prev.get(root)!;
    if (seen.has(p) || !byId.has(p)) break;
    seen.add(p);
    root = p;
  }

  // Walk forward from the root
  const chain: Card[] = [];
  const visited = new Set<string>();
  let cur: string | undefined = root;
  while (cur && byId.has(cur) && !visited.has(cur)) {
    visited.add(cur);
    chain.push(byId.get(cur)!);
    cur = next.get(cur);
  }
  return chain;
}

/**
 * Returns the playback order for presentation mode.
 * Starts from the chain containing `startCardId` if given; otherwise the
 * longest chain in the note; if there are no connectors, all cards in
 * creation order.
 */
export function getPresentationOrder(
  cards: Card[],
  connectors: Connector[],
  startCardId?: string | null,
): Card[] {
  if (cards.length === 0) return [];

  if (startCardId) {
    const chain = getChain(cards, connectors, startCardId);
    if (chain.length > 0) return chain;
  }

  if (connectors.length > 0) {
    let longest: Card[] = [];
    const covered = new Set<string>();
    for (const card of cards) {
      if (covered.has(card.id)) continue;
      const chain = getChain(cards, connectors, card.id);
      for (const c of chain) covered.add(c.id);
      if (chain.length > longest.length) longest = chain;
    }
    if (longest.length > 1) return longest;
  }

  return [...cards].sort((a, b) => a.createdAt - b.createdAt);
}
