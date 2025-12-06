<script>
  import { onMount, onDestroy } from "svelte";
  import { fade } from "svelte/transition";

  export let data;

  const datasets = data?.datasets ?? [];
  const formatDate = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
  const coverImages = datasets
    .map((d) => (d?.slug ? `/intro/${d.slug}.png` : null))
    .filter(Boolean);

  let coverIndex = 0;
  let coverTimer = null;

  const startCoverCycle = () => {
    if (coverTimer || coverImages.length < 2) return;
    coverTimer = setInterval(() => {
      coverIndex = (coverIndex + 1) % coverImages.length;
    }, 3200);
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

<section class="bg-[#111111] text-white min-h-screen">
  {#if coverImages.length}
    <div class="sticky top-0 w-screen h-screen overflow-hidden">
      {#each coverImages as src, i (src)}
        {#if coverIndex === i}
          <img
            {src}
            alt="Dataset visualization cover"
            class="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            aria-hidden={coverIndex !== i}
            in:fade={{ duration: 1200 }}
            out:fade={{ duration: 1200 }}
          />
        {/if}
      {/each}
    </div>
  {/if}

  <div class="relative flex justify-center px-5">
    <article
      class="relative z-10 w-full max-w-2xl px-8 pb-10 py-10
         -mt-[45vh] bg-black"
    >
      <h1 class="text-4xl mb-4 max-w-xl italic">Right-wing youth networks</h1>

      <div class="text-base leading-relaxed text-gray-200">
        <p class="mb-2">
          Right-wing youth organisations have become increasingly visible in
          European streets. Demonstrations and counter marches now often display
          banners that advertise Telegram channels as entry points into a
          political community. At a rally in Berlin on 29 November 2025
          participants promoted channels used for youth recruitment and local
          coordination. This public visibility raises a set of urgent questions.
          Who are the actors behind these slogans. How do their messages move.
          What narratives about identity, belonging and threat are being
          circulated and with what reach.
        </p>

        <figure class="flex flex-col items-start mt-10 mb-6 gap-2">
          <img
            src="/intro/berlin-demo.png"
            alt="Banner promoting a Telegram channel at a Berlin rally"
            class="w-[150px] block"
          />
          <figcaption class="text-sm max-w-80 text-gray-600 pb-8">
            Young individuals at a demonstration in Berlin on 29 November 2025.
            The banner promotes a Telegram channel used to connect supporters
            and circulate propaganda among far right youth groups.
          </figcaption>
        </figure>

        <p class="mb-2">
          In Germany many of these actors orbit around <em
            >Alternative fuer Deutschland</em
          >, a party with parliamentary representation and a strongly
          nationalist and anti immigrant profile. Its former youth wing
          <em>Junge Alternative</em>
          has been classified as an extremist organisation and effectively banned
          from public activity. In this context a new branch has emerged:
          <em>Generation Deutschland</em>, which seeks to inherit the role of
          youth mobilisation with a sharper branding and heavier reliance on
          social media infrastructures such as Telegram.
        </p>

        <p class="mb-2">
          This platform does not simply host these communities. Forward chains,
          usernames embedded in images and informal clusters make it easy for
          users to move from one group to another. Messages travel across
          regions and borders, linking otherwise separate initiatives into a
          shared media environment. What appears as a local scene is often
          connected to a larger network that includes actors in Italy, France,
          Austria, the Netherlands, Poland and beyond.
        </p>

        <figure class="flex flex-col items-start mt-10 mb-6 gap-2">
          <img
            src="/intro/roma.jpg"
            alt="Rome, Italy, 7 January 2025"
            class="w-[350px] block"
          />
          <figcaption class="text-sm max-w-80 text-gray-600 pb-8">
            Rome, Italy, 7 January 2025. Hundreds of <em>CasaPound</em> supporters
            and other far-right militants gave the fascist salute during a commemoration
            for those killed on 7 January 1978 in Via Acca Larentia, where left-wing
            terrorists shot and killed two young neo-fascists; a third died later.
          </figcaption>
        </figure>

        <p class="mb-2">
          To understand these connections this investigation starts from the
          Berlin case and follows publicly visible traces between Telegram
          channels. We collect mentions, forwards and linked messages through
          automated scraping and convert them into relational data. Each dataset
          forms a map that shows how a single cluster expands, which channels
          act as hubs and which ones serve as bridges to other countries. The
          result is not a full representation of the movement but an
          investigative tool that exposes part of the infrastructure driving the
          circulation of fascist ideas, strategies and identities.
        </p>
      </div>
    </article>
  </div>

  <div
    class="custom-shadow flex justify-center relative z-10 w-full px-5 pt-10 bg-black"
  >
    <section id="datasets" class="max-w-8xl overflow-auto mx-auto pb-10">
      <h2 class="text-2xl p-0 m-0 mb-2">Open a map</h2>

      {#if datasets.length}
        <div
          class="flex gap-4 pb-2 overflow-x-auto selection:overflow-visible selection:flex-wrap selection:justify-center"
        >
          {#each datasets as dataset (dataset.slug)}
            <a
              class="w-[450px] flex-shrink-0 block"
              data-sveltekit-reload
              href={`/${encodeURIComponent(dataset.slug)}`}
            >
              <img
                src={`/intro/${dataset.slug}.png`}
                alt={dataset.label || dataset.slug}
                class="w-100 h-100 object-cover grayscale hover:grayscale-0"
                loading="lazy"
              />
              <div class="sp-1">
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
