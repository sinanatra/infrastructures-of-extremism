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

  const dispatch = createEventDispatcher();

  const setSizeMode = (mode) => dispatch("sizeMode", mode);
  const toggleLinks = (checked) => dispatch("showLinks", checked);
  const clearSelection = () => dispatch("clearSelection");
  const setEmoji = (emoji) =>
    dispatch("selectEmoji", selectedEmoji === emoji ? null : emoji);
</script>

<header
  class="fixed left-1/2 top-4 z-50 flex w-[min(1100px,90vw)] -translate-x-1/2 flex-wrap items-center justify-between gap-2 rounded-full bg-black p-2 px-6"
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
  </div>

  <EmojiFilter {topEmojis} {selectedEmoji} on:select={(event) => setEmoji(event.detail)} />
</header>
