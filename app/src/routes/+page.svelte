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
          Right-wing organisations have gained greater visibility on European
          streets. During demonstrations, banners often advertise Telegram
          channels as gateways to extremist communities.
        </p>
        <p>
          At a rally held in Berlin on 29 November 2025 against so-called
          <em>“criminal foreigners”</em>, participants promoted channels used
          for youth recruitment and for coordinating activities at the local
          level. Understanding how these channels operate is essential to reveal
          how street-level mobilisation connects to a broader digital ecosystem
          that fuels the growth of extremism.
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
          These types of Telegram channels collectively form a digital
          infrastructure that supports the mobilisation of ultranationalist
          ideologies, enabling the spread of ideology among younger supporters.
          Across Germany, numerous members of these networks maintain ties to
          various far-right ultranationalist parties: <em>Die Heimat</em>, which
          has openly neo-Nazi roots, and

          <em>Alternative für Deutschland</em> which holds seats in parliament and
          campaigns strongly against immigration, are just two examples.
        </p>
        <p>
          The former youth organisation of the latter party,
          <em>Junge Alternative</em>, has been classified as extremist and
          ousted from the public sphere, leading to the recent emergence (29
          November 2025) of a successor movement called
          <em>Generation Deutschland</em>. This new formation has taken on the
          role of mobilising younger supporters, relying on platforms such as
          Telegram. Although the national intelligence service has declared
          <em>Junge Alternative</em>
          anti-democratic, some local groups that once operated under that banner
          seem to have simply changed their name to
          <em>Generation Deutschland</em> and continued their activities as before.
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
          What is becoming increasingly clear is how interconnected these
          organisations are. Groups such as <em> Generation Deutschland</em>,
          which seek to present themselves with a more moderate facade,
          regularly redirect their followers to more radical channels, which in
          turn refer them to others, creating a continuous chain of racist and
          ultra-nationalist messages. These links extend far beyond Germany,
          reaching similar nationalist scenes in countries such as Italy,
          France, Austria, the Netherlands and Ukraine, sometimes even across
          the Globe.
        </p>
        <p>
          Telegram plays a central role in sustaining this ecosystem. It is not
          simply a place where supporters of a specific group gather, but a tool
          that keeps these networks in constant communication. Forwarded posts
          act as pathways from one channel to another, allowing groups to
          preserve and expand their audience even in the face of bans or
          restrictions.
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
          This investigation takes as its input the banners mentioned in the
          Berlin protest and follows their network as made visible on Telegram.
          Mentions, forwards, and thematically related messages are collected
          via automated data scraping and transformed into a series of navigable
          maps.
        </p>
        <p>
          This approach shows how individual groups expand and contract, which
          channels serve as crucial hubs, and how various national factions are
          connected to one another. Although these maps cannot capture the
          entire movement (e.g. some of these groups are private, some links
          were deleted, probably blocked), they expose part of the
          infrastructure that allows today's far-right ideologies to circulate
          uncensored. The lack of moderation on Telegram allows extremists to
          spread their views, while making their content and relational
          structures available for monitoring.
        </p>
        <p>
          Finally, the investigation extends to a wider selection of Telegram
          groups from different countries. Each, based on the most active
          channels in that context. Particular importance is given to the most
          shared content among groups, showing how far-right messages move and
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
        Several groups have been examined
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
