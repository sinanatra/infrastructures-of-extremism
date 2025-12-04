<script>
  import { createEventDispatcher } from "svelte";

  export let counts = { posts: 0, groups: 0, links: 0 };
  export let selectedGroup = null;
  export let sizeMode = "links";
  export let showLinks = false;
  export let showEmoji = false;
  export let subscriberText = () => null;

  const dispatch = createEventDispatcher();

  const setSizeMode = (mode) => dispatch("sizeMode", mode);
  const toggleLinks = (checked) => dispatch("showLinks", checked);
  const toggleEmoji = (checked) => dispatch("showEmoji", checked);
  const clearSelection = () => dispatch("clearSelection");
</script>

<header
  class="absolute left-1/2 top-4 z-20 flex  -translate-x-1/2 flex-wrap items-center justify-between gap-2 rounded-full bg-black p-2 px-4"
>
  <div class="flex flex-wrap items-center gap-3 text-sm">
    <span>{counts.posts} posts</span>
    <span>{counts.groups} groups</span>
    <span>{counts.links} links</span>
    {#if selectedGroup}
      <span
        class="flex items-center gap-3 bg-white text-black px-3 py-1 rounded-full text-sm"
      >
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

    <div class="flex rounded-full border border-gray-700 overflow-hidden">
      <button
        class={`px-3 py-2 ${sizeMode === "reactions" ? "bg-white text-black" : "bg-transparent text-white"}`}
        on:click={() => setSizeMode("reactions")}
      >
        Size by reactions
      </button>
      <button
        class={`px-3 py-2 ${sizeMode === "links" ? "bg-white text-black" : "bg-transparent text-white"}`}
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
        class="accent-white"
      />
      <span>Show links</span>
    </label>
    <label class="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={showEmoji}
        on:change={(event) => toggleEmoji(event.currentTarget.checked)}
        class="accent-white"
      />
      <span>Use top emoji</span>
    </label>
  </div>
</header>
