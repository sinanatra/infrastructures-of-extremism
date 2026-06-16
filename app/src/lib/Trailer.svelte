
<script>
  import { createEventDispatcher, onMount } from "svelte";

  let {
    highlightColor = "yellow",
    backgroundColor = "#000",
    textColor = "#fff",
    introSummary = "",
    seedLabel = null,
    enterLabel = "Enter",
  } = $props();

  const dispatch = createEventDispatcher();

  let done = $state(false);

  const enter = () => {
    done = true;
    dispatch("block", { blocking: false });
    dispatch("update", { state: "done" });
  };

  onMount(() => {
    dispatch("block", { blocking: true });
  });
</script>

{#if !done}
  <div
    class="absolute inset-0 z-30 flex items-center justify-center"
    style="backdrop-filter:blur(2px);"
    role="presentation"
    onclick={(e) => e.stopPropagation()}
    onpointerdown={(e) => e.stopPropagation()}
  >
    <div
      class="pointer-events-auto rounded-lg shadow-lg px-3 py-2.5 flex flex-col gap-2 max-w-xs"
      style={`background:${backgroundColor}; border:0.5px solid color-mix(in srgb, ${highlightColor} 45%, transparent); color:${textColor};`}
    >
      <p class="text-[12px] leading-snug">
        Starting from the right-wing extremist Telegram group
        <span class="italic" style={`color:${highlightColor}`}>{seedLabel ?? "the seed"}</span>,
        {introSummary}
      </p>
      <div class="flex justify-end">
        <button
          class="tbtn text-[11px] px-2 py-1 rounded"
          style={`border:0.5px solid color-mix(in srgb, ${highlightColor} 40%, transparent); color:${textColor};`}
          onclick={enter}
        >{enterLabel}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .tbtn {
    background: transparent;
    cursor: pointer;
    line-height: 1;
    transition: background 80ms ease;
  }
  .tbtn:hover {
    background: rgba(255, 255, 255, 0.08);
  }
</style>
