<script>
  import { createEventDispatcher } from "svelte";
  import EmojiFilter from "$lib/EmojiFilter.svelte";

  let {
    counts = { posts: 0, groups: 0, links: 0 },
    groups = [],
    selectedGroupId = null,
    hoveredGroupId = null,
    selectedGroup = null,
    sizeMode = "links",
    showLinks = false,
    topEmojis = [],
    selectedEmoji = null,
    subscriberText = () => null,
    textColor = "#ffffff",
    backgroundColor = "#000000",
    highlightColor = "yellow",
  } = $props();

  const dispatch = createEventDispatcher();

  const setSizeMode = (mode) => dispatch("sizeMode", mode);
  const toggleLinks = (checked) => dispatch("showLinks", checked);
  const clearSelection = () => dispatch("clearSelection");
  const setEmoji = (emoji) => dispatch("selectEmoji", selectedEmoji === emoji ? null : emoji);

  let showGroups = $state(false);
  let groupSearch = $state("");
  const filteredGroups = $derived(
    groupSearch.trim()
      ? groups.filter((g) => g.label.toLowerCase().includes(groupSearch.toLowerCase()))
      : groups
  );
</script>

<header
  class="controls fixed left-1/2 top-3 z-50 -translate-x-1/2 flex flex-col items-stretch rounded-lg w-max"
  style={`--bg:${backgroundColor}; --text:${textColor}; --hi:${highlightColor};`}
>
  <div class="flex items-center gap-2 px-2.5 py-1.5">
    <div class="toggle-group flex text-[11px] rounded overflow-hidden">
      <button
        class={`tbtn px-2 py-1 ${sizeMode === "reactions" ? "active" : ""}`}
        on:click={() => setSizeMode("reactions")}
      >reactions</button>
      <button
        class={`tbtn px-2 py-1 ${sizeMode === "links" ? "active" : ""}`}
        on:click={() => setSizeMode("links")}
      >forwards</button>
    </div>

    <label class="flex items-center gap-1 cursor-pointer select-none text-[11px]">
      <input
        type="checkbox"
        checked={showLinks}
        on:change={(e) => toggleLinks(e.currentTarget.checked)}
        style={`accent-color:${highlightColor}; width:10px; height:10px;`}
      />
      links
    </label>

    {#if groups.length}
      <button
        class={`tbtn-groups text-[11px] px-2 py-1 rounded ${showGroups ? "active" : ""}`}
        on:click={() => (showGroups = !showGroups)}
      >groups{#if selectedGroupId}<span class="dot"> ·</span>{/if}</button>
    {/if}

    {#if selectedGroupId}
      <button class="clear-all text-[10px] px-1.5 py-0.5 rounded" on:click={clearSelection}>clear ×</button>
    {/if}
  </div>

  {#if showGroups && groups.length}
    <div class="group-list px-1.5 pb-1.5">
      <div class="search-wrap px-0.5 pt-1 pb-1">
        <input
          class="search-input text-[11px] w-full px-1.5 py-0.5 rounded"
          type="text"
          placeholder="search…"
          bind:value={groupSearch}
        />
      </div>
      <ul>
        {#each filteredGroups as g}
          {@const isSelected = selectedGroupId === g.id}
          {@const isHovered = hoveredGroupId === g.id}
          <li>
            <button
              class={`group-item text-[11px] w-full text-left px-1.5 py-0.5 rounded ${isSelected ? "selected" : ""} ${isHovered && !isSelected ? "hovered" : ""}`}
              on:click={() => dispatch("selectGroup", g.id)}
              on:mouseenter={() => dispatch("hoverGroup", g.id)}
              on:mouseleave={() => dispatch("clearHoverGroup")}
            >{g.label}</button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <EmojiFilter
    {topEmojis}
    {selectedEmoji}
    {textColor}
    {backgroundColor}
    {highlightColor}
    on:select={(e) => setEmoji(e.detail)}
  />
</header>

<style>
  .controls {
    background: var(--bg);
    color: var(--text);
    border: 0.5px solid color-mix(in srgb, var(--hi) 45%, transparent);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    max-height: calc(100vh - 24px);
    overflow-y: auto;
  }

  .toggle-group {
    border: 0.5px solid color-mix(in srgb, var(--hi) 40%, transparent);
  }

  .tbtn {
    background: transparent;
    color: var(--text);
    line-height: 1;
    transition: background 100ms ease;
  }

  .tbtn.active {
    background: color-mix(in srgb, var(--hi) 25%, transparent);
  }

  .tbtn + .tbtn {
    border-left: 0.5px solid color-mix(in srgb, var(--hi) 40%, transparent);
  }

  .tbtn-groups {
    background: transparent;
    color: var(--text);
    line-height: 1;
    border: 0.5px solid color-mix(in srgb, var(--hi) 40%, transparent);
    transition: background 100ms ease;
  }

  .tbtn-groups.active {
    background: color-mix(in srgb, var(--hi) 25%, transparent);
  }

  .dot {
    color: var(--hi);
  }

  .group-list {
    border-top: 0.5px solid color-mix(in srgb, var(--hi) 25%, transparent);
    max-height: 30vh;
    overflow-y: auto;
    width: 100%;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .group-item {
    background: transparent;
    color: var(--text);
    display: block;
    transition: background 80ms ease;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .group-item.hovered {
    background: color-mix(in srgb, var(--hi) 8%, transparent);
  }

  .group-item.selected {
    background: color-mix(in srgb, var(--hi) 18%, transparent);
  }

  .search-input {
    background: color-mix(in srgb, var(--hi) 6%, transparent);
    color: var(--text);
    border: 0.5px solid color-mix(in srgb, var(--hi) 30%, transparent);
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }

  .search-input::placeholder {
    color: color-mix(in srgb, var(--text) 40%, transparent);
  }

  .search-input:focus {
    border-color: color-mix(in srgb, var(--hi) 60%, transparent);
  }

  .clear-all {
    background: transparent;
    color: var(--text);
    opacity: 0.5;
    display: block;
    border-top: none;
  }

  .clear-all:hover {
    opacity: 1;
  }
</style>
