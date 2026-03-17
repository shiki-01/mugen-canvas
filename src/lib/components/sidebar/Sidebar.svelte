<script lang="ts">
	import Icon from '$lib/components/shared/Icon.svelte';
	import type { Note, Folder } from '$lib/types';
	import { tick } from 'svelte';

	interface Props {
		notes: Note[];
		folders: Folder[];
		currentNoteId: string | null;
		theme: 'light' | 'dark';
		showNoteList: boolean;
		onCreateTextCard: () => void;
		onCreateImageCard: () => void;
		onCreatePDFCard: () => void;
		onToggleNoteList: () => void;
		onSelectNote: (id: string) => void;
		onCreateNote: () => void;
		onDeleteNote: (id: string) => void;
		onRenameNote: (id: string, name: string) => void;
		onToggleTheme: () => void;
		onExportJSON: () => void;
		onImportJSON: () => void;
	}

	let {
		notes,
		folders,
		currentNoteId,
		theme,
		showNoteList,
		onCreateTextCard,
		onCreateImageCard,
		onCreatePDFCard,
		onToggleNoteList,
		onSelectNote,
		onCreateNote,
		onDeleteNote,
		onRenameNote,
		onToggleTheme,
		onExportJSON,
		onImportJSON
	}: Props = $props();

	let renamingId = $state<string | null>(null);
	let renameValue = $state('');
	let renameInputEl = $state<HTMLInputElement | null>(null);
	let hoveredNoteId = $state<string | null>(null);

	$effect(() => {
		if (renamingId !== null) {
			tick().then(() => {
				if (renameInputEl) {
					renameInputEl.focus();
					renameInputEl.select();
				}
			});
		}
	});

	function startRename(id: string, name: string) {
		renamingId = id;
		renameValue = name;
	}

	function finishRename() {
		if (renamingId && renameValue.trim()) {
			onRenameNote(renamingId, renameValue.trim());
		}
		renamingId = null;
	}
</script>

<div class="w:56px h:100% d:flex flex:column bg:$sb-bg b-r:1|solid|$sb-bd flex-shrink:0 z:20 py:6px">
	<!-- Card creation tools (top section) -->
	<div class="d:flex flex:column ai:center gap:2px py:4px">
		<button class="d:flex flex:column ai:center jc:center w:48px h:48px r:10px color:$sb-tx gap:1px bg:$sb-ih:hover" onclick={onToggleNoteList} title="ノート一覧">
			<Icon name="sidebar" size={22} />
			<span class="font-size:8px opacity:.8 lh:1">ノート</span>
		</button>

		<div class="w:32px h:1px bg:$sb-bd my:6px"></div>

		<button class="d:flex flex:column ai:center jc:center w:48px h:48px r:10px color:$sb-tx gap:1px bg:$sb-ih:hover" onclick={onCreateTextCard} title="テキストカード">
			<span class="font-size:18px font-weight:700 lh:1">あ</span>
			<span class="font-size:8px opacity:.8 lh:1">テキスト</span>
		</button>

		<button class="d:flex flex:column ai:center jc:center w:48px h:48px r:10px color:$sb-tx gap:1px bg:$sb-ih:hover" onclick={onCreateImageCard} title="画像カード">
			<Icon name="image" size={22} />
			<span class="font-size:8px opacity:.8 lh:1">画像</span>
		</button>

		<button class="d:flex flex:column ai:center jc:center w:48px h:48px r:10px color:$sb-tx gap:1px bg:$sb-ih:hover" onclick={onCreatePDFCard} title="PDFカード">
			<Icon name="file-pdf" size={22} />
			<span class="font-size:8px opacity:.8 lh:1">PDF</span>
		</button>
	</div>

	<!-- Bottom section -->
	<div class="d:flex flex:column ai:center gap:2px py:4px mt:auto">
		<button class="d:flex flex:column ai:center jc:center w:48px h:48px r:10px color:$sb-tx gap:1px bg:$sb-ih:hover" onclick={onExportJSON} title="エクスポート">
			<Icon name="download" size={22} />
			<span class="font-size:8px opacity:.8 lh:1">保存</span>
		</button>

		<button class="d:flex flex:column ai:center jc:center w:48px h:48px r:10px color:$sb-tx gap:1px bg:$sb-ih:hover" onclick={onImportJSON} title="インポート">
			<Icon name="upload" size={22} />
			<span class="font-size:8px opacity:.8 lh:1">読込</span>
		</button>

		<button class="d:flex flex:column ai:center jc:center w:48px h:48px r:10px color:$sb-tx gap:1px bg:$sb-ih:hover" onclick={onToggleTheme} title="テーマ切替">
			<Icon name={theme === 'light' ? 'moon' : 'sun'} size={22} />
			<span class="font-size:8px opacity:.8 lh:1">{theme === 'light' ? '暗' : '明'}</span>
		</button>
	</div>
</div>

<!-- Note list panel (slide-out) -->
{#if showNoteList}
	<div class="position:absolute left:56px top:0 w:260px h:100% bg:$sb-bg b-r:1|solid|$sb-bd z:19 d:flex flex:column box-shadow:4|0|16|rgb(0_0_0/.2)">
		<div class="d:flex ai:center gap:8px p:12px b-b:1|solid|$sb-bd">
			<h3 class="font-size:14px font-weight:600 color:$sb-tx flex:1">ノート一覧</h3>
			<button class="w:28px h:28px d:flex ai:center jc:center r:6px color:$sb-tx bg:$sb-ih:hover" onclick={onCreateNote} title="新規ノート">
				<Icon name="plus" size={18} />
			</button>
			<button class="w:28px h:28px d:flex ai:center jc:center r:6px color:$sb-tx bg:$sb-ih:hover" onclick={onToggleNoteList}>
				<Icon name="x" size={18} />
			</button>
		</div>
		<div class="flex:1 overflow-y:auto p:4px">
			{#each notes.filter((n) => !n.trashed) as note (note.id)}
				<div
					role="button"
					tabindex="0"
					aria-label="item"
					class={`d:flex ai:center gap:8px px:10px py:8px r:8px cursor:pointer color:$sb-tx bg:$sb-ih:hover ${currentNoteId === note.id ? 'bg:$pri color:#fff' : ''}`}
					onmouseenter={() => (hoveredNoteId = note.id)}
					onmouseleave={() => (hoveredNoteId = null)}
					onclick={() => onSelectNote(note.id)}
					oncontextmenu={(e) => e.preventDefault()}
					onkeydown={(e) => e.preventDefault()}
				>
					{#if renamingId === note.id}
						<input
							class="w:100% px:8px py:4px b:1|solid|$pri r:4px bg:rgb(255_255_255/.1) color:$sb-tx font-size:13px outline:none"
							bind:this={renameInputEl}
							bind:value={renameValue}
							onblur={finishRename}
							onkeydown={(e) => {
								if (e.key === 'Enter') finishRename();
								if (e.key === 'Escape') renamingId = null;
							}}
						/>
					{:else}
						<div class="flex:1 min-w:0">
							<span class="d:block font-size:13px font-weight:500 white-space:nowrap overflow:hidden text-overflow:ellipsis">{note.name}</span>
							<span class="d:block font-size:10px opacity:.6 mt:1px"
								>{note.cards.length}枚 · {new Date(note.updatedAt).toLocaleDateString(
									'ja-JP'
								)}</span
							>
						</div>
						<div class={`d:flex gap:2px transition:opacity|.15s ${hoveredNoteId === note.id ? 'opacity:1' : 'opacity:0 pointer-events:none'}`}>
							<button
								class="w:22px h:22px d:flex ai:center jc:center r:4px color:$sb-tx bg:$sb-ih:hover"
								onclick={(e) => {
									e.stopPropagation();
									startRename(note.id, note.name);
								}}
								title="名前変更"
							>
								<Icon name="pen" size={12} />
							</button>
							<button
								class="w:22px h:22px d:flex ai:center jc:center r:4px color:$sb-tx bg:#ef4444:hover color:#fff:hover"
								onclick={(e) => {
									e.stopPropagation();
									onDeleteNote(note.id);
								}}
								title="削除"
							>
								<Icon name="trash" size={12} />
							</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
{/if}
