<script>
  import { createEventDispatcher } from "svelte";

  export let topEmojis = [];
  export let selectedEmoji = null;

  const dispatch = createEventDispatcher();
  const selectEmoji = (emoji) =>
    dispatch("select", selectedEmoji === emoji ? null : emoji);
</script>

{#if topEmojis.length}
  <div class="flex w-full items-center gap-1 text-xs pt-2 border-t border-gray-800">
    <span class="uppercase text-gray-400 ">Filter by emoji</span>
    <div class="flex-1 overflow-x-auto no-scrollbar">
      <div class="flex gap-1 py-1 min-w-max">
        {#each topEmojis as option}
          <button
            class={`flex items-center gap-1 rounded-full border px-1 py-1 text-xs transition ${
              selectedEmoji === option.emoji
                ? "bg-white text-black border-white"
                : "bg-transparent text-white border-gray-700 hover:border-white/70"
            }`}
            on:click={() => selectEmoji(option.emoji)}
          >
            <span class="text-xs leading-none">{option.emoji}</span>
            <span class="text-xs text-gray-400">
              {option.count.toLocaleString()}
            </span>
          </button>
        {/each}
      </div>
    </div>
    <button
      class={`flex-shrink-0 rounded-full border px-1 py-1 text-sm transition ${
        selectedEmoji === null
          ? "bg-white text-black border-white"
          : "bg-transparent text-white border-gray-800 hover:border-white/70"
      }`}
      on:click={() => selectEmoji(null)}
    >
      Clear
    </button>
  </div>
{/if}
