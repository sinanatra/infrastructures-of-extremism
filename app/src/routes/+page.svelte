<script>
  import { onMount, onDestroy } from "svelte";

  let { data } = $props();

  const datasets = (data?.datasets ?? [])
    .slice()
    .sort((a, b) => (b?.postCount ?? 0) - (a?.postCount ?? 0));

  const coverSets = datasets.map((d) => {
    const slug = d.slug;
    return {
      slug,
      label: d.label || slug,
      items: [
        { src: `/cover/${slug}.png`, key: "normal", alt: `${slug} map` },
        { src: `/cover/${slug}_pie.png`, key: "pie", alt: `${slug} topics` },
        { src: `/cover/${slug}_tree.png`, key: "tree", alt: `${slug} network` },
      ],
    };
  });

  const fadeDuration = 1500;
  const cycleDelay = fadeDuration + 2000;
  const coverOrientation = "vertical";

  let coverIndex = $state(0);
  let coverTimer = null;

  const startCoverCycle = () => {
    stopCoverCycle();
    if (coverSets.length < 2) return;
    coverTimer = setInterval(() => {
      coverIndex = (coverIndex + 1) % coverSets.length;
    }, cycleDelay);
  };

  const stopCoverCycle = () => {
    if (!coverTimer) return;
    clearInterval(coverTimer);
    coverTimer = null;
  };

  onMount(startCoverCycle);
  onDestroy(stopCoverCycle);

  const formatRange = (start, end) => {
    if (!start || !end) return null;
    try {
      return `${formatDate.format(new Date(start))} to ${formatDate.format(new Date(end))}`;
    } catch (err) {
      return null;
    }
  };
</script>

<section class="bg-[#111111] text-gray-400 min-h-screen">
  {#if coverSets.length}
    <div class="sticky top-0 w-screen h-screen overflow-hidden">
      {#each coverSets as set, i (set.slug)}
        <div
          class={`absolute inset-0 coverTriptych ${coverOrientation}`}
          style={`opacity:${coverIndex === i ? 1 : 0};transition:opacity ${fadeDuration}ms ease-in-out;`}
        >
          {#each set.items as item (item.src)}
            <div class="coverPane {item.key}">
              <img
                src={item.src}
                alt={item.alt}
                class="coverImg {item.key}"
                loading="lazy"
                decoding="async"
              />
            </div>
          {/each}
        </div>
      {/each}
    </div>
  {/if}

  <div class="relative flex justify-center">
    <article
      class="relative z-10 w-full max-w-[640px] px-4 pt-10 pb-10 -mt-[30vh] bg-black"
    >
      <h1 class="text-4xl mb-4 max-w-[300px] text-white">
        Infrastructures of Extremism
      </h1>

      <div class="text-base leading-relaxed">
        <p class="mb-3">
          Right-wing extremist organisations have gained visibility on European
          streets. During orchestrated demonstrations, in particular youth
          groups show banners that advertise Telegram channels as
          offline-to-online gateways into far right communities. This
          investigation takes these banners as its starting point to surface how
          they lead into a network of interconnected online communities as <em
            >Infrastructures of Extremism.</em
          >
        </p>
        <p>
          At a rally held in Berlin on 29 November 2025 against so-called
          <em>“criminal foreigners”</em>, participants promoted Telegram
          channels used for youth recruitment and for coordinating activities at
          the local level. Such events reveal how street-level mobilisation is
          tightly interwoven with a broader digital ecosystem that fuels the
          expansion of far right extremism.
        </p>

        <figure class="flex flex-col items-start mt-10 mb-6 gap-2 self-start">
          <img
            src="/intro/berlin-demo.png"
            alt="Banner promoting a right-wing Telegram channel at a Berlin rally"
            class="w-[150px] block grayscale hover:grayscale-0"
          />
          <figcaption class="text-sm max-w-60 text-gray-600 pb-8">
            A banner that promotes a link to a Telegram far-right youth group.
          </figcaption>
        </figure>

        <p class="mb-2">
          These Telegram channels collectively form a digital infrastructure
          that sustains ultra-nationalist ideologies, enabling the circulation
          of fascist worldviews among younger supporters. Across Germany,
          numerous members of these networks maintain ties to far-right parties
          such as <em>Die Heimat</em> and
          <em>Alternative für Deutschland (AFD)</em>, whose presence in
          parliamentary politics gives symbolic legitimacy within these online
          spaces.
        </p>
        <p>
          The former youth organisation of AFD, <em>Junge Alternative</em>, was
          banned after being classified as right-wing extremist and subsequently
          ousted from the public sphere. Yet, recently a successor movement
          called
          <em>Generation Deutschland</em> emerged, taking on the role of
          mobilising younger supporters through the same networks. While the
          organisation was newly formed, some local groups that once operated
          under the banner of <em>Junge Alternative</em> have simply renamed
          their Telegram channels to <em>Generation Deutschland</em> and continued
          their activities business as usual. Hence, it occurs that the platform
          provided these groups with the means to absorb the ban rather than enforcing
          its implementation.
        </p>

        <figure class="flex flex-col items-end mt-10 mb-6 gap-2 self-end">
          <img
            src="/intro/gd.png"
            alt="Telegram profile of Generation Deutschland"
            class="w-[220px] block grayscale hover:grayscale-0"
          />
          <figcaption class="text-sm max-w-80 text-gray-600 pb-8 text-right">
            The Telegram profile <em>@JungeAlternativeLSA</em> has been renamed
            <em>Generation Deutschland LSA</em>, although the handle remains the
            former.
          </figcaption>
        </figure>

        <p class="mb-2">
          These organisations operate within a strategically interconnected
          system. Groups like <em>Generation Deutschland</em>, which present
          themselves with a more moderate façade, regularly redirect their
          subscribers toward more radical channels. These, in turn, refer onward
          to others, forming a continuous chain of racist and ultra-nationalist
          messages. Their networks extend far beyond Germany, reaching similar
          nationalist scenes in countries such as Italy, France, Austria, the
          Netherlands and Ukraine, and beyond.
        </p>
        <p>
          Telegram plays a central role in maintaining this ecosystem. Its
          platform design creates not simply a place for supporters of specific
          groups to gather, but a tool to enable a constant stream of
          communication. Forwarded posts act as ideological pathways, allowing
          audiences to be funneled from one channel to another, enabling
          persistent networks, even in the face of bans or restrictions.
        </p>

        <figure class="flex flex-col items-start mt-10 mb-6 gap-2 self-start">
          <img
            src="/intro/roma.jpg"
            alt="Rome, Italy, 7 January 2025"
            class="w-[350px] block grayscale hover:grayscale-0"
          />
          <figcaption class="text-sm max-w-80 text-gray-600 pb-8">
            Rome, Italy, 7 January 2025. Hundreds of <em>CasaPound</em> supporters
            and other far-right militants performed the fascist salute during a commemoration.
          </figcaption>
        </figure>

        <p class="mb-2">
          This investigation takes as its input the banner documented at the
          Berlin protest and follows its network as it becomes visible on
          Telegram. Messages, mentions, reactions and forwarded posts are
          collected through automated data scraping and translated into a series
          of navigable maps, which allows the exploration of these entangled
          groups and thematic clusters.
        </p>
        <p>
          This approach reveals how individual groups expand and contract, which
          channels serve as key hubs, and how various national factions are
          connected across borders. Although these maps cannot capture the
          entire movement –due to private groups, deleted links, or blocked
          content– they expose part of the infrastructure that allows today's
          far-right ideologies to circulate uncensored. Extremists take
          advantage of the lack of moderation on Telegram to spread their views
          with minimal restriction, while making their content and relational
          structures available for monitoring.
        </p>
        <p>
          Finally, the investigation extends to a wider selection of Telegram
          groups from different national contexts, compiled on the basis of
          activity and connectivity. Particular attention is given to the most
          shared content among groups, showing how far-right narratives move and
          adapt across borders.
        </p>
      </div>
    </article>
  </div>

  <div
    class="custom-shadow flex justify-center relative z-10 w-full h-full px-5 bg-black"
  >
    <section id="datasets" class="max-w-8xl pb-10 overflow-auto mx-auto">
      <h2 class="text-base pb-5 m-0 text-white">
        Several Telegram groups have been examined
      </h2>
      <h2 class="text-2xl p-0 m-0 text-white">Time</h2>

      <p class="text-sm max-w-80 text-gray-600 pb-8">
        Each timeline shows the entirety of the collected messages over time.
      </p>
      {#if datasets.length}
        <div
          class="flex gap-3 pb-2 overflow-x-auto selection:overflow-visible selection:flex-wrap selection:justify-center"
        >
          {#each datasets as dataset (dataset.slug)}
            <a
              class="flex-shrink-0 block hover:text-white"
              data-sveltekit-reload
              href={`/${encodeURIComponent(dataset.slug)}`}
            >
              <img
                src={`/cover/${dataset.slug}.png`}
                alt={dataset.label || dataset.slug}
                class="w-[450px] h-[450px] object-cover"
                loading="lazy"
              />
              <div class="mt-2">
                <div class="text-lg">
                  {dataset.label || dataset.slug}
                </div>
              </div>
            </a>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  <div
    class="custom-shadow flex justify-center relative z-10 w-full h-full px-5 pt-10 bg-black"
  >
    <section id="datasets" class="max-w-8xl overflow-auto mx-auto pb-10">
      <h2 class="text-2xl p-0 m-0 text-white">Topics</h2>

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
              class="flex-shrink-0 block hover:text-white"
              data-sveltekit-reload
              href={`/${encodeURIComponent(dataset.slug)}/pie`}
            >
              <img
                src={`/cover/${dataset.slug}_pie.png`}
                alt={dataset.label || dataset.slug}
                class="w-[450px] h-[450px] object-cover"
                loading="lazy"
              />
              <div class="mt-2">
                <div class="text-lg">
                  {dataset.label || dataset.slug}
                </div>
              </div>
            </a>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  <div
    class="custom-shadow flex justify-center relative z-10 w-full h-full px-5 pt-10 bg-black"
  >
    <section id="datasets" class="max-w-8xl overflow-auto mx-auto pb-10">
      <h2 class="text-2xl p-0 m-0 text-white">Network</h2>

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
              class="flex-shrink-0 block hover:text-white"
              data-sveltekit-reload
              href={`/${encodeURIComponent(dataset.slug)}/tree`}
            >
              <img
                src={`/cover/${dataset.slug}_tree.png`}
                alt={dataset.label || dataset.slug}
                class="w-[450px] h-[450px] object-cover"
                loading="lazy"
              />
              <div class="mt-2">
                <div class="text-lg">
                  {dataset.label || dataset.slug}
                </div>
              </div>
            </a>
          {/each}
        </div>
      {/if}
    </section>
  </div>
  <div
    class="custom-shadow justify-center flex relative z-10 w-full h-full px-5 pt-10 bg-black"
  >
    <section id="data" class="max-w-[1640px] w-full pb-10 space-y-4">
      <h2 class="text-2xl p-0 m-0 text-white">Datasets</h2>

      <p class="text-sm max-w-80 text-gray-600 pb-8">
        All the scraped material is publicly available.<br />
        Click to download the datasets.
      </p>
      {#if datasets.length}
        <div class="grid gap-2 max-h-[320px] overflow-auto pr-1">
          {#each datasets as dataset (dataset.slug)}
            <button
              class="w-full flex items-center justify-between gap-3 px-3 py-2 rounded border border-white/10 bg-black/60 text-left hover:bg-gray-400 hover:text-black transition text-sm"
              on:click={() => downloadDataset(dataset.slug)}
            >
              <span class="truncate">
                {dataset.label || dataset.slug}
              </span>
              <span class="text-xs whitespace-nowrap text-gray-700">
                {dataset.postCount?.toLocaleString() ?? "—"} messages · {dataset.groupCount ??
                  "—"} groups
                {#if formatRange(dataset.startDate, dataset.endDate)}
                  · {formatRange(dataset.startDate, dataset.endDate)}
                {/if}
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  <div class="relative z-10 w-full px-5 pb-10 pt-20 bg-black">
    <section class="max-w-5xl text-xs text-gray-400 space-y-2 text-left">
      <p>
        Infrastructures of Extremism is a project by Giacomo Nanni in
        collaboration with metaLAB (at) Harvard & Berlin.
        <br />
        For inquiries, please contact via email.
      </p>
    </section>
  </div>
</section>

<style>
  .coverTriptych {
    width: 100%;
    height: 100vh;
    max-height: 100vh;
    overflow: hidden;
    display: grid;
  }

  .coverTriptych.vertical {
    grid-template-columns: repeat(3, 1fr);
  }

  .coverTriptych.horizontal {
    grid-template-rows: repeat(3, 1fr);
  }

  .coverPane {
    overflow: hidden;
  }

  .coverImg {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .coverImg.pie {
    background-color: gainsboro;
  }

  /* @media (min-width: 1024px) {
    img.pie {
      object-fit: contain;
      transform: scale(1.8);
    }
  } */

  .custom-shadow {
    box-shadow:
      0 0 0 8px rgba(0, 0, 0, 0.9),
      0 0 0 16px rgba(0, 0, 0, 0.7),
      0 0 0 24px rgba(0, 0, 0, 0.5),
      0 0 0 31px rgba(0, 0, 0, 0.32),
      0 0 0 39px rgba(0, 0, 0, 0.18),
      0 -12px 36px 12px rgba(0, 0, 0, 0.32);
  }
</style>
