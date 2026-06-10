<script>
  import { onMount } from "svelte";
  import VERT from "$lib/shaders/cover.vert?raw";
  import FRAG from "$lib/shaders/cover.frag?raw";

  let { images = [] } = $props();

  let currentIndex = 0;
  let canvas;

  let gl, prog;
  let texCurrent = null,
    texNext = null,
    texNoise = null;
  let u_t, u_sizeA, u_sizeB, u_res, u_dpr, u_noiseSize;
  let sizeA = [1, 1],
    sizeB = [1, 1];
  let noiseSize = [1, 1];

  let isTransitioning = false;
  let loading = false;
  let transitionStart = 0;
  let pendingNextIndex = -1;
  let rafId;

  const TRANSITION_MS = 5000;
  const WAIT_MS = 1000;

  function initGL() {
    gl = canvas.getContext("webgl");
    if (!gl) return false;

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        console.error(gl.getShaderInfoLog(s));
      return s;
    };

    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const posLoc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    u_t = gl.getUniformLocation(prog, "u_t");
    u_sizeA = gl.getUniformLocation(prog, "u_sizeA");
    u_sizeB = gl.getUniformLocation(prog, "u_sizeB");
    u_res = gl.getUniformLocation(prog, "u_res");
    u_dpr = gl.getUniformLocation(prog, "u_dpr");
    u_noiseSize = gl.getUniformLocation(prog, "u_noiseSize");
    gl.uniform1i(gl.getUniformLocation(prog, "u_texA"), 0);
    gl.uniform1i(gl.getUniformLocation(prog, "u_texB"), 1);
    gl.uniform1i(gl.getUniformLocation(prog, "u_noise"), 2);
    return true;
  }

  function makeTexture(img, repeat = false) {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, !repeat);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    return tex;
  }

  function loadImg(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function draw(now) {
    rafId = requestAnimationFrame(draw);
    if (!texCurrent || !texNoise || !gl) return;

    const w = (canvas.clientWidth * devicePixelRatio) | 0;
    const h = (canvas.clientHeight * devicePixelRatio) | 0;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }

    let t = 1.0;
    let animating = isTransitioning && texNext !== null;

    if (animating) {
      t = (now - transitionStart) / TRANSITION_MS;
      if (t >= 1.0) {
        isTransitioning = false;
        animating = false;
        gl.deleteTexture(texCurrent);
        texCurrent = texNext;
        texNext = null;
        sizeA = [...sizeB];
        currentIndex = pendingNextIndex;
        t = 1.0;
        setTimeout(
          () => startTransition((currentIndex + 1) % images.length),
          WAIT_MS,
        );
      }
    }

    gl.uniform2f(u_res, canvas.width, canvas.height);
    gl.uniform1f(u_dpr, devicePixelRatio);
    gl.uniform2fv(u_noiseSize, noiseSize);
    gl.uniform1f(u_t, animating ? t : 1.0);
    gl.uniform2fv(u_sizeA, sizeA);
    gl.uniform2fv(u_sizeB, animating ? sizeB : sizeA);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texCurrent);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, animating ? texNext : texCurrent);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, texNoise);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  async function startTransition(nextIdx) {
    if (loading || isTransitioning) return;
    loading = true;
    pendingNextIndex = nextIdx;
    try {
      const img = await loadImg(images[nextIdx]);
      if (!gl) return;
      if (texNext) gl.deleteTexture(texNext);
      texNext = makeTexture(img);
      sizeB = [img.naturalWidth, img.naturalHeight];
      isTransitioning = true;
      transitionStart = performance.now();
    } catch {
      setTimeout(() => startTransition((nextIdx + 1) % images.length), WAIT_MS);
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    if (!images.length || !initGL()) return;

    currentIndex = Math.floor(Math.random() * images.length);

    const [noiseImg, firstImg] = await Promise.all([
      loadImg("/pattern.png"),
      loadImg(images[currentIndex]),
    ]);

    texNoise = makeTexture(noiseImg, true);
    noiseSize = [noiseImg.naturalWidth, noiseImg.naturalHeight];
    texCurrent = makeTexture(firstImg);
    sizeA = [firstImg.naturalWidth, firstImg.naturalHeight];

    rafId = requestAnimationFrame(draw);

    startTransition((currentIndex + 1) % images.length);

    return () => cancelAnimationFrame(rafId);
  });
</script>

<canvas bind:this={canvas} class="block w-full h-full"></canvas>
