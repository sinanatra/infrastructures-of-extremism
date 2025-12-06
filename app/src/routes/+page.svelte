<script>
  import { onMount, onDestroy } from "svelte";
  import { fade } from "svelte/transition";

  export let data;

  const datasets = (data?.datasets ?? [])
    .slice()
    .sort((a, b) => (b?.postCount ?? 0) - (a?.postCount ?? 0));
  const formatDate = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
  const coverImages = datasets
    .map((d) => (d?.slug ? `/cover/${d.slug}.png` : null))
    .filter(Boolean);

  const cycleDelay = datasets.length * 1200;
  let coverIndex = 0;
  let coverTimer = null;
  let lastCoverCount = coverImages.length;

  const startCoverCycle = () => {
    stopCoverCycle();
    if (coverImages.length < 2) return;
    coverTimer = setInterval(() => {
      coverIndex = (coverIndex + 1) % coverImages.length;
    }, cycleDelay);
  };

  const stopCoverCycle = () => {
    if (!coverTimer) return;
    clearInterval(coverTimer);
    coverTimer = null;
  };

  onMount(startCoverCycle);
  onDestroy(stopCoverCycle);

  $: if (coverImages.length !== lastCoverCount) {
    lastCoverCount = coverImages.length;
    coverIndex = 0;
    startCoverCycle();
  }

  const formatRange = (start, end) => {
    if (!start || !end) return null;
    try {
      return `${formatDate.format(new Date(start))} to ${formatDate.format(new Date(end))}`;
    } catch (err) {
      return null;
    }
  };
</script>

<section class="bg-[#111111] text-white min-h-screen">
  {#if coverImages.length}
    <div class="sticky top-0 w-screen h-screen overflow-hidden">
      {#each coverImages as src, i (src)}
        <img
          {src}
          alt="Dataset visualization cover"
          class="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1200ms] ease-in-out will-change-opacity"
          style={`opacity:${coverIndex === i ? 1 : 0};`}
          loading="lazy"
          decoding="async"
          aria-hidden={coverIndex !== i}
        />
      {/each}
    </div>
  {/if}

  <div class="relative flex justify-center px-4">
    <article
      class="relative z-10 w-full max-w-2xl px-4 pt-8 pb-10 -mt-[30vh] bg-black"
    >
      <h1 class="text-3xl mb-4 max-w-xl">Tracing Extremism</h1>

      <div class="text-base leading-relaxed text-gray-200">
        <p class="mb-2">
          Right-wing youth organisations have gained greater visibility on
          European streets. During demonstrations, banners often advertise
          Telegram channels as gateways to extremist communities. For example,
          at a rally held in Berlin on 29 November 2025 against so-called <em
            >“criminal foreigners”</em
          >, participants promoted channels used for youth recruitment and for
          coordinating activities at the local level. But who is behind these
          messages and what do they say? Moreover, how are they disseminated and
          who do they reach?
        </p>

        <figure class="flex flex-col items-start mt-10 mb-6 gap-2 self-start">
          <img
            src="/intro/berlin-demo.png"
            alt="Banner promoting a right-wing Telegram channel at a Berlin rally"
            class="w-[150px] block grayscale hover:grayscale-0"
          />
          <figcaption class="text-sm max-w-80 text-gray-600 pb-8">
            The banner promotes a Telegram channel used to connect supporters
            and spread propaganda among far-right youth groups.
          </figcaption>
        </figure>

        <p class="mb-2">
          In Germany, many of the people involved are connected to
          <em>Alternative für Deutschland</em> (AfD), a far-right political
          party with seats in parliament and a strongly anti-immigration stance.
          Its former youth wing,
          <em>Junge Alternative</em>, was recently labelled as an extremist
          organisation and effectively banned from public life. In its place, a
          new network has emerged:
          <em>Generation Deutschland</em>. This group is seeking to take over
          the task of youth mobilisation, using platforms like Telegram even
          more intensively. Oddly enough, in a few cases, groups that originally
          operated under the name <em>Junge Alternative</em> simply changed
          their username to
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
          Telegram is not only a place where these groups gather, but also a
          tool that keeps them in constant contact. Forwarded messages make it
          easy to switch between groups, especially when they are at risk of
          being banned. Threads often cross regional and national boundaries,
          connecting what might seem like isolated initiatives into a larger
          shared media environment. What looks like a local protest may actually
          be part of a much wider network spanning countries such as Italy,
          France, Austria, the Netherlands and Poland.
        </p>

        <figure class="flex flex-col items-start mt-10 mb-6 gap-2 self-start">
          <img
            src="/intro/roma.jpg"
            alt="Rome, Italy, 7 January 2025"
            class="w-[350px] block grayscale hover:grayscale-0"
          />
          <figcaption class="text-sm max-w-80 text-gray-600 pb-8">
            Rome, Italy, 7 January 2025. Hundreds of <em>CasaPound</em> supporters
            and other far-right militants performed the fascist salute during a commemoration
            for those killed on 7 January 1978 in Via Acca Larentia, where far-left
            militants shot and killed two young neo-fascists.
          </figcaption>
        </figure>

        <p class="mb-2">
          This investigation begins with the protest in Berlin and follows their
          network visible on Telegram. Mentions, forwards, and related messages
          are collected via automated scraping and transformed into a map. This
          allows us to see how individual groups grow, which channels serve as
          key hubs, and which connect different national scenes. While this does
          not provide a complete picture of the movement, it does provide a way
          to trace some of the infrastructure behind the circulation of today's
          fascist ideologies.
        </p>
      </div>
    </article>
  </div>

  <div
    class="custom-shadow flex justify-center relative z-10 w-full px-5 pt-10 bg-black"
  >
    <section id="datasets" class="max-w-8xl overflow-auto mx-auto pb-10">
      <h2 class="text-2xl p-0 m-0">Open a map</h2>

      <p class="text-sm max-w-80 text-gray-600 pb-8">
        Several groups have been examined. <br />
        Click on each one to explore its network.
      </p>
      {#if datasets.length}
        <div
          class="flex gap-3 pb-2 overflow-x-auto selection:overflow-visible selection:flex-wrap selection:justify-center"
        >
          {#each datasets as dataset (dataset.slug)}
            <a
              class="flex-shrink-0 block"
              data-sveltekit-reload
              href={`/${encodeURIComponent(dataset.slug)}`}
            >
              <img
                src={`/cover/${dataset.slug}.png`}
                alt={dataset.label || dataset.slug}
                class="w-[450px] h-[450px] object-cover grayscale hover:grayscale-0"
                loading="lazy"
              />
              <div class="mt-2">
                <div class="text-lg">
                  {dataset.label || dataset.slug}
                </div>
                <div class="text-sm text-gray-400">
                  {dataset.postCount?.toLocaleString() ?? "—"} messages · {dataset.groupCount ??
                    "—"} groups
                  {#if formatRange(dataset.startDate, dataset.endDate)}
                    · {formatRange(dataset.startDate, dataset.endDate)}
                  {/if}
                </div>
              </div>
            </a>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</section>

<style>
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
