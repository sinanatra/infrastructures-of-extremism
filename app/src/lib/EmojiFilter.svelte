
<script>
  import { createEventDispatcher } from "svelte";

  let {
    topEmojis = [],
    selectedEmoji = null,
    textColor = "#ffffff",
    backgroundColor = "#000000",
    highlightColor = "yellow",
  } = $props();

  const dispatch = createEventDispatcher();
  const selectEmoji = (emoji) =>
    dispatch("select", selectedEmoji === emoji ? null : emoji);
</script>

{#if topEmojis.length}
  <div
    class="emoji-filter flex w-full items-center gap-1 text-xs pt-1"
    style={`--filter-text:${textColor}; --filter-highlight:${highlightColor}; --filter-bg:${backgroundColor};`}
  >
    <span class="label uppercase">Filter by emoji</span>
    <div class="flex-1 overflow-x-auto no-scrollbar">
      <div class="flex gap-1 py-1 min-w-max">
        {#each topEmojis as option}
          <button
            class={`emoji-pill ${selectedEmoji === option.emoji ? "active" : ""}`}
            on:click={() => selectEmoji(option.emoji)}
          >
            <span class="emoji text-xs leading-none">
              {option.emoji.length > 5 ? "?" : option.emoji}
            </span>
            <span class="count text-xs">
              {option.count.toLocaleString()}
            </span>
          </button>
        {/each}
      </div>
    </div>
    <button
      class={`emoji-pill clear ${selectedEmoji === null ? "active" : ""}`}
      on:click={() => selectEmoji(null)}
    >
      Clear
    </button>
  </div>
{/if}

<style>
  .emoji-filter {
    color: var(--filter-text);
    border-top: 0.75px solid var(--filter-highlight);
  }

  .label {
    color: var(--filter-text);
  }

  .emoji-pill {
    border: 0.75px solid var(--filter-highlight);
    color: var(--filter-text);
    background: transparent;
    border-radius: 9999px;
    padding: 0.1rem 0.2rem;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    transition:
      background 120ms ease,
      color 120ms ease,
      border-color 120ms ease;
  }

  .emoji-pill.active {
    background: var(--filter-text);
    color: var(--filter-bg);
    border-color: var(--filter-highlight);
  }

  .emoji-pill:hover {
    border-color: var(--filter-text);
  }

  .emoji-pill.clear {
    flex-shrink: 0;
  }

  .count {
    opacity: 0.75;
  }
</style>
