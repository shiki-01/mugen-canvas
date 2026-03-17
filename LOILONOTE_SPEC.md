# LoiLoNote-Style Redesign Spec

## Core Paradigm
Two-layer architecture:
1. **Note Canvas** (ノートキャンバス): Infinite canvas where colored Cards sit. Cards can be dragged, resized, connected with yellow arrows. Dark navy background (like LoiLoNote). This is the "overview" layer.
2. **Card Editor** (カード編集画面): Full-screen editing view when you click/double-click a card. Has pen, text, shapes, eraser tools. Light background. This is the "detail" layer.

## Card Types
- **Text Card**: Default. Has a background color. Acts as a text area. Double-click or cursor click to start typing directly on the canvas. When opened in editor, can add drawings/annotations.
- **Image Card**: Created from image import. Shows image preview on canvas. Editor allows annotation.
- **PDF Card**: Created from PDF import. Shows first page preview. Editor allows annotation.

## Note Canvas (Layer 1) Design
- **Background**: Dark navy (#2c3e6b similar to LoiLoNote)
- **Left sidebar**: Vertical icon toolbar
  - カメラ (Camera) / テキスト (Text) / ファイル (File/Image) / PDF
  - Below: 資料箱 (Materials) / ゴミ箱 (Trash)
- **Cards on canvas**:
  - Colored rectangles (pink, yellow, blue, green, white, etc.)
  - Each has a **yellow arrow connector** in top-right corner
  - Drag arrow to another card to connect them
  - Connected cards show yellow lines between them
  - Double-click text cards to edit text inline
  - Single click to select, double-click to open in Card Editor
- **Top right**: Note name, metadata
- **Bottom right**: Trash icon

## Card Editor (Layer 2) Design  
- **Background**: Light (card's own color or white)
- **Top toolbar** (centered, rounded buttons):
  - ← Back button (return to canvas)
  - ＋ Add (sub-card or next card)
  - Pen/Drawing tool (鉛筆)
  - Text tool (あ)
  - Recording (マイク) — skip for now
  - Shape/Rectangle tool
  - ··· More options
- **Drawing tools**: pen, highlighter, eraser, selection
- **Text**: Add text boxes, change color/size
- **Cards in cards**: Can embed sub-cards inside

## Key Interactions
1. On canvas: Click card → select (blue border). Double-click → open editor.
2. On canvas: Drag yellow arrow from card corner → draw connection line → drop on another card.
3. Text card on canvas: Click once → cursor appears for inline text editing. 
4. In editor: All pen/text/shape tools available.
5. Press ← or Escape in editor → return to canvas (auto-save card content).

## Card Colors (LoiLoNote palette)
- Pink: #ffb5c0
- Yellow: #fff3b0  
- Blue: #b5d8ff
- Green: #b5ffc0
- White: #ffffff
- Orange: #ffd4a0
- Purple: #d4b5ff
