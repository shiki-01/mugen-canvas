<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Card, Connector } from '$lib/types';
  import { CARD_COLORS } from '$lib/types';

  interface Props {
    cards: Card[];
    connectors: Connector[];
    onCardSelect: (id: string | null) => void;
    onCardOpen: (id: string) => void;
    onCardMove: (id: string, x: number, y: number) => void;
    onCardResize: (id: string, w: number, h: number) => void;
    onCardTextChange: (id: string, text: string) => void;
    onCardColorChange: (id: string, color: string) => void;
    onCardDelete: (id: string) => void;
    onConnectorCreate: (fromId: string, toId: string) => void;
    onConnectorDelete: (id: string) => void;
    selectedCardId: string | null;
  }

  let {
    cards, connectors, onCardSelect, onCardOpen, onCardMove,
    onCardResize, onCardTextChange, onCardColorChange, onCardDelete,
    onConnectorCreate, onConnectorDelete, selectedCardId,
  }: Props = $props();

  let containerEl: HTMLDivElement;
  let svgEl: SVGSVGElement;

  // Pan & zoom state
  let viewX = $state(0);
  let viewY = $state(0);
  let scale = $state(1);
  let isPanning = $state(false);
  let panStartX = 0;
  let panStartY = 0;
  let panStartViewX = 0;
  let panStartViewY = 0;

  // Drag card state
  let isDragging = $state(false);
  let dragCardId = $state<string | null>(null);
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragMoved = false;

  // Double-click detection
  let lastClickCardId: string | null = null;
  let lastClickTime = 0;

  // Connector drawing state
  let isDrawingConnector = $state(false);
  let connectorFromId = $state<string | null>(null);
  let connectorPreview = $state<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // Inline text editing
  let editingCardId = $state<string | null>(null);
  let editTextValue = $state('');

  // Color picker
  let colorPickerCardId = $state<string | null>(null);
  let colorPickerPos = $state({ x: 0, y: 0 });

  // Card context menu
  let contextMenuCardId = $state<string | null>(null);
  let contextMenuPos = $state({ x: 0, y: 0 });
  let hoveredCardId = $state<string | null>(null);

  function screenToCanvas(sx: number, sy: number) {
    const rect = containerEl.getBoundingClientRect();
    return {
      x: (sx - rect.left - viewX) / scale,
      y: (sy - rect.top - viewY) / scale,
    };
  }

  function canvasToScreen(cx: number, cy: number) {
    return {
      x: cx * scale + viewX,
      y: cy * scale + viewY,
    };
  }

  // === Pointer handlers for pan/drag/connect ===

  function handlePointerDown(e: PointerEvent) {
    // Don't interfere with context menu or color picker clicks
    const target = e.target as HTMLElement;
    if (target.closest('.context-menu') || target.closest('.color-picker-popup')) {
      return;
    }

    // Close menus on left-click
    if (e.button === 0) {
      colorPickerCardId = null;
      contextMenuCardId = null;
    }

    // Right-click: don't capture, let context menu handler fire
    if (e.button === 2) return;

    const cardTarget = (e.target as HTMLElement).closest('[data-card-id]') as HTMLElement | null;
    const isConnectorHandle = (e.target as HTMLElement).closest('.connector-handle');

    if (isConnectorHandle) {
      // Start drawing connector
      const cardId = (isConnectorHandle.closest('[data-card-id]') as HTMLElement)?.dataset.cardId;
      if (cardId) {
        e.preventDefault();
        e.stopPropagation();
        isDrawingConnector = true;
        connectorFromId = cardId;
        const card = cards.find(c => c.id === cardId);
        if (card) {
          connectorPreview = {
            x1: card.x + card.width,
            y1: card.y,
            x2: card.x + card.width,
            y2: card.y,
          };
        }
        containerEl.setPointerCapture(e.pointerId);
      }
      return;
    }

    if (cardTarget) {
      // Start dragging card
      const cardId = cardTarget.dataset.cardId!;
      onCardSelect(cardId);
      e.preventDefault();
      isDragging = true;
      dragCardId = cardId;
      dragMoved = false;
      const pos = screenToCanvas(e.clientX, e.clientY);
      const card = cards.find(c => c.id === cardId);
      if (card) {
        dragOffsetX = pos.x - card.x;
        dragOffsetY = pos.y - card.y;
      }
      containerEl.setPointerCapture(e.pointerId);
      return;
    }

    // Pan canvas
    onCardSelect(null);
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panStartViewX = viewX;
    panStartViewY = viewY;
    containerEl.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent) {
    if (isPanning) {
      viewX = panStartViewX + (e.clientX - panStartX);
      viewY = panStartViewY + (e.clientY - panStartY);
      return;
    }

    if (isDragging && dragCardId) {
      dragMoved = true;
      const pos = screenToCanvas(e.clientX, e.clientY);
      onCardMove(dragCardId, pos.x - dragOffsetX, pos.y - dragOffsetY);
      return;
    }

    if (isDrawingConnector && connectorPreview) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      connectorPreview = { ...connectorPreview, x2: pos.x, y2: pos.y };
      return;
    }
  }

  function handlePointerUp(e: PointerEvent) {
    if (isPanning) {
      isPanning = false;
      return;
    }

    if (isDragging && dragCardId) {
      const clickedId = dragCardId;
      isDragging = false;
      dragCardId = null;

      // Detect double-click (two clicks without drag within 400ms)
      if (!dragMoved) {
        const now = Date.now();
        if (lastClickCardId === clickedId && now - lastClickTime < 400) {
          handleCardDblClick(clickedId);
          lastClickCardId = null;
          lastClickTime = 0;
        } else {
          lastClickCardId = clickedId;
          lastClickTime = now;
        }
      } else {
        lastClickCardId = null;
        lastClickTime = 0;
      }
      return;
    }

    if (isDrawingConnector && connectorFromId) {
      isDrawingConnector = false;
      connectorPreview = null;
      // Check if dropped on a card
      const target = (e.target as HTMLElement).closest('[data-card-id]') as HTMLElement | null;
      if (target) {
        const toId = target.dataset.cardId!;
        if (toId !== connectorFromId) {
          onConnectorCreate(connectorFromId, toId);
        }
      }
      connectorFromId = null;
      return;
    }
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      const rect = containerEl.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const newScale = Math.max(0.1, Math.min(5, scale * factor));
      viewX = mx - (mx - viewX) * (newScale / scale);
      viewY = my - (my - viewY) * (newScale / scale);
      scale = newScale;
    } else {
      // Pan
      viewX -= e.deltaX;
      viewY -= e.deltaY;
    }
  }

  function handleCardDblClick(cardId: string) {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;

    if (card.type === 'text' && !card.editorData) {
      // Inline text editing for simple text cards
      editingCardId = cardId;
      editTextValue = card.text;
      tick().then(() => {
        const textarea = containerEl.querySelector(`textarea[data-edit-card="${cardId}"]`) as HTMLTextAreaElement;
        if (textarea) {
          textarea.focus();
          textarea.select();
        }
      });
    } else {
      // Open card editor for rich editing
      onCardOpen(cardId);
    }
  }

  function finishInlineEdit() {
    if (editingCardId) {
      onCardTextChange(editingCardId, editTextValue);
      editingCardId = null;
    }
  }

  function handleContextMenu(e: MouseEvent, cardId: string) {
    e.preventDefault();
    contextMenuCardId = cardId;
    contextMenuPos = { x: e.clientX, y: e.clientY };
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (editingCardId) {
      if (e.key === 'Escape') {
        finishInlineEdit();
      }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedCardId && document.activeElement === document.body) {
        onCardDelete(selectedCardId);
      }
    }
  }

  // Get connector line endpoints
  function getConnectorLine(conn: Connector) {
    const from = cards.find(c => c.id === conn.fromCardId);
    const to = cards.find(c => c.id === conn.toCardId);
    if (!from || !to) return null;
    return {
      x1: from.x + from.width / 2,
      y1: from.y + from.height / 2,
      x2: to.x + to.width / 2,
      y2: to.y + to.height / 2,
    };
  }

  function getCardTextColor(bgColor: string): string {
    // Simple luminance check
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#333333' : '#ffffff';
  }

  onMount(() => {
    // Center the view
    const rect = containerEl.getBoundingClientRect();
    viewX = rect.width / 2;
    viewY = rect.height / 2;

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

<div
  class="w:100% h:100% position:relative overflow:hidden bg:$cv-bg cursor:grab cursor:grabbing:active touch-action:none"
  bind:this={containerEl}
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onwheel={handleWheel}
  role="application"
>
  <!-- SVG connector layer -->
  <svg
    class="position:absolute inset:0 w:100% h:100% pointer-events:none z:1"
    bind:this={svgEl}
  >
    <g transform="translate({viewX},{viewY}) scale({scale})">
      {#each connectors as conn}
        {@const line = getConnectorLine(conn)}
        {#if line}
          <line
            x1={line.x1} y1={line.y1}
            x2={line.x2} y2={line.y2}
            stroke="var(--conn)"
            stroke-width={2.5 / scale}
            stroke-linecap="round"
          />
          <!-- Arrowhead -->
          {@const angle = Math.atan2(line.y2 - line.y1, line.x2 - line.x1)}
          {@const headLen = 12 / scale}
          <polygon
            points="{line.x2},{line.y2}
              {line.x2 - headLen * Math.cos(angle - 0.4)},{line.y2 - headLen * Math.sin(angle - 0.4)}
              {line.x2 - headLen * Math.cos(angle + 0.4)},{line.y2 - headLen * Math.sin(angle + 0.4)}"
            fill="var(--conn)"
          />
        {/if}
      {/each}
      <!-- Connector preview -->
      {#if connectorPreview}
        <line
          x1={connectorPreview.x1} y1={connectorPreview.y1}
          x2={connectorPreview.x2} y2={connectorPreview.y2}
          stroke="var(--conn)"
          stroke-width={2 / scale}
          stroke-dasharray="{6 / scale},{4 / scale}"
          stroke-linecap="round"
        />
      {/if}
    </g>
  </svg>

  <!-- Cards layer -->
  <div
    class="position:absolute top:0 left:0 z:2"
    style="transform: translate({viewX}px, {viewY}px) scale({scale}); transform-origin: 0 0;"
  >
    {#each cards as card (card.id)}
      <div
        role="button"
        tabindex="0"
        aria-label="card"
        class={`position:absolute r:4px box-shadow:0|2px|8px|$cds cursor:pointer transition:box-shadow|.15s overflow:hidden d:flex flex:column box-shadow:0|4px|16px|$cds:hover ${selectedCardId === card.id ? 'outline:3px|solid|$sel outline-offset:-1px' : ''}`}
        data-card-id={card.id}
        style="
          left: {card.x}px;
          top: {card.y}px;
          width: {card.width}px;
          height: {card.height}px;
          background: {card.color};
          color: {getCardTextColor(card.color)};
        "
        oncontextmenu={(e) => handleContextMenu(e, card.id)}
        onmouseenter={() => (hoveredCardId = card.id)}
        onmouseleave={() => (hoveredCardId = null)}
      >
        <!-- Connector handle (yellow arrow, top-right) -->
        <button
          class={`connector-handle position:absolute top:-2px right:-2px w:28px h:28px d:flex ai:center jc:center color:$conn cursor:crosshair z:10 transition:opacity|.15s filter:drop-shadow(0|1px|2px|rgb(0_0_0/.3)) ${hoveredCardId === card.id || selectedCardId === card.id ? 'opacity:1' : 'opacity:0 pointer-events:none'}`}
          title="ドラッグして接続"
          onclick={(e) => e.stopPropagation()}
        >
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path d="M3 13L13 3M13 3H6M13 3v7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
          </svg>
        </button>

        <!-- Card content -->
        <div class="flex:1 px:12px py:10px overflow:hidden d:flex flex:column">
          {#if editingCardId === card.id}
            <textarea
              class="w:100% h:100% b:none outline:none bg:transparent font-size:13px lh:1.5 font-family:inherit resize:none p:0"
              data-edit-card={card.id}
              bind:value={editTextValue}
              onblur={finishInlineEdit}
              onkeydown={(e) => { if (e.key === 'Escape') finishInlineEdit(); }}
              style="color: {getCardTextColor(card.color)};"
            ></textarea>
          {:else if card.type === 'text'}
            <div class="font-size:13px lh:1.5 word-break:break-word white-space:pre-wrap">{card.text || 'テキストを入力...'}</div>
          {:else if card.type === 'image' && card.imageDataUrl}
            <img class="w:100% h:100% object-fit:cover r:2px" src={card.imageDataUrl} alt={card.text || 'image'} />
            {#if card.text}
              <div class="position:absolute bottom:4px left:4px right:4px font-size:11px bg:rgb(0_0_0/.5) color:#fff px:6px py:2px r:3px text-align:center white-space:nowrap overflow:hidden text-overflow:ellipsis">{card.text}</div>
            {/if}
          {:else if card.type === 'pdf' && card.imageDataUrl}
            <img class="w:100% h:100% object-fit:cover r:2px" src={card.imageDataUrl} alt="PDF" />
            <div class="position:absolute bottom:4px left:4px right:4px font-size:11px bg:rgb(0_0_0/.5) color:#fff px:6px py:2px r:3px text-align:center white-space:nowrap overflow:hidden text-overflow:ellipsis">PDF</div>
          {:else}
            <div class="font-size:13px lh:1.5 word-break:break-word white-space:pre-wrap">{card.text || ''}</div>
          {/if}
        </div>

        <!-- Editor icon (shows on hover for cards with editor data) -->
        {#if card.editorData}
          <div class="position:absolute bottom:4px right:4px font-size:10px">✏️</div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Context menu -->
  {#if contextMenuCardId}
    <div
      class="context-menu position:fixed bg:$sf b:1|solid|$bd r:8px box-shadow:0|4px|16px|rgb(0_0_0/.2) z:100 overflow:hidden min-w:120px"
      style="left: {contextMenuPos.x}px; top: {contextMenuPos.y}px;"
    >
      <button class="d:block w:100% px:16px py:8px text-align:left font-size:13px color:$tx bg:$pri:hover color:#fff:hover" onclick={() => { if (contextMenuCardId) onCardOpen(contextMenuCardId); contextMenuCardId = null; }}>
        編集
      </button>
      <button class="d:block w:100% px:16px py:8px text-align:left font-size:13px color:$tx bg:$pri:hover color:#fff:hover" onclick={() => { colorPickerCardId = contextMenuCardId; colorPickerPos = contextMenuPos; contextMenuCardId = null; }}>
        色を変更
      </button>
      <button class="d:block w:100% px:16px py:8px text-align:left font-size:13px color:$tx bg:#ef4444:hover color:#fff:hover" onclick={() => { if (contextMenuCardId) onCardDelete(contextMenuCardId); contextMenuCardId = null; }}>
        削除
      </button>
    </div>
  {/if}

  <!-- Color picker popup -->
  {#if colorPickerCardId}
    <div
      class="color-picker-popup position:fixed d:flex gap:6px flex-wrap:wrap max-w:180px p:8px bg:$sf b:1|solid|$bd r:10px box-shadow:0|4px|16px|rgb(0_0_0/.2) z:100"
      style="left: {colorPickerPos.x}px; top: {colorPickerPos.y}px;"
    >
      {#each CARD_COLORS as color}
        <button
          aria-label="color"
          class="w:28px h:28px r:50% b:2|solid|rgb(0_0_0/.15) cursor:pointer transform:scale(1.15):hover"
          style="background: {color};"
          onclick={() => { if (colorPickerCardId) onCardColorChange(colorPickerCardId, color); colorPickerCardId = null; }}
        ></button>
      {/each}
    </div>
  {/if}
</div>
