// === Card-based architecture (LoiLoNote-style) ===

export type CardType = 'text' | 'image' | 'pdf';

export interface Card {
  id: string;
  type: CardType;
  // Position on the note canvas
  x: number;
  y: number;
  width: number;
  height: number;
  // Visual
  color: string; // background color
  // Content
  text: string; // for text cards, the main text; for others, a label
  imageDataUrl: string | null; // for image/pdf cards: preview thumbnail
  // Editor canvas data (pen strokes, annotations, sub-objects)
  editorData: string | null; // Fabric.js JSON of the card's internal canvas
  // Metadata
  createdAt: number;
  updatedAt: number;
}

export interface Connector {
  id: string;
  fromCardId: string;
  toCardId: string;
}

export interface Note {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  cards: Card[];
  connectors: Connector[];
  // Organization
  folderId: string | null;
  tags: string[];
  trashed: boolean;
  trashedAt: number | null;
  thumbnail: string | null;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  color: string;
}

// Card colors (LoiLoNote palette)
export const CARD_COLORS = [
  '#fff3b0', // yellow (default)
  '#ffb5c0', // pink
  '#b5d8ff', // blue
  '#b5ffc0', // green
  '#ffffff', // white
  '#ffd4a0', // orange
  '#d4b5ff', // purple
  '#ffc0c0', // red
];

// Editor tool types
export type EditorToolType = 'select' | 'pen' | 'highlighter' | 'eraser' | 'text' | 'shape';

export type ShapeType = 'rect' | 'ellipse' | 'line' | 'arrow';

export interface PenSettings {
  color: string;
  width: number;
  opacity: number;
}

export interface TextSettings {
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fill: string;
}

// View state
export type ViewMode = 'canvas' | 'editor';
