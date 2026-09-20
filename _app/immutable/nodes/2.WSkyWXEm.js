import{f as T,a as y}from"../chunks/BLctrNQv.js";import{W as q,Y as K,Z as s,i as a,aT as J,at as w,_ as n,a0 as Z,X}from"../chunks/Bfwr3gcN.js";import{s as N}from"../chunks/C_cH4iDq.js";import{e as Y}from"../chunks/C0sFRtr5.js";import{p as Q,b as ee,i as P}from"../chunks/BBklI3ci.js";import{s as R}from"../chunks/CgZS_hsv.js";import{o as te}from"../chunks/aTtdruhv.js";const ae=async({fetch:B})=>{const[D,v]=await Promise.all([B("/data/datasets.json"),B("/data/dataset-themes.json")]);let b=[];if(D.ok)try{b=await D.json()}catch(l){console.warn("Failed to parse datasets.json",l)}Array.isArray(b)||(b=[]);let c=[];if(v.ok)try{c=await v.json()}catch(l){console.warn("Failed to parse dataset-themes.json",l)}Array.isArray(c)||(c=[]);const e=new Map(c.filter(l=>l?.slug&&l.theme).map(l=>[l.slug,l.theme]));return{datasets:b.map(l=>({...l,theme:e.get(l?.slug)??l?.theme}))}},ke=Object.freeze(Object.defineProperty({__proto__:null,load:ae},Symbol.toStringTag,{value:"Module"})),re=`attribute vec2 a_pos;
varying vec2 v_uv;

void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, a_pos.y * 0.5 + 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`,ie=`precision highp float;

varying vec2 v_uv;

uniform sampler2D u_texA;
uniform sampler2D u_texB;
uniform sampler2D u_noise;
uniform float u_t;
uniform vec2 u_res;
uniform vec2 u_sizeA;
uniform vec2 u_sizeB;
uniform float u_dpr;
uniform vec2 u_noiseSize;

// gradient Perlin noise
vec3 grad3(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7,  74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  );
  return normalize(2.0 * fract(sin(p) * 43758.5453) - 1.0);
}

float perlin(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);

  float v000 = dot(grad3(i),              f);
  float v100 = dot(grad3(i+vec3(1,0,0)),  f - vec3(1,0,0));
  float v010 = dot(grad3(i+vec3(0,1,0)),  f - vec3(0,1,0));
  float v110 = dot(grad3(i+vec3(1,1,0)),  f - vec3(1,1,0));
  float v001 = dot(grad3(i+vec3(0,0,1)),  f - vec3(0,0,1));
  float v101 = dot(grad3(i+vec3(1,0,1)),  f - vec3(1,0,1));
  float v011 = dot(grad3(i+vec3(0,1,1)),  f - vec3(0,1,1));
  float v111 = dot(grad3(i+vec3(1,1,1)),  f - vec3(1,1,1));

  return mix(
    mix(mix(v000, v100, u.x), mix(v010, v110, u.x), u.y),
    mix(mix(v001, v101, u.x), mix(v011, v111, u.x), u.y),
    u.z
  ) * 0.5 + 0.5;
}

float p5noise(float x, float y, float z) {
  vec3 p = vec3(x, y, z);
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * perlin(p);
    p *= 2.0;
    amp *= 0.5;
  }
  return v / 0.9375;
}

vec2 coverUV(vec2 uv, vec2 imgSize) {
  float ca = u_res.x / u_res.y;
  float ia = imgSize.x / imgSize.y;
  vec2 scale = ca > ia ? vec2(1.0, ia / ca) : vec2(ca / ia, 1.0);
  scale *= 0.95;
  return (uv - 0.5) * scale + 0.5;
}

void main() {
  vec4 colorA = texture2D(u_texA, coverUV(v_uv, u_sizeA));
  vec4 colorB = texture2D(u_texB, coverUV(v_uv, u_sizeB));

  vec2 cssRes = u_res / u_dpr;

  float bnVal = texture2D(u_noise, v_uv * cssRes / u_noiseSize).r;

  vec2 px = v_uv * cssRes * 0.5;
  float noiseVal = p5noise(px.x * 0.001, px.y * 0.001, u_t);

  float useB = noiseVal < u_t + (bnVal - 0.5) * 0.5 ? 1.0 : 0.0;

  gl_FragColor = mix(colorA, colorB, useB);
}
`;var ne=T('<canvas class="block w-full h-full"></canvas>');function oe(B,D){q(D,!0);let v=Q(D,"images",19,()=>[]),b=0,c,e,u,l=null,A=null,L=null,W,H,F,C,V,$,I=[1,1],G=[1,1],O=[1,1],j=!1,o=!1,m=0,g=-1,r;const h=5e3,x=1e3;function k(){if(e=c.getContext("webgl"),!e)return!1;const t=(d,z)=>{const M=e.createShader(d);return e.shaderSource(M,z),e.compileShader(M),e.getShaderParameter(M,e.COMPILE_STATUS)||console.error(e.getShaderInfoLog(M)),M};u=e.createProgram(),e.attachShader(u,t(e.VERTEX_SHADER,re)),e.attachShader(u,t(e.FRAGMENT_SHADER,ie)),e.linkProgram(u),e.useProgram(u);const i=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,i),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),e.STATIC_DRAW);const f=e.getAttribLocation(u,"a_pos");return e.enableVertexAttribArray(f),e.vertexAttribPointer(f,2,e.FLOAT,!1,0,0),W=e.getUniformLocation(u,"u_t"),H=e.getUniformLocation(u,"u_sizeA"),F=e.getUniformLocation(u,"u_sizeB"),C=e.getUniformLocation(u,"u_res"),V=e.getUniformLocation(u,"u_dpr"),$=e.getUniformLocation(u,"u_noiseSize"),e.uniform1i(e.getUniformLocation(u,"u_texA"),0),e.uniform1i(e.getUniformLocation(u,"u_texB"),1),e.uniform1i(e.getUniformLocation(u,"u_noise"),2),!0}function _(t,i=!1){e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!i);const f=e.createTexture();e.bindTexture(e.TEXTURE_2D,f);const d=i?e.REPEAT:e.CLAMP_TO_EDGE;return e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,d),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,d),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,t),f}function p(t){return new Promise((i,f)=>{const d=new Image;d.onload=()=>i(d),d.onerror=f,d.src=t})}function U(t){if(r=requestAnimationFrame(U),!l||!L||!e)return;const i=c?.clientWidth*devicePixelRatio|0,f=c?.clientHeight*devicePixelRatio|0;(c.width!==i||c.height!==f)&&(c.width=i,c.height=f,e.viewport(0,0,i,f));let d=1,z=j&&A!==null;z&&(d=(t-m)/h,d>=1&&(j=!1,z=!1,e.deleteTexture(l),l=A,A=null,I=[...G],b=g,d=1,setTimeout(()=>E((b+1)%v().length),x))),e.uniform2f(C,c.width,c.height),e.uniform1f(V,devicePixelRatio),e.uniform2fv($,O),e.uniform1f(W,z?d:1),e.uniform2fv(H,I),e.uniform2fv(F,z?G:I),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,l),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,z?A:l),e.activeTexture(e.TEXTURE2),e.bindTexture(e.TEXTURE_2D,L),e.drawArrays(e.TRIANGLE_STRIP,0,4)}async function E(t){if(!(o||j)){o=!0,g=t;try{const i=await p(v()[t]);if(!e)return;A&&e.deleteTexture(A),A=_(i),G=[i.naturalWidth,i.naturalHeight],j=!0,m=performance.now()}catch{setTimeout(()=>E((t+1)%v().length),x)}finally{o=!1}}}te(async()=>{if(!v().length||!k())return;b=Math.floor(Math.random()*v().length);const[t,i]=await Promise.all([p("/pattern.png"),p(v()[b])]);return L=_(t,!0),O=[t.naturalWidth,t.naturalHeight],l=_(i),I=[i.naturalWidth,i.naturalHeight],r=requestAnimationFrame(U),E((b+1)%v().length),()=>cancelAnimationFrame(r)});var S=ne();ee(S,t=>c=t,()=>c),y(B,S),K()}var se=T('<div class="sticky min-h-[60vh] top-0 w-screen h-screen overflow-hidden"><!></div>'),le=T('<div class="text-xs text-gray-600 mt-2"> </div>'),ce=T('<a class="flex-shrink-0 block hover:text-black" data-sveltekit-reload=""><div class=" border-gray-300 border w-[350px] h-[350px] overflow-hidden"><img class="w-full h-full object-fit scale-[1.35]" loading="lazy"/></div> <div class="mt-4 pb-2 w-[350px]"><div class="text-base leading-snug"> </div> <!></div></a>'),me=T('<div class="flex gap-3 pb-2 overflow-x-auto selection:overflow-visible selection:flex-wrap selection:justify-center"></div>'),de=T('<div class="text-xs text-gray-600 mt-2"> </div>'),ue=T('<a class="flex-shrink-0 block hover:text-black" data-sveltekit-reload=""><div class=" border-gray-300 border w-[350px] h-[350px] overflow-hidden"><img class="w-full h-full object-fit scale-[1.1]" loading="lazy"/></div> <div class="mt-4 pb-2 w-[350px]"><div class="text-base leading-snug"> </div> <!></div></a>'),ve=T('<div class="flex gap-3 pb-2 overflow-x-auto selection:overflow-visible selection:flex-wrap selection:justify-center"></div>'),fe=T('<div class="text-xs text-gray-600 mt-2"> </div>'),ge=T('<a class="flex-shrink-0 block hover:text-black" data-sveltekit-reload=""><div class=" border-gray-300 border w-[350px] h-[350px] overflow-hidden"><img class="w-full h-full object-fit" loading="lazy"/></div> <div class="mt-4 pb-2 w-[350px]"><div class="text-base leading-snug"> </div> <!></div></a>'),he=T('<div class="flex gap-3 pb-2 overflow-x-auto selection:overflow-visible selection:flex-wrap selection:justify-center"></div>'),pe=T(`<section class="bg-white text-gray-600 min-h-screen"><!> <div class="relative z-10 grid grid-cols-1 md:grid-cols-3 -mt-[30vh]"><div class="hidden md:block md:col-span-2"></div> <article class="bg-[#dedede] text-black px-4 pt-4 pb-20 text-base leading-relaxed"><h1 class="text-5xl mb-4 max-w-[300px] text-black">Infrastructures of Extremism</h1> <p class="mb-3">Right-wing extremist organisations have gained visibility on European
        streets. During orchestrated demonstrations, in particular youth groups
        show banners that advertise Telegram channels as offline-to-online
        gateways into far right communities. This investigation takes these
        banners as its starting point to surface how they lead into a network of
        interconnected online communities as <em>Infrastructures of Extremism.</em></p> <p class="mb-3">At a rally held in Berlin on 29 November 2025 against so-called <em>"criminal foreigners"</em>, participants promoted Telegram channels
        used for youth recruitment and for coordinating activities at the local
        level. Such events reveal how street-level mobilisation is tightly
        interwoven with a broader digital ecosystem that fuels the expansion of
        far right extremism.</p> <figure class="flex flex-col items-start mt-6 mb-10 gap-2"><img src="/intro/berlin-demo.png" alt="Banner promoting a right-wing Telegram channel at a Berlin rally" class=" border-gray-300 border w-[150px] block grayscale hover:grayscale-0"/> <figcaption class="text-sm max-w-60 text-gray-600">A banner that promotes a link to a Telegram far-right youth group.</figcaption></figure> <p class="mb-3">These Telegram channels collectively form a digital infrastructure that
        sustains ultra-nationalist ideologies, enabling the circulation of
        fascist worldviews among younger supporters. Across Germany, numerous
        members of these networks maintain ties to far-right parties such as <em>Die Heimat</em> and <em>Alternative für Deutschland (AFD)</em>, whose presence in
        parliamentary politics gives symbolic legitimacy within these online
        spaces.</p> <p class="mb-3">The former youth organisation of AFD, <em>Junge Alternative</em>, was
        banned after being classified as right-wing extremist and subsequently
        ousted from the public sphere. Yet, recently a successor movement called <em>Generation Deutschland</em> emerged, taking on the role of mobilising younger supporters through the
        same networks. While the organisation was newly formed, some local groups
        that once operated under the banner of <em>Junge Alternative</em> have simply renamed their Telegram channels to <em>Generation Deutschland</em> and continued their activities business as
        usual. Hence, it occurs that the platform provided these groups with the
        means to absorb the ban rather than enforcing its implementation.</p> <figure class="flex flex-col items-end mt-6 mb-10 gap-2"><img src="/intro/gd.png" alt="Telegram profile of Generation Deutschland" class="w-[220px] block grayscale hover:grayscale-0"/> <figcaption class="text-sm max-w-80 text-gray-600 text-right">The Telegram profile <em>@JungeAlternativeLSA</em> has been renamed <em>Generation Deutschland LSA</em>, although the handle remains the
          former.</figcaption></figure> <p class="mb-3">These organisations operate within a strategically interconnected
        system. Groups like <em>Generation Deutschland</em>, which present
        themselves with a more moderate façade, regularly redirect their
        subscribers toward more radical channels. These, in turn, refer onward
        to others, forming a continuous chain of racist and ultra-nationalist
        messages. Their networks extend far beyond Germany, reaching similar
        nationalist scenes in countries such as Italy, France, Austria, the
        Netherlands and Ukraine, and beyond.</p> <p class="mb-3">Telegram plays a central role in maintaining this ecosystem. Its
        platform design creates not simply a place for supporters of specific
        groups to gather, but a tool to enable a constant stream of
        communication. Forwarded posts act as ideological pathways, allowing
        audiences to be funneled from one channel to another, enabling
        persistent networks, even in the face of bans or restrictions.</p> <figure class="flex flex-col items-start mt-6 mb-10 gap-2"><img src="/intro/roma.jpg" alt="Rome, Italy, 7 January 2025" class="w-full block grayscale hover:grayscale-0"/> <figcaption class="text-sm max-w-80 text-gray-600">Rome, Italy, 7 January 2025. Hundreds of <em>CasaPound</em> supporters
          and other far-right militants performed the fascist salute during a commemoration.</figcaption></figure> <p class="mb-3">This investigation takes as its input the banner documented at the
        Berlin protest and follows its network as it becomes visible on
        Telegram. Messages, mentions, reactions and forwarded posts are
        collected through automated data scraping and translated into a series
        of navigable maps, which allows the exploration of these entangled
        groups and thematic clusters.</p> <p class="mb-3">This approach reveals how individual groups expand and contract, which
        channels serve as key hubs, and how various national factions are
        connected across borders. Although these maps cannot capture the entire
        movement –due to private groups, deleted links, or blocked content– they
        expose part of the infrastructure that allows today's far-right
        ideologies to circulate uncensored. Extremists take advantage of the
        lack of moderation on Telegram to spread their views with minimal
        restriction, while making their content and relational structures
        available for monitoring.</p> <p>Finally, the investigation extends to a wider selection of Telegram
        groups from different national contexts, compiled on the basis of
        activity and connectivity. Particular attention is given to the most
        shared content among groups, showing how far-right narratives move and
        adapt across borders.</p></article></div> <div class="custom-shadow sticky min-h-[60vh] top-0 flex justify-center relative z-10 w-full h-full px-5 bg-[#dedede] text-black svelte-1uha8ag"><section id="datasets" class="max-w-8xl pb-10 overflow-auto mx-auto"><h2 class="text-2xl m-0 w-[340px] pt-4 text-black">Several Telegram groups have been examined</h2> <h2 class="text-2xl pt-20 m-0 text-black">Time</h2> <p class="text-sm max-w-80 text-gray-600 pb-8">Each timeline shows the entirety of the collected messages over time.</p> <!></section></div> <div class="custom-shadow pt-20 sticky min-h-[60vh] top-0 flex justify-left relative z-10 w-full h-full px-5 pt-4 bg-[#dedede] text-black svelte-1uha8ag"><section id="datasets" class="max-w-8xl overflow-auto pb-10"><h2 class="text-2xl p-0 m-0 text-black">Topics</h2> <p class="text-sm max-w-80 text-gray-600 pb-8">Each chart shows the overall share of scraped messages by dominant
        topic.</p> <!></section></div> <div class="custom-shadow pt-20 sticky min-h-[60vh] top-0 flex relative z-10 w-full h-full px-5 pt-4 bg-[#dedede] text-black svelte-1uha8ag"><section id="datasets" class="max-w-8xl overflow-auto pb-10"><h2 class="text-2xl p-0 m-0 text-black">Network</h2> <p class="text-sm max-w-80 text-gray-600 pb-8">The network reproduces the collection logic, linking channels through
        mentions and forwards.</p> <!></section></div> <div class="custom-shadow pt-5 sticky min-h-[20vh] top-0 relative z-10 w-full h-full px-5 pt-4 bg-[#dedede] text-black svelte-1uha8ag"><div class="relative z-10 w-full px-5 pb-10 bg-[#dedede] text-black"></div> <section class="max-w-5xl text-xs text-gray-600 space-y-2 text-left"><p>Infrastructures of Extremism is a project by <a class="underline" href="https://giacomo.website/" target="_blank" rel="noopener noreferrer">Giacomo Nanni</a> in collaboration with metaLAB (at) Harvard & Berlin. <br/></p></section></div></section>`);function Ee(B,D){q(D,!0);const v=J(()=>(D.data?.datasets??[]).slice().sort((o,m)=>(m?.postCount??0)-(o?.postCount??0))),b=J(()=>a(v).flatMap(o=>[`/cover/${o.slug}.png`])),c=new Intl.DateTimeFormat("en-US",{year:"numeric",month:"short",day:"numeric"});var e=pe(),u=s(e);{var l=o=>{var m=se(),g=s(m);oe(g,{get images(){return a(b)}}),n(m),y(o,m)};P(u,o=>{a(b).length&&o(l)})}var A=w(u,4),L=s(A),W=w(s(L),6);{var H=o=>{var m=me();Y(m,21,()=>a(v),g=>g.slug,(g,r)=>{var h=ce(),x=s(h),k=s(x);n(x);var _=w(x,2),p=s(_),U=s(p,!0);n(p);var E=w(p,2);{var S=t=>{var i=le(),f=s(i);n(i),X(d=>N(f,`Updated ${d??""}`),[()=>c.format(new Date(a(r).endDate))]),y(t,i)};P(E,t=>{a(r).endDate&&t(S)})}n(_),n(h),X(t=>{R(h,"href",t),R(k,"src",`/cover/${a(r).slug}.png`),R(k,"alt",a(r).label||a(r).slug),N(U,a(r).label||a(r).slug)},[()=>`/${encodeURIComponent(a(r).slug)}`]),y(g,h)}),n(m),y(o,m)};P(W,o=>{a(v).length&&o(H)})}n(L),n(A);var F=w(A,2),C=s(F),V=w(s(C),4);{var $=o=>{var m=ve();Y(m,21,()=>a(v),g=>g.slug,(g,r)=>{var h=ue(),x=s(h),k=s(x);n(x);var _=w(x,2),p=s(_),U=s(p,!0);n(p);var E=w(p,2);{var S=t=>{var i=de(),f=s(i);n(i),X(d=>N(f,`Updated ${d??""}`),[()=>c.format(new Date(a(r).endDate))]),y(t,i)};P(E,t=>{a(r).endDate&&t(S)})}n(_),n(h),X(t=>{R(h,"href",t),R(k,"src",`/cover/${a(r).slug}_pie.png`),R(k,"alt",a(r).label||a(r).slug),N(U,a(r).label||a(r).slug)},[()=>`/${encodeURIComponent(a(r).slug)}/pie`]),y(g,h)}),n(m),y(o,m)};P(V,o=>{a(v).length&&o($)})}n(C),n(F);var I=w(F,2),G=s(I),O=w(s(G),4);{var j=o=>{var m=he();Y(m,21,()=>a(v),g=>g.slug,(g,r)=>{var h=ge(),x=s(h),k=s(x);n(x);var _=w(x,2),p=s(_),U=s(p,!0);n(p);var E=w(p,2);{var S=t=>{var i=fe(),f=s(i);n(i),X(d=>N(f,`Updated ${d??""}`),[()=>c.format(new Date(a(r).endDate))]),y(t,i)};P(E,t=>{a(r).endDate&&t(S)})}n(_),n(h),X(t=>{R(h,"href",t),R(k,"src",`/cover/${a(r).slug}_tree.png`),R(k,"alt",a(r).label||a(r).slug),N(U,a(r).label||a(r).slug)},[()=>`/${encodeURIComponent(a(r).slug)}/tree`]),y(g,h)}),n(m),y(o,m)};P(O,o=>{a(v).length&&o(j)})}n(G),n(I),Z(2),n(e),y(B,e),K()}export{Ee as component,ke as universal};
