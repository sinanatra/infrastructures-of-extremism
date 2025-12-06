<script>
  import { createEventDispatcher, onDestroy } from "svelte";

  export let groups = [];
  export let highlightColor = "yellow";
  export let backgroundColor = "#000";
  export let textColor = "#fff";

  const dispatch = createEventDispatcher();

  let state = "idle"; // idle | playing | done
  let idx = 0;
  let timer = null;
  let visible = new Set();
  let visitedOrder = [];
  const perGroupMs = 20;

  const reset = () => {
    clearTimer();
    state = "idle";
    idx = 0;
    visible = new Set();
    visitedOrder = [];
  };

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const notify = () => {
    dispatch("update", {
      visible: state === "done" ? null : new Set(visible),
      order: visitedOrder,
    });
    dispatch("headline", {
      group: groups[idx - 1] ?? groups[0] ?? null,
      index: idx,
      total: groups.length,
    });
  };

  const step = () => {
    if (idx >= groups.length) {
      finish();
      return;
    }
    visible.add(groups[idx].id);
    visitedOrder = [...visitedOrder, groups[idx]];
    idx += 1;
    notify();
    timer = setTimeout(step, perGroupMs);
  };

  const start = () => {
    if (state !== "idle" || !groups.length) return;
    state = "playing";
    dispatch("block", { blocking: true });
    step();
  };

  const finish = () => {
    clearTimer();
    state = "done";
    dispatch("block", { blocking: false });
    notify();
  };

  const skip = () => {
    if (state === "done") return;
    finish();
  };

  onDestroy(() => {
    clearTimer();
  });
</script>

{#if state !== "done"}
  <div
    class="overlay pointer-events-auto absolute inset-0 z-30 flex items-center justify-center"
    on:click|stopPropagation
    on:pointerdown|stopPropagation
    style={`backdrop-filter:${state === "idle" ? "blur(2px)" : "none"};`}
  >
    <div
      class="pointer-events-auto flex flex-col items-center gap-4 px-6 py-5 rounded shadow-lg max-w-2xl w-[90vw] text-center"
      style={`background:${backgroundColor}; border:1px solid ${highlightColor}; color:${textColor};`}
    >
      <div class="text-2xl">
        Starting from the right-wing extremist Telegram group
        <span class="italic" style="color: {highlightColor};">{groups[0]?.label ?? "the seed"}</span>,
        this visualization shows the network of related channels: the ones they
        talk about and the ones resharing their posts.
      </div>
      {#if state === "playing"}
        <div class="text-sm opacity-80">
          {groups[Math.min(idx, groups.length - 1)]?.label ?? ""}
        </div>
      {/if}
      <div class="flex gap-3">
        <button
          class="px-4 py-2 rounded border text-sm hover:bg-[rgba(255,255,255,0.08)]"
          style={`border-color:${highlightColor}; color:${textColor}; background:${backgroundColor};`}
          on:click={start}
          disabled={state !== "idle"}
          title="Play the group-by-group reveal"
        >
          Start
        </button>
        <button
          class="px-4 py-2 rounded border text-sm hover:bg-[rgba(255,255,255,0.08)]"
          style={`border-color:${highlightColor}; color:${textColor}; background:${backgroundColor};`}
          on:click={skip}
          title="Skip the trailer"
        >
          Skip
        </button>
      </div>
      {#if state === "playing"}
        <div class="text-sm opacity-80">
          {Math.min(idx + 1, groups.length)} / {groups.length}
        </div>
      {/if}
    </div>
  </div>
{/if}
