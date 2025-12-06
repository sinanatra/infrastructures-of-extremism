<script>
  import { createEventDispatcher, onDestroy } from "svelte";

  export let groups = [];
  export let highlightColor = "yellow";
  export let backgroundColor = "#000";
  export let textColor = "#fff";

  const dispatch = createEventDispatcher();

  let state = "idle"; // idle | playing | paused | done
  let idx = 0;
  let timer = null;
  let visible = new Set();
  let visitedOrder = [];
  const perGroupMs = 250;

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
      state,
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

  const pause = () => {
    if (state !== "playing") return;
    clearTimer();
    state = "paused";
    notify();
  };

  const resume = () => {
    if (state !== "paused") return;
    state = "playing";
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
    class={`overlay absolute z-30 ${state === "idle" ? "inset-0 flex items-center justify-center" : "top-4 right-4 flex justify-end"}`}
    on:click|stopPropagation
    on:pointerdown|stopPropagation
    style={`backdrop-filter:${state === "idle" ? "blur(2px)" : "none"};`}
  >
    <div
      class={`pointer-events-auto px-5 py-4 rounded shadow-lg ${state === "idle" ? "flex flex-col gap-3 items-center max-w-2xl w-[90vw] text-center" : "flex items-center gap-3 w-[360px] max-w-full text-left"}`}
      style={`background:${backgroundColor}; border:1px solid ${highlightColor}; color:${textColor};`}
    >
      {#if state === "idle"}
        <div class="text-2xl">
          Starting from the right-wing extremist Telegram group
          <span class="italic" style="color: {highlightColor};">{groups[0]?.label ?? "the seed"}</span>,
          this visualization shows the network of related channels: the ones they
          talk about and the ones resharing their posts.
        </div>
      {/if}
      <div class={`flex ${state === "idle" ? "items-center justify-center gap-3" : "items-center gap-3 w-full"}`}>
        {#if state === "playing"}
          <div class="flex-1 min-w-0">
            <div class="text-sm opacity-80 truncate">
              {groups[Math.min(idx, groups.length - 1)]?.label ?? ""}
            </div>
            <div class="text-[11px] opacity-60">
              {Math.min(idx + 1, groups.length)} / {groups.length}
            </div>
          </div>
        {/if}
        {#if state === "paused"}
          <div class="flex-1 min-w-0">
            <div class="text-sm opacity-80 truncate">
              Paused
            </div>
            <div class="text-[11px] opacity-60">
              {Math.min(idx, groups.length)} / {groups.length}
            </div>
          </div>
        {/if}
        {#if state === "idle"}
          <button
            class="px-4 py-2 rounded border text-sm hover:bg-[rgba(255,255,255,0.08)] active:scale-[0.98] transition-transform"
            style={`border-color:${highlightColor}; color:${textColor}; background:${backgroundColor};`}
            on:click={start}
            disabled={state !== "idle"}
            title="Play the group-by-group reveal"
          >
            Start
          </button>
        {/if}
        {#if state === "playing" || state === "paused"}
          <button
            class="px-3 py-2 rounded border text-sm hover:bg-[rgba(255,255,255,0.08)] active:scale-[0.98] transition-transform"
            style={`border-color:${highlightColor}; color:${textColor}; background:${backgroundColor};`}
            on:click={state === "playing" ? pause : resume}
            title={state === "playing" ? "Pause trailer" : "Resume trailer"}
          >
            {state === "playing" ? "Pause" : "Resume"}
          </button>
        {/if}
        <button
          class="px-4 py-2 rounded border text-sm hover:bg-[rgba(255,255,255,0.08)] active:scale-[0.98] transition-transform"
          style={`border-color:${highlightColor}; color:${textColor}; background:${backgroundColor};`}
          on:click={skip}
          title="Skip the trailer"
        >
          Skip
        </button>
      </div>
    </div>
  </div>
{/if}
