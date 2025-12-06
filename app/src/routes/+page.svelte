<script>
  export let data;

  const datasets = data?.datasets ?? [];
  const formatDate = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

  const formatRange = (start, end) => {
    if (!start || !end) return null;
    try {
      return `${formatDate.format(new Date(start))} \u2013 ${formatDate.format(new Date(end))}`;
    } catch (err) {
      return null;
    }
  };
</script>

<section class="home bg-black text-xl text-white min-h-screen p-6">
  {#if datasets.length}
    <ul>
      {#each datasets as dataset (dataset.slug)}
        <li class="mt-2">
          <a data-sveltekit-reload href={`/${encodeURIComponent(dataset.slug)}`}>
            {dataset.label || dataset.slug}
          </a>
          {#if dataset.postCount || dataset.groupCount || dataset.startDate}
            <small class="text-gray-500">
              {#if dataset.postCount}{dataset.postCount.toLocaleString()} messages{/if}
              {#if dataset.postCount && dataset.groupCount}
                ·
              {/if}
              {#if dataset.groupCount}{dataset.groupCount} groups{/if}
              {#if (dataset.postCount || dataset.groupCount) && formatRange(dataset.startDate, dataset.endDate)}
                · {formatRange(dataset.startDate, dataset.endDate)}
              {:else if formatRange(dataset.startDate, dataset.endDate)}
                {formatRange(dataset.startDate, dataset.endDate)}
              {/if}
            </small>
          {/if}
        </li>
      {/each}
    </ul>
  {:else}
    <p>
      No datasets found. Run the scraper and precompute scripts to generate
      data.
    </p>
  {/if}
</section>
