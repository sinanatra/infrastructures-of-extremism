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
    datasets.map((d) => `/cover/${d.slug}.png`).concat(
      datasets.map((d) => `/cover/${d.slug}_pie.png`),
    ),
  );

  const MODES = [
    {
      key: "graph",
      label: "Time",
      href: (slug) => `/${encodeURIComponent(slug)}`,
    },
    {
      key: "pie",
      label: "Topics",
      href: (slug) => `/${encodeURIComponent(slug)}/pie`,
    },
    {
      key: "tree",
      label: "Network",
      href: (slug) => `/${encodeURIComponent(slug)}/tree`,
    },
  ];
</script>

<section
  class="bg-white text-gray-600 flex flex-col md:h-screen md:flex-row md:overflow-hidden"
>
  <div class="w-full h-[45vh] md:h-full md:flex-1 overflow-hidden">
    {#if coverImages.length}
      <CoverGL images={coverImages} />
    {/if}
  </div>
  <article
    class="w-full md:h-full md:w-[360px] md:flex-shrink-0 md:overflow-y-auto bg-[#fefefe] text-black px-4 pt-4 pb-20 text-base leading-relaxed"
  >
    <h1 class="text-xl mb-4 max-w-[300px] text-black">
      Infrastructures of Extremism
    </h1>
    <p class="mb-3">
      Right-wing extremist organisations have gained visibility on European
      streets. During orchestrated demonstrations, in particular youth groups
      show banners that advertise Telegram channels as offline-to-online
      gateways into far right communities. This investigation takes these
      banners as its starting point to surface how they lead into a network of
      interconnected online communities as <em>Infrastructures of Extremism.</em
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
        class=" border-gray-300 border w-[150px] block grayscale hover:grayscale-0"
      />
      <figcaption class="text-xs max-w-60 text-gray-600">
        A banner that promotes a link to a Telegram far-right youth group.
      </figcaption>
    </figure>

    <p class="mb-3">
      These Telegram channels collectively form a digital infrastructure that
      sustains ultra-nationalist ideologies, enabling the circulation of fascist
      worldviews among younger supporters. Across Germany, numerous members of
      these networks maintain ties to far-right parties such as <em
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
      emerged, taking on the role of mobilising younger supporters through the same
      networks. While the organisation was newly formed, some local groups that once
      operated under the banner of <em>Junge Alternative</em>
      have simply renamed their Telegram channels to
      <em>Generation Deutschland</em> and continued their activities business as
      usual. Hence, it occurs that the platform provided these groups with the means
      to absorb the ban rather than enforcing its implementation.
    </p>
    <figure class="flex flex-col items-end mt-6 mb-10 gap-2">
      <img
        src="/intro/gd.png"
        alt="Telegram profile of Generation Deutschland"
        class="w-[220px] block grayscale hover:grayscale-0"
      />
      <figcaption class="text-xs max-w-80 text-gray-600 text-right">
        The Telegram profile <em>@JungeAlternativeLSA</em> has been renamed
        <em>Generation Deutschland LSA</em>, although the handle remains the
        former.
      </figcaption>
    </figure>

    <p class="mb-3">
      These organisations operate within a strategically interconnected system.
      Groups like <em>Generation Deutschland</em>, which present themselves with
      a more moderate façade, regularly redirect their subscribers toward more
      radical channels. These, in turn, refer onward to others, forming a
      continuous chain of racist and ultra-nationalist messages. Their networks
      extend far beyond Germany, reaching similar nationalist scenes in
      countries such as Italy, France, Austria, the Netherlands and Ukraine, and
      beyond.
    </p>
    <p class="mb-3">
      Telegram plays a central role in maintaining this ecosystem. Its platform
      design creates not simply a place for supporters of specific groups to
      gather, but a tool to enable a constant stream of communication. Forwarded
      posts act as ideological pathways, allowing audiences to be funneled from
      one channel to another, enabling persistent networks, even in the face of
      bans or restrictions.
    </p>
    <figure class="flex flex-col items-start mt-6 mb-10 gap-2">
      <img
        src="/intro/roma.jpg"
        alt="Rome, Italy, 7 January 2025"
        class="w-full block grayscale hover:grayscale-0"
      />
      <figcaption class="text-xs max-w-80 text-gray-600">
        Rome, Italy, 7 January 2025. Hundreds of <em>CasaPound</em> supporters and
        other far-right militants performed the fascist salute during a commemoration.
      </figcaption>
    </figure>
    <p class="mb-3">
      This investigation takes as its input the banner documented at the Berlin
      protest and follows its network as it becomes visible on Telegram.
      Messages, mentions, reactions and forwarded posts are collected through
      automated data scraping and translated into a series of navigable maps,
      which allows the exploration of these entangled groups and thematic
      clusters.
    </p>
    <p class="mb-3">
      This approach reveals how individual groups expand and contract, which
      channels serve as key hubs, and how various national factions are
      connected across borders. Although these maps cannot capture the entire
      movement –due to private groups, deleted links, or blocked content– they
      expose part of the infrastructure that allows today's far-right ideologies
      to circulate uncensored. Extremists take advantage of the lack of
      moderation on Telegram to spread their views with minimal restriction,
      while making their content and relational structures available for
      monitoring.
    </p>
    <p class="mb-3">
      Finally, the investigation extends to a wider selection of Telegram groups
      from different national contexts, compiled on the basis of activity and
      connectivity. Particular attention is given to the most shared content
      among groups, showing how far-right narratives move and adapt across
      borders.
    </p>

    <h2 class="text-base border-t border-gray-300 mt-20 mb-10 pt-2">
      Several Telegram groups have been examined
    </h2>

    {#if datasets.length}
      <div class="mb-12 text-base tabular-nums">
        {#each datasets as dataset (dataset.slug)}
          <div class="border-b border-gray-300 py-4 text-black">
            <div>{dataset.label || dataset.slug}</div>
            <div class="flex gap-2 mt-1.5 text-xs tracking-wide">
              {#each MODES as m, i (m.key)}
                {#if i > 0}<span>/</span>{/if}
                <a
                  class="hover:underline"
                  data-sveltekit-reload
                  href={m.href(dataset.slug)}
                >
                  {m.label}
                </a>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <p class="text-xs border-t border-gray-300 mt-20 pt-2">
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
    </p>
  </article>
</section>
