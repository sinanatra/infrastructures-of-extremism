<script>
  import { createEventDispatcher } from "svelte";
  import EmojiFilter from "$lib/EmojiFilter.svelte";

  export let counts = { posts: 0, groups: 0, links: 0 };
  export let selectedGroup = null;
  export let sizeMode = "links";
  export let showLinks = false;
  export let topEmojis = [];
  export let selectedEmoji = null;
  export let subscriberText = () => null;
  export let textColor = "#ffffff";
  export let backgroundColor = "#000000";
  export let highlightColor = "yellow";

  const dispatch = createEventDispatcher();

  const setSizeMode = (mode) => dispatch("sizeMode", mode);
  const toggleLinks = (checked) => dispatch("showLinks", checked);
  const clearSelection = () => dispatch("clearSelection");
  const setEmoji = (emoji) =>
    dispatch("selectEmoji", selectedEmoji === emoji ? null : emoji);
</script>

<header
  class="controls fixed left-1/2 top-4 z-50 flex w-[min(1100px,90vw)] -translate-x-1/2 flex-wrap items-center justify-between gap-2 rounded p-2 px-6"
  style={`--controls-bg:${backgroundColor}; --controls-text:${textColor}; --controls-highlight:${highlightColor};`}
>
  <div class="flex flex-wrap items-center gap-3 text-sm">
    <span>{counts.posts} posts</span>
    <span>{counts.groups} groups</span>
    <span>{counts.links} links</span>
    {#if selectedGroup}
      <span class="group-pill flex items-center gap-3 px-3 py-1 rounded-full text-sm">
        <span>{selectedGroup.label}</span>
        {#if subscriberText(selectedGroup.subscribers)}
          <span>
            {subscriberText(selectedGroup.subscribers)}
          </span>
        {/if}
        <span>
          {(selectedGroup.postCount ?? 0).toLocaleString()} posts
        </span>
        <button class="underline decoration-dotted" on:click={clearSelection}>
          clear
        </button>
      </span>
    {/if}

    <div class="flex rounded-full overflow-hidden toggle-group">
      <button
        class={`toggle-btn px-3 py-2 ${sizeMode === "reactions" ? "active" : ""}`}
        on:click={() => setSizeMode("reactions")}
      >
        Size by reactions
      </button>
      <button
        class={`toggle-btn px-3 py-2 ${sizeMode === "links" ? "active" : ""}`}
        on:click={() => setSizeMode("links")}
      >
        Size by forwards
      </button>
    </div>
    <label class="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={showLinks}
        on:change={(event) => toggleLinks(event.currentTarget.checked)}
        style={`accent-color:${highlightColor};`}
      />
      <span>Show links</span>
    </label>
  </div>

  <EmojiFilter
    {topEmojis}
    {selectedEmoji}
    textColor={textColor}
    backgroundColor={backgroundColor}
    highlightColor={highlightColor}
    on:select={(event) => setEmoji(event.detail)}
  />
</header>

<style>
  .controls {
    background: var(--controls-bg);
    color: var(--controls-text);
    border: 0.75px solid var(--controls-highlight);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
  }

  .group-pill {
    background: var(--controls-text);
    color: var(--controls-bg);
  }

  .toggle-group {
    border: 0.75px solid var(--controls-highlight);
  }

  .toggle-btn {
    background: transparent;
    color: var(--controls-text);
    transition: background 120ms ease, color 120ms ease;
  }

  .toggle-btn.active {
    background: var(--controls-text);
    color: var(--controls-bg);
  }

  .toggle-btn + .toggle-btn {
    border-left: 0.75px solid var(--controls-highlight);
  }
</style>
