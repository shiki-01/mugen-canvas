<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Card } from '$lib/types';
  import Icon from '$lib/components/shared/Icon.svelte';

  interface Props {
    cards: Card[]; // ordered playback list
    onExit: () => void;
  }

  let { cards, onExit }: Props = $props();

  let index = $state(0);
  let containerEl: HTMLDivElement | undefined = $state();
  let canvasEl: HTMLCanvasElement | undefined = $state();
  let staticCanvas: { dispose: () => void } | null = null;
  let renderToken = 0;

  let current = $derived(cards[index] ?? null);

  function next() {
    if (index < cards.length - 1) index += 1;
  }

  function prev() {
    if (index > 0) index -= 1;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onExit();
    } else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    }
  }

  function getCardTextColor(bgColor: string): string {
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#333333' : '#ffffff';
  }

  // Render Fabric.js editor data on a static (non-interactive) canvas
  async function renderEditorData(card: Card) {
    if (!canvasEl || !containerEl || !card.editorData) return;
    const token = ++renderToken;
    const fabric = await import('fabric');
    if (token !== renderToken) return;
    if (staticCanvas) {
      staticCanvas.dispose();
      staticCanvas = null;
    }
    const rect = containerEl.getBoundingClientRect();
    const canvas = new fabric.StaticCanvas(canvasEl, {
      width: rect.width,
      height: rect.height,
    });
    staticCanvas = canvas;
    await canvas.loadFromJSON(card.editorData);
    if (token !== renderToken) return;
    canvas.backgroundColor = card.color;
    canvas.requestRenderAll();
  }

  $effect(() => {
    if (current?.editorData) {
      renderEditorData(current);
    }
  });

  onDestroy(() => {
    if (staticCanvas) staticCanvas.dispose();
  });
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="position:fixed inset:0 z:50 d:flex flex:column bg:#1a2438">
  <!-- Slide area -->
  <div
    class="flex:1 position:relative overflow:hidden d:flex ai:center jc:center cursor:pointer"
    bind:this={containerEl}
    onclick={next}
    role="button"
    tabindex="0"
    onkeydown={(e) => e.key === 'Enter' && next()}
    aria-label="次のカードへ"
  >
    {#if current}
      {#if current.editorData}
        <canvas class="d:block" bind:this={canvasEl}></canvas>
      {:else if (current.type === 'image' || current.type === 'pdf') && current.imageDataUrl}
        <img
          class="max-w:92% max-h:92% object-fit:contain box-shadow:0|8px|32px|rgb(0_0_0/.4) r:4px"
          src={current.imageDataUrl}
          alt={current.text || 'カード'}
        />
      {:else if current.type === 'web'}
        <div
          class="d:flex flex:column ai:center jc:center gap:24px w:70% h:70% r:16px box-shadow:0|8px|32px|rgb(0_0_0/.4) p:48px"
          style="background: {current.color}; color: {getCardTextColor(current.color)};"
        >
          <span class="font-size:64px">🌐</span>
          {#if current.text}
            <div class="font-size:32px font-weight:600 text-align:center">{current.text}</div>
          {/if}
          {#if current.url}
            <a
              class="font-size:18px color:$pri text-decoration:underline word-break:break-all"
              href={current.url}
              target="_blank"
              rel="noopener noreferrer"
              onclick={(e) => e.stopPropagation()}
            >
              {current.url}
            </a>
          {/if}
        </div>
      {:else}
        <div
          class="d:flex ai:center jc:center w:70% h:70% r:16px box-shadow:0|8px|32px|rgb(0_0_0/.4) p:48px"
          style="background: {current.color}; color: {getCardTextColor(current.color)};"
        >
          <div class="font-size:40px lh:1.6 word-break:break-word white-space:pre-wrap text-align:center max-h:100% overflow:auto">
            {current.text || ''}
          </div>
        </div>
      {/if}
    {/if}

    <!-- Exit button (top-left) -->
    <button
      class="position:absolute top:16px left:16px d:flex ai:center gap:6px px:14px py:8px r:8px bg:rgb(0_0_0/.4) color:#fff font-size:13px bg:rgb(0_0_0/.6):hover z:10"
      onclick={(e) => {
        e.stopPropagation();
        onExit();
      }}
      title="再生を終了 (Esc)"
    >
      <Icon name="x" size={16} />
      終了
    </button>

    <!-- Prev / Next arrows -->
    {#if index > 0}
      <button
        class="position:absolute left:16px top:50% translateY(-50%) w:44px h:44px d:flex ai:center jc:center r:50% bg:rgb(0_0_0/.4) color:#fff bg:rgb(0_0_0/.6):hover z:10"
        onclick={(e) => {
          e.stopPropagation();
          prev();
        }}
        title="前のカード (←)"
      >
        <Icon name="arrow-left" size={22} />
      </button>
    {/if}
    {#if index < cards.length - 1}
      <button
        class="position:absolute right:16px top:50% translateY(-50%) w:44px h:44px d:flex ai:center jc:center r:50% bg:rgb(0_0_0/.4) color:#fff bg:rgb(0_0_0/.6):hover z:10 rotate(180)"
        onclick={(e) => {
          e.stopPropagation();
          next();
        }}
        title="次のカード (→)"
      >
        <Icon name="arrow-left" size={22} />
      </button>
    {/if}
  </div>

  <!-- Progress bar (bottom) -->
  <div class="d:flex ai:center jc:center gap:12px px:16px py:10px bg:rgb(0_0_0/.3) flex-shrink:0">
    <div class="d:flex gap:6px ai:center max-w:60% overflow-x:auto">
      {#each cards as card, i (card.id)}
        <button
          aria-label={`カード ${i + 1}`}
          class={`flex-shrink:0 r:3px b:1|solid|rgb(255_255_255/.3) cursor:pointer transition:transform|.1s ${i === index ? 'w:32px h:22px b:2|solid|$conn' : 'w:26px h:18px opacity:.6 opacity:1:hover'}`}
          style="background: {card.color};"
          onclick={() => (index = i)}
        ></button>
      {/each}
    </div>
    <span class="font-size:12px color:rgb(255_255_255/.7) flex-shrink:0">
      {index + 1} / {cards.length}
    </span>
  </div>
</div>
