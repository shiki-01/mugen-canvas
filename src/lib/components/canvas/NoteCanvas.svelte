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
    onAlignChain: (cardId: string) => void;
    selectedCardId: string | null;
  }

  let {
    cards, connectors, onCardSelect, onCardOpen, onCardMove,
    onCardResize, onCardTextChange, onCardColorChange, onCardDelete,
    onConnectorCreate, onConnectorDelete, onAlignChain, selectedCardId,
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

  // Resize card state
  let isResizing = $state(false);
  let resizeCardId = $state<string | null>(null);

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

    // Tap on a connector line: disconnect (LoiLoNote behavior)
    const connHit = (e.target as Element).closest?.('.connector-hit') as SVGElement | null;
    if (connHit?.dataset.connId) {
      onConnectorDelete(connHit.dataset.connId);
      return;
    }

    const cardTarget = (e.target as HTMLElement).closest('[data-card-id]') as HTMLElement | null;
    const isConnectorHandle = (e.target as HTMLElement).closest('.connector-handle');
    const isResizeHandle = (e.target as HTMLElement).closest('.resize-handle');

    if (isResizeHandle && cardTarget) {
      e.preventDefault();
      e.stopPropagation();
      isResizing = true;
      resizeCardId = cardTarget.dataset.cardId!;
      containerEl.setPointerCapture(e.pointerId);
      return;
    }

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
            y1: card.y + card.height / 2,
            x2: card.x + card.width,
            y2: card.y + card.height / 2,
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

    if (isResizing && resizeCardId) {
      const card = cards.find(c => c.id === resizeCardId);
      if (card) {
        const pos = screenToCanvas(e.clientX, e.clientY);
        onCardResize(resizeCardId, Math.max(80, pos.x - card.x), Math.max(60, pos.y - card.y));
      }
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

    if (isResizing) {
      isResizing = false;
      resizeCardId = null;
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
      // Find the card under the pointer (e.target is the capture element, so hit-test by coordinates)
      const pos = screenToCanvas(e.clientX, e.clientY);
      const target = [...cards].reverse().find(
        c => pos.x >= c.x && pos.x <= c.x + c.width && pos.y >= c.y && pos.y <= c.y + c.height,
      );
      if (target && target.id !== connectorFromId) {
        onConnectorCreate(connectorFromId, target.id);
      }
      connectorFromId = null;
      return;
    }
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const rect = containerEl.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY > 0 ? 0.92 : 1.08);
    } else {
      viewX -= e.deltaX;
      viewY -= e.deltaY;
    }
  }

  // === Zoom controls ===

  function zoomAt(mx: number, my: number, factor: number) {
    const newScale = Math.max(0.1, Math.min(5, scale * factor));
    viewX = mx - (mx - viewX) * (newScale / scale);
    viewY = my - (my - viewY) * (newScale / scale);
    scale = newScale;
  }

  function zoomByButton(factor: number) {
    const rect = containerEl.getBoundingClientRect();
    zoomAt(rect.width / 2, rect.height / 2, factor);
  }

  function zoomFit() {
    if (cards.length === 0) {
      const rect = containerEl.getBoundingClientRect();
      scale = 1;
      viewX = rect.width / 2;
      viewY = rect.height / 2;
      return;
    }
    const minX = Math.min(...cards.map(c => c.x));
    const minY = Math.min(...cards.map(c => c.y));
    const maxX = Math.max(...cards.map(c => c.x + c.width));
    const maxY = Math.max(...cards.map(c => c.y + c.height));
    const rect = containerEl.getBoundingClientRect();
    const pad = 60;
    const fitScale = Math.max(
      0.1,
      Math.min(5, Math.min((rect.width - pad * 2) / (maxX - minX), (rect.height - pad * 2) / (maxY - minY))),
    );
    scale = fitScale;
    viewX = rect.width / 2 - ((minX + maxX) / 2) * fitScale;
    viewY = rect.height / 2 - ((minY + maxY) / 2) * fitScale;
  }

  // Canvas coordinates at the center of the current viewport (for placing new cards)
  export function getViewportCenter() {
    const rect = containerEl.getBoundingClientRect();
    return screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function handleCardDblClick(cardId: string) {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;

    if (card.type === 'web' && card.url) {
      // Web cards open the linked page (LoiLoNote web card behavior)
      window.open(card.url, '_blank', 'noopener,noreferrer');
      return;
    }

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

  // Intersection of the segment (card center -> target point) with the card's border
  function edgePoint(card: Card, tx: number, ty: number) {
    const cx = card.x + card.width / 2;
    const cy = card.y + card.height / 2;
    const dx = tx - cx;
    const dy = ty - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };
    const sx = dx !== 0 ? card.width / 2 / Math.abs(dx) : Infinity;
    const sy = dy !== 0 ? card.height / 2 / Math.abs(dy) : Infinity;
    const s = Math.min(sx, sy);
    return { x: cx + dx * s, y: cy + dy * s };
  }

  // Get connector line endpoints (edge-to-edge, LoiLoNote style)
  function getConnectorLine(conn: Connector) {
    const from = cards.find(c => c.id === conn.fromCardId);
    const to = cards.find(c => c.id === conn.toCardId);
    if (!from || !to) return null;
    const toCx = to.x + to.width / 2;
    const toCy = to.y + to.height / 2;
    const fromCx = from.x + from.width / 2;
    const fromCy = from.y + from.height / 2;
    const p1 = edgePoint(from, toCx, toCy);
    const p2 = edgePoint(to, fromCx, fromCy);
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
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
  <!-- SVG connector layer (pointer-events auto so hit-area lines are clickable) -->
  <svg
    class="position:absolute inset:0 w:100% h:100% z:1"
    style="pointer-events: none;"
    bind:this={svgEl}
  >
    <g transform="translate({viewX},{viewY}) scale({scale})">
      {#each connectors as conn (conn.id)}
        {@const line = getConnectorLine(conn)}
        {#if line}
          <line
            x1={line.x1} y1={line.y1}
            x2={line.x2} y2={line.y2}
            stroke="var(--conn)"
            stroke-width={3 / scale}
            stroke-linecap="round"
          />
          <!-- Arrowhead -->
          {@const angle = Math.atan2(line.y2 - line.y1, line.x2 - line.x1)}
          {@const headLen = 14 / scale}
          <polygon
            points="{line.x2},{line.y2}
              {line.x2 - headLen * Math.cos(angle - 0.4)},{line.y2 - headLen * Math.sin(angle - 0.4)}
              {line.x2 - headLen * Math.cos(angle + 0.4)},{line.y2 - headLen * Math.sin(angle + 0.4)}"
            fill="var(--conn)"
          />
          <!-- Invisible wide hit area: tap the line to disconnect -->
          <line
            class="connector-hit"
            data-conn-id={conn.id}
            x1={line.x1} y1={line.y1}
            x2={line.x2} y2={line.y2}
            stroke="transparent"
            stroke-width={16 / scale}
            stroke-linecap="round"
            style="pointer-events: stroke; cursor: pointer;"
          >
            <title>タップして接続を解除</title>
          </line>
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
        <!-- Connector handle (yellow arrow at right-center edge, LoiLoNote style) -->
        <button
          class={`connector-handle position:absolute top:50% right:-14px translateY(-50%) w:26px h:26px d:flex ai:center jc:center r:50% bg:$conn color:#5b4a00 cursor:crosshair z:10 transition:opacity|.15s box-shadow:0|1px|4px|rgb(0_0_0/.35) ${hoveredCardId === card.id || selectedCardId === card.id ? 'opacity:1' : 'opacity:0 pointer-events:none'}`}
          title="ドラッグして次のカードへつなぐ"
          onclick={(e) => e.stopPropagation()}
        >
          <svg viewBox="0 0 16 16" width="13" height="13">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
          </svg>
        </button>

        <!-- Resize handle (bottom-right, selected card only) -->
        {#if selectedCardId === card.id}
          <div
            class="resize-handle position:absolute bottom:-6px right:-6px w:16px h:16px r:50% bg:$sel b:2|solid|#fff cursor:nwse-resize z:10 box-shadow:0|1px|4px|rgb(0_0_0/.35)"
            title="ドラッグしてサイズ変更"
          ></div>
        {/if}

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
          {:else if card.type === 'web'}
            <div class="d:flex flex:column ai:center jc:center gap:6px h:100%">
              <span class="font-size:24px">🌐</span>
              <div class="font-size:12px font-weight:600 text-align:center word-break:break-word">{card.text || 'Webカード'}</div>
              {#if card.url}
                <div class="font-size:10px opacity:.6 text-align:center word-break:break-all max-h:28px overflow:hidden">{card.url}</div>
              {/if}
            </div>
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

  <!-- Zoom controls (bottom-right) -->
  <div class="position:absolute bottom:16px right:16px d:flex ai:center gap:2px p:3px bg:$sf b:1|solid|$bd r:10px box-shadow:0|2px|8px|rgb(0_0_0/.2) z:10">
    <button
      class="w:30px h:30px d:flex ai:center jc:center r:7px color:$tx font-size:16px bg:rgb(0_0_0/.08):hover"
      onclick={() => zoomByButton(1 / 1.2)}
      onpointerdown={(e) => e.stopPropagation()}
      title="縮小"
    >−</button>
    <button
      class="px:6px h:30px d:flex ai:center jc:center r:7px color:$tx font-size:11px min-w:44px bg:rgb(0_0_0/.08):hover"
      onclick={() => { scale = 1; }}
      onpointerdown={(e) => e.stopPropagation()}
      title="100%に戻す"
    >{Math.round(scale * 100)}%</button>
    <button
      class="w:30px h:30px d:flex ai:center jc:center r:7px color:$tx font-size:16px bg:rgb(0_0_0/.08):hover"
      onclick={() => zoomByButton(1.2)}
      onpointerdown={(e) => e.stopPropagation()}
      title="拡大"
    >＋</button>
    <button
      class="px:8px h:30px d:flex ai:center jc:center r:7px color:$tx font-size:11px bg:rgb(0_0_0/.08):hover"
      onclick={zoomFit}
      onpointerdown={(e) => e.stopPropagation()}
      title="すべてのカードを表示"
    >全体</button>
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
      {#if connectors.some((c) => c.fromCardId === contextMenuCardId || c.toCardId === contextMenuCardId)}
        <button class="d:block w:100% px:16px py:8px text-align:left font-size:13px color:$tx bg:$pri:hover color:#fff:hover" onclick={() => { if (contextMenuCardId) onAlignChain(contextMenuCardId); contextMenuCardId = null; }}>
          整列
        </button>
      {/if}
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
