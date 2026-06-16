<script>
  import { onDestroy } from "svelte";
  import CoverGL from "$lib/CoverGL.svelte";

  let { data } = $props();

  const datasets = $derived(
    (data?.datasets ?? [])
      .slice()
      .sort((a, b) => (b?.postCount ?? 0) - (a?.postCount ?? 0)),
  );

  const coverImages = $derived(
    datasets.flatMap((d) => [
      `/cover/${d.slug}.png`,
      // `/cover/${d.slug}_pie.png`,
      // `/cover/${d.slug}_tree.png`,
    ]),
  );

  let downloadingSlug = $state(null);

  const formatDate = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const downloadDataset = async (slug) => {
    if (!slug || downloadingSlug === slug) return;
    downloadingSlug = slug;
    try {
      const response = await fetch(`/data/${slug}/graph.json`);
      if (!response.ok) {
        throw new Error(`Failed to fetch dataset: ${response.statusText}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}-data.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
      alert("Failed to download dataset");
    } finally {
      if (downloadingSlug === slug) {
        downloadingSlug = null;
      }
    }
  };

  const formatRange = (start, end) => {
    if (!start || !end) return null;
    try {
      return `${formatDate.format(new Date(start))} to ${formatDate.format(new Date(end))}`;
    } catch (err) {
      return null;
    }
  };
</script>

<section class="bg-white text-gray-600 min-h-screen">
  {#if coverImages.length}
    <div class="sticky min-h-[60vh] top-0 w-screen h-screen overflow-hidden">
      <CoverGL images={coverImages} />
    </div>
  {/if}

  <div class="relative z-10 grid grid-cols-1 md:grid-cols-3 -mt-[30vh]">
    <div class="hidden md:block md:col-span-2"></div>
    <article
      class="bg-[#dedede] text-black px-4 pt-4 pb-20 text-base leading-relaxed"
    >
      <h1 class="text-5xl mb-4 max-w-[300px] text-black">
        Infrastructures of Extremism
      </h1>
      <p class="mb-3">
        Right-wing extremist organisations have gained visibility on European
        streets. During orchestrated demonstrations, in particular youth groups
        show banners that advertise Telegram channels as offline-to-online
        gateways into far right communities. This investigation takes these
        banners as its starting point to surface how they lead into a network of
        interconnected online communities as <em
          >Infrastructures of Extremism.</em
        >
      </p>
      <p class="mb-3">
        At a rally held in Berlin on 29 November 2025 against so-called
        <em>"criminal foreigners"</em>, participants promoted Telegram channels
        used for youth recruitment and for coordinating activities at the local
        level. Such events reveal how street-level mobilisation is tightly
        interwoven with a broader digital ecosystem that fuels the expansion of
        far right extremism.
      </p>
      <figure class="flex flex-col items-start mt-6 mb-10 gap-2">
        <img
          src="/intro/berlin-demo.png"
          alt="Banner promoting a right-wing Telegram channel at a Berlin rally"
          class=" border-gray-300 border w-[350px] block grayscale hover:grayscale-0"
        />
        <figcaption class="text-sm max-w-60 text-gray-600">
          A banner that promotes a link to a Telegram far-right youth group.
        </figcaption>
      </figure>

      <p class="mb-3">
        These Telegram channels collectively form a digital infrastructure that
        sustains ultra-nationalist ideologies, enabling the circulation of
        fascist worldviews among younger supporters. Across Germany, numerous
        members of these networks maintain ties to far-right parties such as <em
          >Die Heimat</em
        >
        and
        <em>Alternative für Deutschland (AFD)</em>, whose presence in
        parliamentary politics gives symbolic legitimacy within these online
        spaces.
      </p>
      <p class="mb-3">
        The former youth organisation of AFD, <em>Junge Alternative</em>, was
        banned after being classified as right-wing extremist and subsequently
        ousted from the public sphere. Yet, recently a successor movement called
        <em>Generation Deutschland</em>
        emerged, taking on the role of mobilising younger supporters through the
        same networks. While the organisation was newly formed, some local groups
        that once operated under the banner of <em>Junge Alternative</em>
        have simply renamed their Telegram channels to
        <em>Generation Deutschland</em> and continued their activities business as
        usual. Hence, it occurs that the platform provided these groups with the
        means to absorb the ban rather than enforcing its implementation.
      </p>
      <figure class="flex flex-col items-end mt-6 mb-10 gap-2">
        <img
          src="/intro/gd.png"
          alt="Telegram profile of Generation Deutschland"
          class="w-[220px] block grayscale hover:grayscale-0"
        />
        <figcaption class="text-sm max-w-80 text-gray-600 text-right">
          The Telegram profile <em>@JungeAlternativeLSA</em> has been renamed
          <em>Generation Deutschland LSA</em>, although the handle remains the
          former.
        </figcaption>
      </figure>

      <p class="mb-3">
        These organisations operate within a strategically interconnected
        system. Groups like <em>Generation Deutschland</em>, which present
        themselves with a more moderate façade, regularly redirect their
        subscribers toward more radical channels. These, in turn, refer onward
        to others, forming a continuous chain of racist and ultra-nationalist
        messages. Their networks extend far beyond Germany, reaching similar
        nationalist scenes in countries such as Italy, France, Austria, the
        Netherlands and Ukraine, and beyond.
      </p>
      <p class="mb-3">
        Telegram plays a central role in maintaining this ecosystem. Its
        platform design creates not simply a place for supporters of specific
        groups to gather, but a tool to enable a constant stream of
        communication. Forwarded posts act as ideological pathways, allowing
        audiences to be funneled from one channel to another, enabling
        persistent networks, even in the face of bans or restrictions.
      </p>
      <figure class="flex flex-col items-start mt-6 mb-10 gap-2">
        <img
          src="/intro/roma.jpg"
          alt="Rome, Italy, 7 January 2025"
          class="w-full block grayscale hover:grayscale-0"
        />
        <figcaption class="text-sm max-w-80 text-gray-600">
          Rome, Italy, 7 January 2025. Hundreds of <em>CasaPound</em> supporters
          and other far-right militants performed the fascist salute during a commemoration.
        </figcaption>
      </figure>
      <p class="mb-3">
        This investigation takes as its input the banner documented at the
        Berlin protest and follows its network as it becomes visible on
        Telegram. Messages, mentions, reactions and forwarded posts are
        collected through automated data scraping and translated into a series
        of navigable maps, which allows the exploration of these entangled
        groups and thematic clusters.
      </p>
      <p class="mb-3">
        This approach reveals how individual groups expand and contract, which
        channels serve as key hubs, and how various national factions are
        connected across borders. Although these maps cannot capture the entire
        movement –due to private groups, deleted links, or blocked content– they
        expose part of the infrastructure that allows today's far-right
        ideologies to circulate uncensored. Extremists take advantage of the
        lack of moderation on Telegram to spread their views with minimal
        restriction, while making their content and relational structures
        available for monitoring.
      </p>
      <p>
        Finally, the investigation extends to a wider selection of Telegram
        groups from different national contexts, compiled on the basis of
        activity and connectivity. Particular attention is given to the most
        shared content among groups, showing how far-right narratives move and
        adapt across borders.
      </p>
    </article>
  </div>

  <div
    class="custom-shadow sticky min-h-[60vh] top-0 flex justify-center relative z-10 w-full h-full px-5 bg-[#dedede] text-black"
  >
    <section id="datasets" class="max-w-8xl pb-10 overflow-auto mx-auto">
      <h2 class="text-2xl m-0 w-[340px] pt-4 text-black">
        Several Telegram groups have been examined
      </h2>
      <h2 class="text-2xl pt-20 m-0 text-black">Time</h2>

      <p class="text-sm max-w-80 text-gray-600 pb-8">
        Each timeline shows the entirety of the collected messages over time.
      </p>
      {#if datasets.length}
        <div
          class="flex gap-3 pb-2 overflow-x-auto selection:overflow-visible selection:flex-wrap selection:justify-center"
        >
          {#each datasets as dataset (dataset.slug)}
            <a
              class="flex-shrink-0 block hover:text-black"
              data-sveltekit-reload
              href={`/${encodeURIComponent(dataset.slug)}`}
            >
              <div
                class=" border-gray-300 border w-[350px] h-[350px] overflow-hidden"
              >
                <img
                  src={`/cover/${dataset.slug}.png`}
                  alt={dataset.label || dataset.slug}
                  class="w-full h-full object-cover scale-[1.35]"
                  loading="lazy"
                />
              </div>
              <div class="mt-4 pb-2 w-[350px]">
                <div class="text-base leading-snug">
                  {dataset.label || dataset.slug}
                </div>
                {#if dataset.endDate}
                  <div class="text-xs text-gray-600 mt-2">
                    Updated {formatDate.format(new Date(dataset.endDate))}
                  </div>
                {/if}
              </div>
            </a>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  <div
    class="custom-shadow pt-20 sticky min-h-[60vh] top-0 flex justify-left relative z-10 w-full h-full px-5 pt-4 bg-[#dedede] text-black"
  >
    <section id="datasets" class="max-w-8xl overflow-auto pb-10">
      <h2 class="text-2xl p-0 m-0 text-black">Topics</h2>

      <p class="text-sm max-w-80 text-gray-600 pb-8">
        Each chart shows the overall share of scraped messages by dominant
        topic.
      </p>
      {#if datasets.length}
        <div
          class="flex gap-3 pb-2 overflow-x-auto selection:overflow-visible selection:flex-wrap selection:justify-center"
        >
          {#each datasets as dataset (dataset.slug)}
            <a
              class="flex-shrink-0 block hover:text-black"
              data-sveltekit-reload
              href={`/${encodeURIComponent(dataset.slug)}/pie`}
            >
              <div
                class=" border-gray-300 border w-[350px] h-[350px] overflow-hidden"
              >
                <img
                  src={`/cover/${dataset.slug}_pie.png`}
                  alt={dataset.label || dataset.slug}
                  class="w-full h-full object-cover scale-[1.35]"
                  loading="lazy"
                />
              </div>
              <div class="mt-4 pb-2 w-[350px]">
                <div class="text-base leading-snug">
                  {dataset.label || dataset.slug}
                </div>
                {#if dataset.endDate}
                  <div class="text-xs text-gray-600 mt-2">
                    Updated {formatDate.format(new Date(dataset.endDate))}
                  </div>
                {/if}
              </div>
            </a>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  <div
    class="custom-shadow pt-20 sticky min-h-[60vh] top-0 flex relative z-10 w-full h-full px-5 pt-4 bg-[#dedede] text-black"
  >
    <section id="datasets" class="max-w-8xl overflow-auto pb-10">
      <h2 class="text-2xl p-0 m-0 text-black">Network</h2>

      <p class="text-sm max-w-80 text-gray-600 pb-8">
        The network reproduces the collection logic, linking channels through
        mentions and forwards.
      </p>
      {#if datasets.length}
        <div
          class="flex gap-3 pb-2 overflow-x-auto selection:overflow-visible selection:flex-wrap selection:justify-center"
        >
          {#each datasets as dataset (dataset.slug)}
            <a
              class="flex-shrink-0 block hover:text-black"
              data-sveltekit-reload
              href={`/${encodeURIComponent(dataset.slug)}/tree`}
            >
              <div
                class=" border-gray-300 border w-[350px] h-[350px] overflow-hidden"
              >
                <img
                  src={`/cover/${dataset.slug}_tree.png`}
                  alt={dataset.label || dataset.slug}
                  class="w-full h-full object-cover scale-[1.35]"
                  loading="lazy"
                />
              </div>
              <div class="mt-4 pb-2 w-[350px]">
                <div class="text-base leading-snug">
                  {dataset.label || dataset.slug}
                </div>
                {#if dataset.endDate}
                  <div class="text-xs text-gray-600 mt-2">
                    Updated {formatDate.format(new Date(dataset.endDate))}
                  </div>
                {/if}
              </div>
            </a>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  <div
    class="custom-shadow pt-20 sticky min-h-[60vh] top-0 justify-center flex relative z-10 w-full h-full px-5 pt-4 bg-[#dedede] text-black"
  >
    <section id="data" class="max-w-[1640px] w-full pb-10 space-y-4">
      <h2 class="text-2xl p-0 m-0 text-black">Datasets</h2>

      <p class="text-sm max-w-80 text-gray-600 pb-8">
        All the scraped material is publicly available.<br />
        Click to download the datasets.
      </p>
      {#if datasets.length}
        <div class="grid gap-2 max-h-[320px] overflow-auto pr-1">
          {#each datasets as dataset (dataset.slug)}
            <button
              class="w-full flex items-center justify-between gap-3 px-3 py-2 rounded border border-black/20 bg-[#dedede] text-black/60 text-left hover:bg-gray-300 hover:text-black transition text-sm disabled:cursor-wait disabled:opacity-80 disabled:hover:bg-[#dedede] text-black/60 disabled:hover:text-current"
              onclick={() => downloadDataset(dataset.slug)}
              disabled={downloadingSlug === dataset.slug}
              aria-busy={downloadingSlug === dataset.slug}
            >
              <span class="truncate">
                {dataset.label || dataset.slug}
              </span>
              <span class="text-xs whitespace-nowrap text-gray-700">
                {#if downloadingSlug === dataset.slug}
                  Downloading...
                {:else}
                  {dataset.postCount?.toLocaleString() ?? "—"} messages · {dataset.groupCount ??
                    "—"} groups
                  {#if formatRange(dataset.startDate, dataset.endDate)}
                    · {formatRange(dataset.startDate, dataset.endDate)}
                  {/if}
                {/if}
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  <div class="relative z-10 w-full px-5 pb-10 pt-20 bg-[#dedede] text-black">
    <section class="max-w-5xl text-xs text-gray-600 space-y-2 text-left">
      <p>
        Infrastructures of Extremism is a project by

        <a
          class="underline"
          href="https://giacomo.website/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Giacomo Nanni
        </a>
        in collaboration with metaLAB (at) Harvard & Berlin.
        <br />
      </p>
    </section>
  </div>
</section>

<style>
  .custom-shadow {
    box-shadow: 0 -2px 5px 4px rgba(174, 174, 174, 0.9);
  }
</style>
