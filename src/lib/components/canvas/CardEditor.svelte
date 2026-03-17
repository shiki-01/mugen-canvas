<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as fabric from 'fabric';
  import type { Card, EditorToolType, ShapeType, PenSettings, TextSettings } from '$lib/types';
  import Icon from '$lib/components/shared/Icon.svelte';

  interface Props {
    card: Card;
    onBack: () => void;
    onSave: (editorData: string, text: string) => void;
  }

  let { card, onBack, onSave }: Props = $props();

  let canvasEl: HTMLCanvasElement;
  let containerEl: HTMLDivElement;
  let fabricCanvas: fabric.Canvas;

  let currentTool = $state<EditorToolType>('select');
  let penSettings = $state<PenSettings>({ color: '#333333', width: 3, opacity: 1 });
  let textSettings = $state<TextSettings>({ fontFamily: 'Inter, Noto Sans JP, sans-serif', fontSize: 16, fontWeight: 'normal', fill: '#333333' });
  let shapeType = $state<ShapeType>('rect');

  // Pen colors
  const PEN_COLORS = ['#333333', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ffffff'];
  const PEN_WIDTHS = [2, 4, 6, 10];

  // Shape drawing
  let isDrawingShape = false;
  let shapeStartPoint: { x: number; y: number } | null = null;
  let currentShapeObj: fabric.Object | null = null;

  // Undo/redo
  let undoStack: string[] = [];
  let redoStack: string[] = [];
  let saving = false;
  let canUndo = $state(false);
  let canRedo = $state(false);

  // Color picker
  let showPenColors = $state(false);
  let showWidths = $state(false);

  onMount(() => {
    const rect = containerEl.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    fabricCanvas = new fabric.Canvas(canvasEl, {
      width: w,
      height: h,
      backgroundColor: card.color,
      selection: true,
      preserveObjectStacking: true,
      enableRetinaScaling: true,
    });

    // Load existing editor data
    if (card.editorData) {
      saving = true;
      fabricCanvas.loadFromJSON(card.editorData).then(() => {
        fabricCanvas.requestRenderAll();
        saving = false;
        saveState();
      });
    } else {
      // For text cards, add the text as an initial text object
      if (card.type === 'text' && card.text) {
        const textObj = new fabric.IText(card.text, {
          left: 20,
          top: 20,
          fontFamily: textSettings.fontFamily,
          fontSize: 18,
          fill: '#333333',
          editable: true,
        });
        fabricCanvas.add(textObj);
      }
      // For image/pdf cards, add image as background
      if ((card.type === 'image' || card.type === 'pdf') && card.imageDataUrl) {
        const imgEl = new Image();
        imgEl.onload = () => {
          const fabricImg = new fabric.FabricImage(imgEl, {
            left: 0, top: 0,
            scaleX: Math.min(1, w / imgEl.width),
            scaleY: Math.min(1, h / imgEl.height),
            selectable: false,
            evented: false,
          });
          fabricCanvas.add(fabricImg);
          fabricCanvas.sendObjectToBack(fabricImg);
          fabricCanvas.requestRenderAll();
          saveState();
        };
        imgEl.src = card.imageDataUrl;
      }
      saveState();
    }

    // Mouse handlers for shape drawing
    fabricCanvas.on('mouse:down', handleMouseDown);
    fabricCanvas.on('mouse:move', handleMouseMove);
    fabricCanvas.on('mouse:up', handleMouseUp);
    fabricCanvas.on('object:modified', () => saveState());

    // Handle resize
    const ro = new ResizeObserver(() => {
      const r = containerEl.getBoundingClientRect();
      fabricCanvas.setDimensions({ width: r.width, height: r.height });
      fabricCanvas.requestRenderAll();
    });
    ro.observe(containerEl);

    return () => {
      ro.disconnect();
    };
  });

  onDestroy(() => {
    if (fabricCanvas) {
      // Save before closing
      doSave();
      fabricCanvas.dispose();
    }
  });

  function doSave() {
    if (!fabricCanvas) return;
    const json = JSON.stringify(fabricCanvas.toJSON());
    // Extract text content from all text objects
    let allText = '';
    fabricCanvas.getObjects().forEach(obj => {
      if (obj instanceof fabric.IText || obj instanceof fabric.Text) {
        if (obj.text) allText += obj.text + ' ';
      }
    });
    onSave(json, allText.trim() || card.text);
  }

  function saveState() {
    if (saving) return;
    saving = true;
    const json = JSON.stringify(fabricCanvas.toJSON());
    undoStack.push(json);
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
    canUndo = undoStack.length > 1;
    canRedo = false;
    saving = false;
  }

  function undo() {
    if (undoStack.length <= 1) return;
    const current = undoStack.pop()!;
    redoStack.push(current);
    const prev = undoStack[undoStack.length - 1];
    saving = true;
    fabricCanvas.loadFromJSON(prev).then(() => {
      fabricCanvas.requestRenderAll();
      saving = false;
      canUndo = undoStack.length > 1;
      canRedo = redoStack.length > 0;
    });
  }

  function redo() {
    if (redoStack.length === 0) return;
    const next = redoStack.pop()!;
    undoStack.push(next);
    saving = true;
    fabricCanvas.loadFromJSON(next).then(() => {
      fabricCanvas.requestRenderAll();
      saving = false;
      canUndo = undoStack.length > 1;
      canRedo = redoStack.length > 0;
    });
  }

  function setTool(tool: EditorToolType) {
    currentTool = tool;
    showPenColors = false;
    showWidths = false;

    fabricCanvas.isDrawingMode = tool === 'pen' || tool === 'highlighter';
    fabricCanvas.selection = tool === 'select';

    if (tool === 'pen') {
      const brush = new fabric.PencilBrush(fabricCanvas);
      brush.color = penSettings.color;
      brush.width = penSettings.width;
      fabricCanvas.freeDrawingBrush = brush;
    } else if (tool === 'highlighter') {
      const brush = new fabric.PencilBrush(fabricCanvas);
      brush.color = penSettings.color + '60'; // semi-transparent
      brush.width = penSettings.width * 3;
      fabricCanvas.freeDrawingBrush = brush;
    }

    fabricCanvas.getObjects().forEach(obj => {
      obj.selectable = tool === 'select';
      obj.evented = tool === 'select' || tool === 'eraser' || tool === 'text';
    });
    fabricCanvas.requestRenderAll();
  }

  function handleMouseDown(opt: fabric.TPointerEventInfo) {
    const pointer = fabricCanvas.getScenePoint(opt.e);

    if (currentTool === 'text') {
      if (!opt.target || !(opt.target instanceof fabric.IText)) {
        const text = new fabric.IText('テキスト', {
          left: pointer.x,
          top: pointer.y,
          fontFamily: textSettings.fontFamily,
          fontSize: textSettings.fontSize,
          fill: textSettings.fill,
          editable: true,
        });
        fabricCanvas.add(text);
        fabricCanvas.setActiveObject(text);
        text.enterEditing();
        text.selectAll();
        saveState();
      }
      return;
    }

    if (currentTool === 'eraser') {
      if (opt.target) {
        fabricCanvas.remove(opt.target);
        fabricCanvas.requestRenderAll();
        saveState();
      }
      return;
    }

    if (currentTool === 'shape') {
      isDrawingShape = true;
      shapeStartPoint = { x: pointer.x, y: pointer.y };
      return;
    }
  }

  function handleMouseMove(opt: fabric.TPointerEventInfo) {
    if (isDrawingShape && shapeStartPoint) {
      const pointer = fabricCanvas.getScenePoint(opt.e);
      if (currentShapeObj) fabricCanvas.remove(currentShapeObj);
      const x1 = shapeStartPoint.x, y1 = shapeStartPoint.y;
      const x2 = pointer.x, y2 = pointer.y;
      const left = Math.min(x1, x2), top = Math.min(y1, y2);
      const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
      const opts = { left, top, stroke: penSettings.color, strokeWidth: 2, fill: 'transparent', selectable: false, evented: false };

      if (shapeType === 'rect') {
        currentShapeObj = new fabric.Rect({ ...opts, width: w, height: h });
      } else if (shapeType === 'ellipse') {
        currentShapeObj = new fabric.Ellipse({ ...opts, rx: w / 2, ry: h / 2 });
      } else if (shapeType === 'line') {
        currentShapeObj = new fabric.Line([x1, y1, x2, y2], { stroke: penSettings.color, strokeWidth: 2, selectable: false, evented: false });
      } else {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLen = 15;
        const pts = [
          { x: x1, y: y1 }, { x: x2, y: y2 },
          { x: x2 - headLen * Math.cos(angle - Math.PI / 6), y: y2 - headLen * Math.sin(angle - Math.PI / 6) },
          { x: x2, y: y2 },
          { x: x2 - headLen * Math.cos(angle + Math.PI / 6), y: y2 - headLen * Math.sin(angle + Math.PI / 6) },
        ];
        currentShapeObj = new fabric.Polyline(pts, { stroke: penSettings.color, strokeWidth: 2, fill: 'transparent', selectable: false, evented: false });
      }
      if (currentShapeObj) {
        fabricCanvas.add(currentShapeObj);
        fabricCanvas.requestRenderAll();
      }
    }
  }

  function handleMouseUp(_opt: fabric.TPointerEventInfo) {
    if (isDrawingShape) {
      isDrawingShape = false;
      shapeStartPoint = null;
      if (currentShapeObj) {
        currentShapeObj.set({ selectable: true, evented: true });
        currentShapeObj = null;
        saveState();
      }
    }
  }

  function handleBack() {
    doSave();
    onBack();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      handleBack();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      redo();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="w:100% h:100% d:flex flex:column bg:$ed-bg">
  <!-- Top toolbar -->
  <div class="d:flex ai:center gap:6px px:10px py:6px bg:$edtb-bg b-b:1|solid|$edtb-bd flex-shrink:0 min-h:44px flex-wrap:wrap">
    <button class="w:36px h:36px d:flex ai:center jc:center r:8px color:$tx bg:rgb(0_0_0/.06) bg:rgb(0_0_0/.08):hover" onclick={handleBack} title="戻る (Esc)">
      <Icon name="arrow-left" size={20} />
    </button>

    <div class="d:flex ai:center gap:2px bg:rgb(0_0_0/.06) r:10px p:2px">
      <button class={`w:36px h:36px d:flex ai:center jc:center r:8px color:$tx bg:rgb(0_0_0/.08):hover ${currentTool === 'select' ? 'bg:$pri color:#fff' : ''}`} onclick={() => setTool('select')} title="選択">
        <Icon name="select" size={18} />
      </button>
      <button class={`w:36px h:36px d:flex ai:center jc:center r:8px color:$tx bg:rgb(0_0_0/.08):hover ${currentTool === 'pen' ? 'bg:$pri color:#fff' : ''}`} onclick={() => setTool('pen')} title="ペン">
        <Icon name="pen" size={18} />
      </button>
      <button class={`w:36px h:36px d:flex ai:center jc:center r:8px color:$tx bg:rgb(0_0_0/.08):hover ${currentTool === 'highlighter' ? 'bg:$pri color:#fff' : ''}`} onclick={() => setTool('highlighter')} title="マーカー">
        <Icon name="highlighter" size={18} />
      </button>
      <button class={`w:36px h:36px d:flex ai:center jc:center r:8px color:$tx bg:rgb(0_0_0/.08):hover ${currentTool === 'text' ? 'bg:$pri color:#fff' : ''}`} onclick={() => setTool('text')} title="テキスト">
        <span style="font-weight:700;font-size:16px;">あ</span>
      </button>
      <button class={`w:36px h:36px d:flex ai:center jc:center r:8px color:$tx bg:rgb(0_0_0/.08):hover ${currentTool === 'eraser' ? 'bg:$pri color:#fff' : ''}`} onclick={() => setTool('eraser')} title="消しゴム">
        <Icon name="eraser" size={18} />
      </button>
      <button class={`w:36px h:36px d:flex ai:center jc:center r:8px color:$tx bg:rgb(0_0_0/.08):hover ${currentTool === 'shape' ? 'bg:$pri color:#fff' : ''}`} onclick={() => setTool('shape')} title="図形">
        <Icon name="shapes" size={18} />
      </button>
    </div>

    <!-- Pen color quick selector -->
    {#if currentTool === 'pen' || currentTool === 'highlighter'}
      <div class="d:flex ai:center gap:4px px:6px">
        {#each PEN_COLORS as color}
          <button
            aria-label="pen-color"
            class={`w:20px h:20px r:50% b:2|solid|transparent transition:transform|.1s transform:scale(1.1):hover ${penSettings.color === color ? 'b-c:$pri transform:scale(1.15)' : ''}`}
            style="background: {color}; {color === '#ffffff' ? 'border: 1px solid #ccc;' : ''}"
            onclick={() => {
              penSettings = { ...penSettings, color };
              setTool(currentTool);
            }}
          ></button>
        {/each}
      </div>
      <div class="d:flex ai:center gap:4px px:4px b-l:1|solid|$edtb-bd ml:4px">
        {#each PEN_WIDTHS as w}
          <button
            aria-label="pen-width"
            class={`w:28px h:28px d:flex ai:center jc:center r:6px ${penSettings.width === w ? 'bg:rgb(0_0_0/.1)' : ''}`}
            onclick={() => {
              penSettings = { ...penSettings, width: w };
              setTool(currentTool);
            }}
          >
            <span class="d:block r:50% bg:$tx" style="width: {w + 2}px; height: {w + 2}px;"></span>
          </button>
        {/each}
      </div>
    {/if}

    {#if currentTool === 'shape'}
      <div class="d:flex gap:2px p:2px bg:rgb(0_0_0/.06) r:8px">
        <button class={`w:32px h:32px d:flex ai:center jc:center r:6px font-size:16px color:$tx ${shapeType === 'rect' ? 'bg:$pri color:#fff' : ''}`} onclick={() => shapeType = 'rect'}>□</button>
        <button class={`w:32px h:32px d:flex ai:center jc:center r:6px font-size:16px color:$tx ${shapeType === 'ellipse' ? 'bg:$pri color:#fff' : ''}`} onclick={() => shapeType = 'ellipse'}>○</button>
        <button class={`w:32px h:32px d:flex ai:center jc:center r:6px font-size:16px color:$tx ${shapeType === 'line' ? 'bg:$pri color:#fff' : ''}`} onclick={() => shapeType = 'line'}>╱</button>
        <button class={`w:32px h:32px d:flex ai:center jc:center r:6px font-size:16px color:$tx ${shapeType === 'arrow' ? 'bg:$pri color:#fff' : ''}`} onclick={() => shapeType = 'arrow'}>→</button>
      </div>
    {/if}

    <div class="d:flex ai:center gap:2px bg:rgb(0_0_0/.06) r:10px p:2px ml:auto">
      <button class="w:36px h:36px d:flex ai:center jc:center r:8px color:$tx bg:rgb(0_0_0/.08):hover opacity:.3:disabled cursor:not-allowed:disabled" onclick={undo} disabled={!canUndo} title="元に戻す">
        <Icon name="undo" size={18} />
      </button>
      <button class="w:36px h:36px d:flex ai:center jc:center r:8px color:$tx bg:rgb(0_0_0/.08):hover opacity:.3:disabled cursor:not-allowed:disabled" onclick={redo} disabled={!canRedo} title="やり直し">
        <Icon name="redo" size={18} />
      </button>
    </div>
  </div>

  <!-- Canvas area -->
  <div class="flex:1 position:relative overflow:hidden" bind:this={containerEl}>
    <canvas class="d:block" bind:this={canvasEl}></canvas>
  </div>

  <!-- Page indicator (bottom center, like LoiLoNote) -->
  <div class="d:flex jc:center gap:4px p:6px bg:$edtb-bg b-t:1|solid|$edtb-bd">
    <div class="w:10px h:10px r:50%" style="background: {card.color}; border: 1px solid rgba(0,0,0,0.2);"></div>
  </div>
</div>
