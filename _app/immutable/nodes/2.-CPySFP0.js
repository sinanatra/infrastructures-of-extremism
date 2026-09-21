import{f as S,a as U}from"../chunks/DdPZTTEu.js";import{W as $,Y as q,Z as k,i as m,au as V,_ as v,at as M,a0 as K,$ as Z,X as O}from"../chunks/C8ib__8j.js";import{s as Y}from"../chunks/BgYwbzME.js";import{e as J}from"../chunks/DJ2x-88Q.js";import{p as Q,b as ee,i as j}from"../chunks/ZeJlZOjy.js";import{s as te}from"../chunks/m2wJRAEl.js";import{o as ae}from"../chunks/ChNsLLqb.js";const re=async({fetch:T})=>{const[g,s]=await Promise.all([T("/data/datasets.json"),T("/data/dataset-themes.json")]);let c=[];if(g.ok)try{c=await g.json()}catch(t){console.warn("Failed to parse datasets.json",t)}Array.isArray(c)||(c=[]);let n=[];if(s.ok)try{n=await s.json()}catch(t){console.warn("Failed to parse dataset-themes.json",t)}Array.isArray(n)||(n=[]);const e=new Map(n.filter(t=>t?.slug&&t.theme).map(t=>[t.slug,t.theme]));return{datasets:c.map(t=>({...t,theme:e.get(t?.slug)??t?.theme}))}},be=Object.freeze(Object.defineProperty({__proto__:null,load:re},Symbol.toStringTag,{value:"Module"})),ne=`attribute vec2 a_pos;
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
  scale *= 0.7;
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
`;var oe=S('<canvas class="block w-full h-full"></canvas>');function se(T,g){$(g,!0);let s=Q(g,"images",19,()=>[]),c=0,n,e,r,t=null,f=null,w=null,L,z,a,h,A,E,p=[1,1],x=[1,1],F=[1,1],_=!1,b=!1,D=0,G=-1,R;const X=5e3,N=1e3;function I(){if(e=n.getContext("webgl"),!e)return!1;const i=(l,y)=>{const B=e.createShader(l);return e.shaderSource(B,y),e.compileShader(B),e.getShaderParameter(B,e.COMPILE_STATUS)||console.error(e.getShaderInfoLog(B)),B};r=e.createProgram(),e.attachShader(r,i(e.VERTEX_SHADER,ne)),e.attachShader(r,i(e.FRAGMENT_SHADER,ie)),e.linkProgram(r),e.useProgram(r);const o=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,o),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),e.STATIC_DRAW);const u=e.getAttribLocation(r,"a_pos");return e.enableVertexAttribArray(u),e.vertexAttribPointer(u,2,e.FLOAT,!1,0,0),L=e.getUniformLocation(r,"u_t"),z=e.getUniformLocation(r,"u_sizeA"),a=e.getUniformLocation(r,"u_sizeB"),h=e.getUniformLocation(r,"u_res"),A=e.getUniformLocation(r,"u_dpr"),E=e.getUniformLocation(r,"u_noiseSize"),e.uniform1i(e.getUniformLocation(r,"u_texA"),0),e.uniform1i(e.getUniformLocation(r,"u_texB"),1),e.uniform1i(e.getUniformLocation(r,"u_noise"),2),!0}function P(i,o=!1){e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!o);const u=e.createTexture();e.bindTexture(e.TEXTURE_2D,u);const l=o?e.REPEAT:e.CLAMP_TO_EDGE;return e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,l),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,l),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,i),u}function d(i){return new Promise((o,u)=>{const l=new Image;l.onload=()=>o(l),l.onerror=u,l.src=i})}function C(i){if(R=requestAnimationFrame(C),!t||!w||!e)return;const o=n?.clientWidth*devicePixelRatio|0,u=n?.clientHeight*devicePixelRatio|0;(n.width!==o||n.height!==u)&&(n.width=o,n.height=u,e.viewport(0,0,o,u));let l=1,y=_&&f!==null;y&&(l=(i-D)/X,l>=1&&(_=!1,y=!1,e.deleteTexture(t),t=f,f=null,p=[...x],c=G,l=1,setTimeout(()=>W((c+1)%s().length),N))),e.uniform2f(h,n.width,n.height),e.uniform1f(A,devicePixelRatio),e.uniform2fv(E,F),e.uniform1f(L,y?l:1),e.uniform2fv(z,p),e.uniform2fv(a,y?x:p),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,t),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,y?f:t),e.activeTexture(e.TEXTURE2),e.bindTexture(e.TEXTURE_2D,w),e.drawArrays(e.TRIANGLE_STRIP,0,4)}async function W(i){if(!(b||_)){b=!0,G=i;try{const o=await d(s()[i]);if(!e)return;f&&e.deleteTexture(f),f=P(o),x=[o.naturalWidth,o.naturalHeight],_=!0,D=performance.now()}catch{setTimeout(()=>W((i+1)%s().length),N)}finally{b=!1}}}ae(async()=>{if(!s().length||!I())return;c=Math.floor(Math.random()*s().length);const[i,o]=await Promise.all([d("/pattern.png"),d(s()[c])]);return w=P(i,!0),F=[i.naturalWidth,i.naturalHeight],t=P(o),p=[o.naturalWidth,o.naturalHeight],R=requestAnimationFrame(C),W((c+1)%s().length),()=>cancelAnimationFrame(R)});var H=oe();ee(H,i=>n=i,()=>n),U(T,H),q()}var le=S("<span>/</span>"),ce=S('<!> <a class="hover:underline" data-sveltekit-reload=""> </a>',1),me=S('<div class="border-b border-gray-300 py-4 text-black"><div> </div> <div class="flex gap-2 mt-1.5 text-xs tracking-wide"></div></div>'),ue=S('<div class="mb-12 text-base tabular-nums"></div>'),fe=S(`<section class="bg-white text-gray-600 flex flex-col md:h-screen md:flex-row md:overflow-hidden"><div class="w-full h-[45vh] md:h-full md:flex-1 overflow-hidden"><!></div> <article class="w-full md:h-full md:w-[360px] md:flex-shrink-0 md:overflow-y-auto bg-[#fefefe] text-black px-4 pt-4 pb-20 text-base leading-relaxed"><h1 class="text-xl mb-4 max-w-[300px] text-black">Infrastructures of Extremism</h1> <p class="mb-3">Right-wing extremist organisations have gained visibility on European
      streets. During orchestrated demonstrations, in particular youth groups
      show banners that advertise Telegram channels as offline-to-online
      gateways into far right communities. This investigation takes these
      banners as its starting point to surface how they lead into a network of
      interconnected online communities as <em>Infrastructures of Extremism.</em></p> <p class="mb-3">At a rally held in Berlin on 29 November 2025 against so-called <em>"criminal foreigners"</em>, participants promoted Telegram channels
      used for youth recruitment and for coordinating activities at the local
      level. Such events reveal how street-level mobilisation is tightly
      interwoven with a broader digital ecosystem that fuels the expansion of
      far right extremism.</p> <figure class="flex flex-col items-start mt-6 mb-10 gap-2"><img src="/intro/berlin-demo.png" alt="Banner promoting a right-wing Telegram channel at a Berlin rally" class=" border-gray-300 border w-[150px] block grayscale hover:grayscale-0"/> <figcaption class="text-xs max-w-60 text-gray-600">A banner that promotes a link to a Telegram far-right youth group.</figcaption></figure> <p class="mb-3">These Telegram channels collectively form a digital infrastructure that
      sustains ultra-nationalist ideologies, enabling the circulation of fascist
      worldviews among younger supporters. Across Germany, numerous members of
      these networks maintain ties to far-right parties such as <em>Die Heimat</em> and <em>Alternative für Deutschland (AFD)</em>, whose presence in
      parliamentary politics gives symbolic legitimacy within these online
      spaces.</p> <p class="mb-3">The former youth organisation of AFD, <em>Junge Alternative</em>, was
      banned after being classified as right-wing extremist and subsequently
      ousted from the public sphere. Yet, recently a successor movement called <em>Generation Deutschland</em> emerged, taking on the role of mobilising younger supporters through the same
      networks. While the organisation was newly formed, some local groups that once
      operated under the banner of <em>Junge Alternative</em> have simply renamed their Telegram channels to <em>Generation Deutschland</em> and continued their activities business as
      usual. Hence, it occurs that the platform provided these groups with the means
      to absorb the ban rather than enforcing its implementation.</p> <figure class="flex flex-col items-end mt-6 mb-10 gap-2"><img src="/intro/gd.png" alt="Telegram profile of Generation Deutschland" class="w-[220px] block grayscale hover:grayscale-0"/> <figcaption class="text-xs max-w-80 text-gray-600 text-right">The Telegram profile <em>@JungeAlternativeLSA</em> has been renamed <em>Generation Deutschland LSA</em>, although the handle remains the
        former.</figcaption></figure> <p class="mb-3">These organisations operate within a strategically interconnected system.
      Groups like <em>Generation Deutschland</em>, which present themselves with
      a more moderate façade, regularly redirect their subscribers toward more
      radical channels. These, in turn, refer onward to others, forming a
      continuous chain of racist and ultra-nationalist messages. Their networks
      extend far beyond Germany, reaching similar nationalist scenes in
      countries such as Italy, France, Austria, the Netherlands and Ukraine, and
      beyond.</p> <p class="mb-3">Telegram plays a central role in maintaining this ecosystem. Its platform
      design creates not simply a place for supporters of specific groups to
      gather, but a tool to enable a constant stream of communication. Forwarded
      posts act as ideological pathways, allowing audiences to be funneled from
      one channel to another, enabling persistent networks, even in the face of
      bans or restrictions.</p> <figure class="flex flex-col items-start mt-6 mb-10 gap-2"><img src="/intro/roma.jpg" alt="Rome, Italy, 7 January 2025" class="w-full block grayscale hover:grayscale-0"/> <figcaption class="text-xs max-w-80 text-gray-600">Rome, Italy, 7 January 2025. Hundreds of <em>CasaPound</em> supporters and
        other far-right militants performed the fascist salute during a commemoration.</figcaption></figure> <p class="mb-3">This investigation takes as its input the banner documented at the Berlin
      protest and follows its network as it becomes visible on Telegram.
      Messages, mentions, reactions and forwarded posts are collected through
      automated data scraping and translated into a series of navigable maps,
      which allows the exploration of these entangled groups and thematic
      clusters.</p> <p class="mb-3">This approach reveals how individual groups expand and contract, which
      channels serve as key hubs, and how various national factions are
      connected across borders. Although these maps cannot capture the entire
      movement –due to private groups, deleted links, or blocked content– they
      expose part of the infrastructure that allows today's far-right ideologies
      to circulate uncensored. Extremists take advantage of the lack of
      moderation on Telegram to spread their views with minimal restriction,
      while making their content and relational structures available for
      monitoring.</p> <p class="mb-3">Finally, the investigation extends to a wider selection of Telegram groups
      from different national contexts, compiled on the basis of activity and
      connectivity. Particular attention is given to the most shared content
      among groups, showing how far-right narratives move and adapt across
      borders.</p> <h2 class="text-base border-t border-gray-300 mt-20 mb-10 pt-2">Several Telegram groups have been examined</h2> <!> <p class="text-xs border-t border-gray-300 mt-20 pt-2">Infrastructures of Extremism is a project by <a class="underline" href="https://giacomo.website/" target="_blank" rel="noopener noreferrer">Giacomo Nanni</a> in collaboration with metaLAB (at) Harvard & Berlin.</p></article></section>`);function ye(T,g){$(g,!0);const s=V(()=>(g.data?.datasets??[]).slice().sort((a,h)=>(h?.postCount??0)-(a?.postCount??0))),c=V(()=>m(s).map(a=>`/cover/${a.slug}.png`).concat(m(s).map(a=>`/cover/${a.slug}_pie.png`))),n=[{key:"graph",label:"Time",href:a=>`/${encodeURIComponent(a)}`},{key:"pie",label:"Topics",href:a=>`/${encodeURIComponent(a)}/pie`},{key:"tree",label:"Network",href:a=>`/${encodeURIComponent(a)}/tree`}];var e=fe(),r=k(e),t=k(r);{var f=a=>{se(a,{get images(){return m(c)}})};j(t,a=>{m(c).length&&a(f)})}v(r);var w=M(r,2),L=M(k(w),28);{var z=a=>{var h=ue();J(h,21,()=>m(s),A=>A.slug,(A,E)=>{var p=me(),x=k(p),F=k(x,!0);v(x);var _=M(x,2);J(_,23,()=>n,b=>b.key,(b,D,G)=>{var R=ce(),X=Z(R);{var N=d=>{var C=le();U(d,C)};j(X,d=>{m(G)>0&&d(N)})}var I=M(X,2),P=k(I,!0);v(I),O(d=>{te(I,"href",d),Y(P,m(D).label)},[()=>m(D).href(m(E).slug)]),U(b,R)}),v(_),v(p),O(()=>Y(F,m(E).label||m(E).slug)),U(A,p)}),v(h),U(a,h)};j(L,a=>{m(s).length&&a(z)})}K(2),v(w),v(e),U(T,e),q()}export{ye as component,be as universal};
