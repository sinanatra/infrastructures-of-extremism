
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
    class="flex items-center gap-1 px-2.5 py-1 border-t border-t-[0.5px] border-t-[color-mix(in_srgb,var(--hi)_30%,transparent)]"
    style={`--text:${textColor}; --hi:${highlightColor}; --bg:${backgroundColor};`}
  >
    <div class="flex-1 overflow-x-auto no-scrollbar">
      <div class="flex gap-0.5 min-w-max">
        {#each topEmojis as option}
          <button
            class={`pill ${selectedEmoji === option.emoji ? "active" : ""}`}
            onclick={() => selectEmoji(option.emoji)}
            title={`${option.emoji} · ${option.count}`}
          >
            {option.emoji.length > 5 ? "?" : option.emoji}
          </button>
        {/each}
      </div>
    </div>
    {#if selectedEmoji}
      <button class="clear" onclick={() => selectEmoji(null)}>×</button>
    {/if}
  </div>
{/if}

<style>
  div {
    color: var(--text);
  }

  .pill {
    background: transparent;
    border: none;
    color: var(--text);
    border-radius: 4px;
    padding: 1px 3px;
    font-size: 12px;
    line-height: 1.3;
    transition: background 80ms ease;
  }

  .pill.active {
    background: color-mix(in srgb, var(--hi) 25%, transparent);
  }

  .clear {
    background: transparent;
    border: none;
    color: var(--text);
    font-size: 12px;
    line-height: 1;
    padding: 0 2px;
    flex-shrink: 0;
  }
</style>
