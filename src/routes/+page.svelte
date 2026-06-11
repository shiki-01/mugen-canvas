<script lang="ts">
  import { onMount } from "svelte";
  import { v4 as uuidv4 } from "uuid";
  import Sidebar from "$lib/components/sidebar/Sidebar.svelte";
  import NoteCanvas from "$lib/components/canvas/NoteCanvas.svelte";
  import CardEditor from "$lib/components/canvas/CardEditor.svelte";
  import PresentationView from "$lib/components/canvas/PresentationView.svelte";
  import type { Note, Card, Connector, ViewMode, Folder } from "$lib/types";
  import { CARD_COLORS } from "$lib/types";
  import { getChain, getPresentationOrder } from "$lib/utils/chain";
  import {
    getAllNotes,
    saveNote,
    deleteNote as dbDeleteNote,
    getAllFolders,
    exportAllNotes,
    importNotes,
  } from "$lib/utils/db";

  // State
  let notes = $state<Note[]>([]);
  let folders = $state<Folder[]>([]);
  let currentNoteId = $state<string | null>(null);
  let viewMode = $state<ViewMode>("canvas");
  let editingCardId = $state<string | null>(null);
  let selectedCardId = $state<string | null>(null);
  let showNoteList = $state(false);
  let theme = $state<"light" | "dark">(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
  );

  let autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  let noteCanvas = $state<NoteCanvas | null>(null);
  let presentationCards = $state<Card[]>([]);

  // Derived
  let currentNote = $derived(notes.find((n) => n.id === currentNoteId) ?? null);
  let editingCard = $derived(
    currentNote && editingCardId
      ? (currentNote.cards.find((c) => c.id === editingCardId) ?? null)
      : null,
  );

  onMount(() => {
    (async () => {
      document.documentElement.classList.toggle("dark", theme === "dark");

      notes = await getAllNotes();
      folders = await getAllFolders();

      const active = notes.filter((n) => !n.trashed);
      if (active.length > 0) {
        currentNoteId = active[0].id;
      } else {
        await createNote();
      }

      autoSaveTimer = setInterval(saveCurrentNote, 5000);
    })();

    return () => {
      if (autoSaveTimer) clearInterval(autoSaveTimer);
    };
  });

  // === Note management ===

  async function createNote() {
    const id = uuidv4();
    const note: Note = {
      id,
      name: `ノート ${notes.filter((n) => !n.trashed).length + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cards: [],
      connectors: [],
      folderId: null,
      tags: [],
      trashed: false,
      trashedAt: null,
      thumbnail: null,
    };
    await saveNote(note);
    notes = [note, ...notes];
    currentNoteId = id;
    viewMode = "canvas";
    editingCardId = null;
    showNoteList = false;
  }

  async function switchNote(id: string) {
    await saveCurrentNote();
    currentNoteId = id;
    viewMode = "canvas";
    editingCardId = null;
    showNoteList = false;
  }

  async function saveCurrentNote() {
    if (!currentNoteId) return;
    const note = notes.find((n) => n.id === currentNoteId);
    if (note) {
      note.updatedAt = Date.now();
      await saveNote(note);
      notes = [...notes];
    }
  }

  async function handleDeleteNote(id: string) {
    const active = notes.filter((n) => !n.trashed);
    if (active.length <= 1) return;
    await dbDeleteNote(id);
    notes = await getAllNotes();
    if (currentNoteId === id) {
      const remaining = notes.filter((n) => !n.trashed);
      if (remaining.length > 0) {
        currentNoteId = remaining[0].id;
      } else {
        await createNote();
      }
    }
  }

  async function handleRenameNote(id: string, name: string) {
    const note = notes.find((n) => n.id === id);
    if (note) {
      note.name = name;
      note.updatedAt = Date.now();
      await saveNote(note);
      notes = [...notes];
    }
  }

  // === Card management ===

  function createCard(
    type: "text" | "image" | "pdf" | "web",
    extra?: Partial<Card>,
  ) {
    if (!currentNote) return;
    // Place new cards near the center of the current viewport
    const center = noteCanvas?.getViewportCenter() ?? { x: 0, y: 0 };
    const card: Card = {
      id: uuidv4(),
      type,
      x: center.x - 90 + (Math.random() - 0.5) * 80,
      y: center.y - 60 + (Math.random() - 0.5) * 80,
      width: type === "text" ? 180 : 200,
      height: type === "text" ? 120 : 160,
      color: CARD_COLORS[Math.floor(Math.random() * 3)], // random from first 3
      text: "",
      imageDataUrl: null,
      url: null,
      editorData: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...extra,
    };
    currentNote.cards = [...currentNote.cards, card];
    notes = [...notes];
    selectedCardId = card.id;
    return card;
  }

  function handleCreateTextCard(color: string) {
    createCard("text", { color });
  }

  function handleCreateWebCard() {
    const url = window.prompt("WebページのURLを入力してください", "https://");
    if (!url || url === "https://") return;
    let label = url;
    try {
      label = new URL(url).hostname;
    } catch {
      // keep raw input as label
    }
    createCard("web", { url, text: label, color: "#ffffff" });
  }

  function handleCreateImageCard() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/gif,image/webp";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        createCard("image", {
          imageDataUrl: dataUrl,
          text: file.name,
          color: "#ffffff",
        });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  function handleCreatePDFCard() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "";
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({
          data: arrayBuffer,
          useWorkerFetch: false,
          isEvalSupported: false,
          useSystemFonts: true,
        }).promise;

        // Render first page as preview
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.5 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        const preview = canvas.toDataURL("image/png");

        // Create a card for each page
        for (let i = 1; i <= pdf.numPages; i++) {
          const pg = await pdf.getPage(i);
          const vp = pg.getViewport({ scale: 0.8 });
          const c = document.createElement("canvas");
          c.width = vp.width;
          c.height = vp.height;
          const ct = c.getContext("2d")!;
          await pg.render({ canvas, canvasContext: ct, viewport: vp }).promise;

          createCard("pdf", {
            imageDataUrl: c.toDataURL("image/png"),
            text: `${file.name} (${i}/${pdf.numPages})`,
            color: "#ffffff",
            x: -100 + (i - 1) * 220,
            y: 0,
          });
        }
      } catch (err) {
        console.error("PDF import failed:", err);
      }
    };
    input.click();
  }

  // Canvas card operations
  function handleCardMove(id: string, x: number, y: number) {
    if (!currentNote) return;
    const card = currentNote.cards.find((c) => c.id === id);
    if (card) {
      card.x = x;
      card.y = y;
      notes = [...notes];
    }
  }

  function handleCardResize(id: string, w: number, h: number) {
    if (!currentNote) return;
    const card = currentNote.cards.find((c) => c.id === id);
    if (card) {
      card.width = w;
      card.height = h;
      notes = [...notes];
    }
  }

  function handleCardTextChange(id: string, text: string) {
    if (!currentNote) return;
    const card = currentNote.cards.find((c) => c.id === id);
    if (card) {
      card.text = text;
      card.updatedAt = Date.now();
      notes = [...notes];
    }
  }

  function handleCardColorChange(id: string, color: string) {
    if (!currentNote) return;
    const card = currentNote.cards.find((c) => c.id === id);
    if (card) {
      card.color = color;
      notes = [...notes];
    }
  }

  function handleCardDelete(id: string) {
    if (!currentNote) return;
    currentNote.cards = currentNote.cards.filter((c) => c.id !== id);
    currentNote.connectors = currentNote.connectors.filter(
      (c) => c.fromCardId !== id && c.toCardId !== id,
    );
    if (selectedCardId === id) selectedCardId = null;
    notes = [...notes];
  }

  function handleCardOpen(id: string) {
    editingCardId = id;
    viewMode = "editor";
  }

  function handleConnectorCreate(fromId: string, toId: string) {
    if (!currentNote) return;
    // Check duplicate
    if (
      currentNote.connectors.some(
        (c) =>
          (c.fromCardId === fromId && c.toCardId === toId) ||
          (c.fromCardId === toId && c.toCardId === fromId),
      )
    )
      return;
    const conn: Connector = {
      id: uuidv4(),
      fromCardId: fromId,
      toCardId: toId,
    };
    currentNote.connectors = [...currentNote.connectors, conn];
    notes = [...notes];
  }

  function handleConnectorDelete(id: string) {
    if (!currentNote) return;
    currentNote.connectors = currentNote.connectors.filter((c) => c.id !== id);
    notes = [...notes];
  }

  // Align the connected chain containing the card in a horizontal row (整列)
  function handleAlignChain(cardId: string) {
    if (!currentNote) return;
    const chain = getChain(currentNote.cards, currentNote.connectors, cardId);
    if (chain.length < 2) return;
    const gap = 48;
    const startX = chain[0].x;
    const centerY = chain[0].y + chain[0].height / 2;
    let x = startX;
    for (const card of chain) {
      card.x = x;
      card.y = centerY - card.height / 2;
      x += card.width + gap;
    }
    notes = [...notes];
  }

  // === Presentation (再生) ===

  function startPresentation() {
    if (!currentNote || currentNote.cards.length === 0) return;
    presentationCards = getPresentationOrder(
      currentNote.cards,
      currentNote.connectors,
      selectedCardId,
    );
    if (presentationCards.length === 0) return;
    viewMode = "presentation";
  }

  function exitPresentation() {
    presentationCards = [];
    viewMode = "canvas";
  }

  // Editor callbacks
  function handleEditorBack() {
    viewMode = "canvas";
    editingCardId = null;
  }

  function handleEditorSave(editorData: string, text: string) {
    if (!currentNote || !editingCardId) return;
    const card = currentNote.cards.find((c) => c.id === editingCardId);
    if (card) {
      card.editorData = editorData;
      card.text = text;
      card.updatedAt = Date.now();
      notes = [...notes];
    }
  }

  // Theme
  function toggleTheme() {
    theme = theme === "light" ? "dark" : "light";
    document.documentElement.classList.toggle("dark", theme === "dark");
  }

  // Export/Import
  async function handleExportJSON() {
    await saveCurrentNote();
    const json = await exportAllNotes();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mugen-canvas-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportJSON() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      await importNotes(text);
      notes = await getAllNotes();
      folders = await getAllFolders();
      const active = notes.filter((n) => !n.trashed);
      if (active.length > 0 && !notes.find((n) => n.id === currentNoteId)) {
        currentNoteId = active[0].id;
      }
    };
    input.click();
  }

  // Keyboard shortcuts
  function handleKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveCurrentNote();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="d:flex h:100vh w:100vw overflow:hidden position:relative">
  {#if viewMode === "canvas"}
    <Sidebar
      {notes}
      {folders}
      {currentNoteId}
      {theme}
      {showNoteList}
      onCreateTextCard={handleCreateTextCard}
      onCreateImageCard={handleCreateImageCard}
      onCreatePDFCard={handleCreatePDFCard}
      onCreateWebCard={handleCreateWebCard}
      onToggleNoteList={() => (showNoteList = !showNoteList)}
      onSelectNote={switchNote}
      onCreateNote={createNote}
      onDeleteNote={handleDeleteNote}
      onRenameNote={handleRenameNote}
      onToggleTheme={toggleTheme}
      onExportJSON={handleExportJSON}
      onImportJSON={handleImportJSON}
    />

    <div class="flex:1 d:flex flex:column min-w:0 overflow:hidden">
      <!-- Header bar -->
      <div class="d:flex ai:center jc:flex-end gap:12px px:16px py:8px bg:$hd-bg color:$hd-tx flex-shrink:0 min-h:36px b-b:1|solid|rgb(255_255_255/.08)">
        <span class="font-size:13px font-weight:600 opacity:.9">
          {currentNote?.name ?? "ノート"}
        </span>
        <span class="font-size:11px opacity:.5">
          {currentNote?.cards.length ?? 0}枚のカード
        </span>
        <!-- 再生: つないだカードをプレゼンとして再生 (LoiLoNote の青い再生ボタン) -->
        <button
          class="d:flex ai:center gap:6px px:14px py:5px r:6px bg:$pri color:#fff font-size:12px font-weight:600 opacity:.9:hover opacity:.4:disabled cursor:not-allowed:disabled"
          onclick={startPresentation}
          disabled={!currentNote || currentNote.cards.length === 0}
          title="つないだカードを順番に再生"
        >
          <svg viewBox="0 0 16 16" width="11" height="11">
            <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
          </svg>
          再生
        </button>
      </div>

      {#if currentNote}
        <NoteCanvas
          bind:this={noteCanvas}
          cards={currentNote.cards}
          connectors={currentNote.connectors}
          {selectedCardId}
          onCardSelect={(id) => (selectedCardId = id)}
          onCardOpen={handleCardOpen}
          onCardMove={handleCardMove}
          onCardResize={handleCardResize}
          onCardTextChange={handleCardTextChange}
          onCardColorChange={handleCardColorChange}
          onCardDelete={handleCardDelete}
          onConnectorCreate={handleConnectorCreate}
          onConnectorDelete={handleConnectorDelete}
          onAlignChain={handleAlignChain}
        />
      {/if}
    </div>
  {:else if viewMode === "editor" && editingCard}
    <CardEditor
      card={editingCard}
      onBack={handleEditorBack}
      onSave={handleEditorSave}
    />
  {:else if viewMode === "presentation"}
    <PresentationView
      cards={presentationCards}
      onExit={exitPresentation}
    />
  {/if}
</div>
