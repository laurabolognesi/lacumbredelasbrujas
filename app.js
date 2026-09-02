(() => {
  'use strict';

  const CONFIG = {
    maxScreenPoints: 500,
    rawCornerCapacity: 12000,
    trainLevels: 4,
    maxPatternSize: 512,
    maxPatternPoints: 300,
    blurSize: 5,
    laplacianThreshold: 30,
    eigenThreshold: 25,
    matchThreshold: 54,
    ratioThreshold: 0.86,
    minMatches: 10,
    minInliers: 9,
    processEveryNFrames: 2,
    smoothing: 0.34,
    lostToleranceFrames: 5,
    minimumTrackedRevealMs: 260
  };

  const EXPERIENCE = {
    title: 'La cumbre de las brujas',
    author: 'Laura Bolognesi',
    youtubeVideoId: 'oMnK9Viihg8',
    autoplayMuted: true
  };

  const app = document.getElementById('app');
  const video = document.getElementById('camera');
  const canvas = document.getElementById('arCanvas');
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  const startCameraButton = document.getElementById('startCamera');
  const startDemoButton = document.getElementById('startDemo');
  const stopButton = document.getElementById('stopButton');
  const hud = document.getElementById('hud');
  const status = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  const instruction = document.getElementById('instruction');
  const soundButton = document.getElementById('soundButton');
  const helperText = document.getElementById('helperText');
  const debugPanel = document.getElementById('debugPanel');
  const debugText = document.getElementById('debugText');
  const arLayer = document.getElementById('arLayer');
  const arPlane = document.getElementById('arPlane');
  const videoStage = document.getElementById('videoStage');
  const videoPlaceholder = document.getElementById('videoPlaceholder');
  const planeState = document.getElementById('planeState');
  const planeMeta = document.getElementById('planeMeta');

  const targetImage = new Image();
  targetImage.decoding = 'async';
  targetImage.src = './assets/target.jpg';

  let frameWidth = 480;
  let frameHeight = 640;
  let frameGray;
  let frameSmooth;
  let screenCorners = [];
  let screenDescriptors;
  let patternCorners = [];
  let patternDescriptors = [];
  let matches = [];
  let homography;
  let matchMask;
  let patternWidth = 0;
  let patternHeight = 0;

  let stream = null;
  let rafId = 0;
  let runningMode = null;
  let trained = false;
  let frameNumber = 0;
  let lostFrames = 0;
  let smoothedCorners = null;
  let lastDetection = null;
  let detectionStartedAt = 0;
  let youtubeMounted = false;
  let youtubeReady = false;
  let youtubeShouldPlay = false;
  let youtubeMuted = EXPERIENCE.autoplayMuted;
  let youtubePlayer = null;
  let layerRect = { left: 0, top: 0, width: 0, height: 0 };

  class Match {
    constructor() {
      this.screen_idx = 0;
      this.pattern_lev = 0;
      this.pattern_idx = 0;
      this.distance = 0;
    }
  }

  function setStatus(text, state = 'ready') {
    statusText.textContent = text;
    status.dataset.state = state;
  }

  function configureCanvas() {
    const portrait = window.innerHeight >= window.innerWidth;
    frameWidth = portrait ? 480 : 640;
    frameHeight = portrait ? 640 : 480;
    canvas.width = frameWidth;
    canvas.height = frameHeight;
    canvas.style.aspectRatio = `${frameWidth} / ${frameHeight}`;
  }

  function allocateDetector() {
    frameGray = new jsfeat.matrix_t(frameWidth, frameHeight, jsfeat.U8_t | jsfeat.C1_t);
    frameSmooth = new jsfeat.matrix_t(frameWidth, frameHeight, jsfeat.U8_t | jsfeat.C1_t);
    screenDescriptors = new jsfeat.matrix_t(32, CONFIG.maxScreenPoints, jsfeat.U8_t | jsfeat.C1_t);
    homography = new jsfeat.matrix_t(3, 3, jsfeat.F32C1_t);
    matchMask = new jsfeat.matrix_t(CONFIG.maxScreenPoints, 1, jsfeat.U8C1_t);

    screenCorners = createKeypoints(CONFIG.rawCornerCapacity);
    matches = Array.from({ length: CONFIG.maxScreenPoints }, () => new Match());
  }

  function createKeypoints(count) {
    const points = new Array(count);
    for (let i = 0; i < count; i += 1) points[i] = new jsfeat.keypoint_t(0, 0, 0, 0, -1);
    return points;
  }

  async function init() {
    setStatus('Preparando detector…', 'idle');

    try {
      await waitForLibrary();
      await targetImage.decode();
      configureCanvas();
      allocateDetector();
      trainPattern(targetImage);
      trained = true;
      startCameraButton.disabled = false;
      startDemoButton.disabled = false;
      setStatus('Detector listo', 'ready');
      planeState.textContent = EXPERIENCE.youtubeVideoId ? 'Video listo' : 'Esperando video';
      planeMeta.textContent = 'Seguimiento activo de portada';

      const params = new URLSearchParams(window.location.search);
      if (params.get('demo') === '1') startDemo();
    } catch (error) {
      console.error(error);
      setStatus('No se pudo iniciar', 'error');
      helperText.textContent = 'No se pudo cargar el detector. Revisá la conexión y recargá la página.';
    }
  }

  function waitForLibrary(timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const started = performance.now();
      const check = () => {
        if (window.jsfeat) return resolve();
        if (performance.now() - started > timeoutMs) return reject(new Error('JSFeat no se cargó.'));
        window.setTimeout(check, 60);
      };
      check();
    });
  }

  function trainPattern(image) {
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = image.naturalWidth;
    sourceCanvas.height = image.naturalHeight;
    const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    sourceCtx.fillStyle = '#ffffff';
    sourceCtx.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    sourceCtx.drawImage(image, 0, 0);

    const sourceData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const sourceGray = new jsfeat.matrix_t(sourceCanvas.width, sourceCanvas.height, jsfeat.U8_t | jsfeat.C1_t);
    jsfeat.imgproc.grayscale(sourceData.data, sourceCanvas.width, sourceCanvas.height, sourceGray);

    const scale0 = Math.min(CONFIG.maxPatternSize / sourceGray.cols, CONFIG.maxPatternSize / sourceGray.rows);
    patternWidth = Math.max(1, Math.round(sourceGray.cols * scale0));
    patternHeight = Math.max(1, Math.round(sourceGray.rows * scale0));

    const level0 = new jsfeat.matrix_t(sourceGray.cols, sourceGray.rows, jsfeat.U8_t | jsfeat.C1_t);
    const levelImage = new jsfeat.matrix_t(sourceGray.cols, sourceGray.rows, jsfeat.U8_t | jsfeat.C1_t);
    jsfeat.imgproc.resample(sourceGray, level0, patternWidth, patternHeight);

    patternCorners = [];
    patternDescriptors = [];

    const scaleStep = Math.sqrt(2);
    let relativeScale = 1;

    for (let level = 0; level < CONFIG.trainLevels; level += 1) {
      const corners = createKeypoints(CONFIG.rawCornerCapacity);
      const descriptors = new jsfeat.matrix_t(32, CONFIG.maxPatternPoints, jsfeat.U8_t | jsfeat.C1_t);
      patternCorners[level] = corners;
      patternDescriptors[level] = descriptors;

      const width = Math.max(64, Math.round(patternWidth * relativeScale));
      const height = Math.max(64, Math.round(patternHeight * relativeScale));

      if (level === 0) {
        jsfeat.imgproc.gaussian_blur(level0, levelImage, CONFIG.blurSize, 0);
      } else {
        jsfeat.imgproc.resample(level0, levelImage, width, height);
        jsfeat.imgproc.gaussian_blur(levelImage, levelImage, CONFIG.blurSize, 0);
      }

      jsfeat.yape06.laplacian_threshold = CONFIG.laplacianThreshold;
      jsfeat.yape06.min_eigen_value_threshold = CONFIG.eigenThreshold;
      const count = detectKeypoints(levelImage, corners, CONFIG.maxPatternPoints);
      jsfeat.orb.describe(levelImage, corners, count, descriptors);

      if (level > 0) {
        const inverseScale = 1 / relativeScale;
        for (let i = 0; i < count; i += 1) {
          corners[i].x *= inverseScale;
          corners[i].y *= inverseScale;
        }
      }

      relativeScale /= scaleStep;
    }
  }

  async function startCamera() {
    if (!trained || runningMode) return;

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus('La cámara necesita HTTPS', 'error');
      helperText.textContent = 'Publicá la carpeta en un sitio HTTPS. La cámara no funciona abriendo index.html directamente.';
      return;
    }

    try {
      setStatus('Solicitando cámara…', 'idle');
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      video.srcObject = stream;
      await video.play();
      beginRunning('camera');
    } catch (error) {
      console.error(error);
      const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
      setStatus(denied ? 'Permiso de cámara bloqueado' : 'No se pudo abrir la cámara', 'error');
      helperText.textContent = denied
        ? 'Habilitá el permiso de cámara para este sitio desde el navegador.'
        : 'Probá cerrando otras aplicaciones que estén usando la cámara.';
    }
  }

  function startDemo() {
    if (!trained || runningMode) return;
    beginRunning('demo');
  }

  function beginRunning(mode) {
    runningMode = mode;
    frameNumber = 0;
    lostFrames = 0;
    smoothedCorners = null;
    lastDetection = null;
    detectionStartedAt = 0;
    app.classList.add('is-running');
    app.classList.remove('has-target', 'has-sound');
    soundButton.setAttribute('aria-pressed', 'false');
    hud.hidden = false;
    debugPanel.hidden = true;
    syncLayerBounds();
    hideTrackedPlane();
    instruction.textContent = mode === 'camera'
      ? 'Buscá la portada completa dentro del encuadre'
      : 'Modo de demostración: reconocimiento sobre una escena simulada';
    setStatus('Buscando portada…', 'searching');
    mountYouTubePlayer();
    rafId = requestAnimationFrame(tick);
  }

  function stopRunning() {
    cancelAnimationFrame(rafId);
    rafId = 0;
    runningMode = null;
    app.classList.remove('is-running', 'has-target', 'has-sound');
    hud.hidden = true;
    lastDetection = null;
    smoothedCorners = null;
    detectionStartedAt = 0;
    setYouTubePlayback(false);
    hideTrackedPlane(true);

    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
      video.srcObject = null;
    }

    ctx.clearRect(0, 0, frameWidth, frameHeight);
    setStatus('Detector listo', 'ready');
  }

  function tick(now) {
    if (!runningMode) return;
    rafId = requestAnimationFrame(tick);

    const sourceReady = runningMode === 'demo' || video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    if (!sourceReady) return;

    if (runningMode === 'camera') drawCameraFrame();
    else drawDemoFrame(now);

    frameNumber += 1;
    if (frameNumber % CONFIG.processEveryNFrames === 0) detectCurrentFrame();

    if (lastDetection && lostFrames <= CONFIG.lostToleranceFrames) {
      drawAugmentedOverlay(lastDetection.corners, lastDetection.inliers, now);
      updateTrackedPlane(lastDetection.corners, now, lastDetection.inliers);
    }
  }

  function drawCameraFrame() {
    const sourceWidth = video.videoWidth || frameWidth;
    const sourceHeight = video.videoHeight || frameHeight;
    const sourceAspect = sourceWidth / sourceHeight;
    const targetAspect = frameWidth / frameHeight;

    let sx = 0;
    let sy = 0;
    let sw = sourceWidth;
    let sh = sourceHeight;

    if (sourceAspect > targetAspect) {
      sw = sourceHeight * targetAspect;
      sx = (sourceWidth - sw) / 2;
    } else {
      sh = sourceWidth / targetAspect;
      sy = (sourceHeight - sh) / 2;
    }

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, frameWidth, frameHeight);
  }

  function drawDemoFrame(now) {
    const t = now / 1000;
    const gradient = ctx.createLinearGradient(0, 0, frameWidth, frameHeight);
    gradient.addColorStop(0, '#24191e');
    gradient.addColorStop(1, '#8d7a73');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, frameWidth, frameHeight);

    ctx.save();
    ctx.globalAlpha = 0.10;
    for (let y = 24; y < frameHeight; y += 32) {
      ctx.fillStyle = y % 64 === 0 ? '#f7e8dd' : '#6a5c59';
      ctx.fillRect(0, y, frameWidth, 1);
    }
    ctx.restore();

    const height = Math.min(frameWidth, frameHeight) * (0.72 + Math.sin(t * 0.7) * 0.025);
    const aspect = targetImage.naturalWidth / targetImage.naturalHeight;
    const width = height * aspect;
    const x = frameWidth / 2 + Math.sin(t * 0.46) * frameWidth * 0.06;
    const y = frameHeight / 2 + Math.cos(t * 0.38) * frameHeight * 0.03;
    const angle = Math.sin(t * 0.42) * 0.07;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.shadowColor = 'rgba(0,0,0,.38)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = '#efe7de';
    ctx.fillRect(-width / 2 - 8, -height / 2 - 8, width + 16, height + 16);
    ctx.shadowColor = 'transparent';
    ctx.drawImage(targetImage, -width / 2, -height / 2, width, height);
    ctx.restore();
  }

  function detectCurrentFrame() {
    try {
      const imageData = ctx.getImageData(0, 0, frameWidth, frameHeight);
      jsfeat.imgproc.grayscale(imageData.data, frameWidth, frameHeight, frameGray);
      jsfeat.imgproc.gaussian_blur(frameGray, frameSmooth, CONFIG.blurSize, 0);

      jsfeat.yape06.laplacian_threshold = CONFIG.laplacianThreshold;
      jsfeat.yape06.min_eigen_value_threshold = CONFIG.eigenThreshold;

      const cornerCount = detectKeypoints(frameSmooth, screenCorners, CONFIG.maxScreenPoints);
      jsfeat.orb.describe(frameSmooth, screenCorners, cornerCount, screenDescriptors);

      const matchCount = matchPattern();
      let inliers = 0;
      let corners = null;

      if (matchCount >= CONFIG.minMatches) {
        inliers = findTransform(matchCount);
        if (inliers >= CONFIG.minInliers) {
          const projected = projectCorners(homography.data, patternWidth, patternHeight);
          if (isValidQuadrilateral(projected)) corners = smoothQuadrilateral(projected);
        }
      }

      debugText.textContent = `${cornerCount} puntos · ${matchCount} coincidencias · ${inliers} válidas`;

      if (corners) {
        lostFrames = 0;
        lastDetection = { corners, inliers };
        if (!detectionStartedAt) detectionStartedAt = performance.now();
        app.classList.add('has-target');
        setStatus('Portada detectada', 'detected');
        instruction.textContent = 'La portada fue reconocida';
      } else {
        lostFrames += 1;
        if (lostFrames > CONFIG.lostToleranceFrames) {
          lastDetection = null;
          detectionStartedAt = 0;
          app.classList.remove('has-target');
          setStatus('Buscando portada…', 'searching');
          instruction.textContent = runningMode === 'camera'
            ? 'Buscá la portada completa dentro del encuadre'
            : 'Modo de demostración: reconocimiento sobre una escena simulada';
          setYouTubePlayback(false);
          hideTrackedPlane();
        }
      }
    } catch (error) {
      console.error('Error de detección:', error);
      setStatus('Error en el detector', 'error');
      stopRunning();
    }
  }

  function detectKeypoints(image, corners, maxAllowed) {
    let count = jsfeat.yape06.detect(image, corners, 17);
    if (count > maxAllowed) {
      jsfeat.math.qsort(corners, 0, count - 1, (a, b) => b.score < a.score);
      count = maxAllowed;
    }

    for (let i = 0; i < count; i += 1) corners[i].angle = intensityCentroidAngle(image, corners[i].x, corners[i].y);
    return count;
  }

  const U_MAX = new Int32Array([15, 15, 15, 15, 14, 14, 14, 13, 13, 12, 11, 10, 9, 8, 6, 3, 0]);

  function intensityCentroidAngle(image, px, py) {
    const half = 15;
    let m01 = 0;
    let m10 = 0;
    const source = image.data;
    const step = image.cols;
    const center = (py * step + px) | 0;

    for (let u = -half; u <= half; u += 1) m10 += u * source[center + u];

    for (let v = 1; v <= half; v += 1) {
      let verticalSum = 0;
      const limit = U_MAX[v];
      for (let u = -limit; u <= limit; u += 1) {
        const plus = source[center + u + v * step];
        const minus = source[center + u - v * step];
        verticalSum += plus - minus;
        m10 += u * (plus + minus);
      }
      m01 += v * verticalSum;
    }

    return Math.atan2(m01, m10);
  }

  function popcount32(value) {
    let n = value;
    n -= (n >> 1) & 0x55555555;
    n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
    return (((n + (n >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
  }

  function matchPattern() {
    const queryCount = screenDescriptors.rows;
    const query32 = screenDescriptors.buffer.i32;
    let queryOffset = 0;
    let matchCount = 0;

    for (let queryIndex = 0; queryIndex < queryCount; queryIndex += 1) {
      let bestDistance = 256;
      let secondDistance = 256;
      let bestIndex = -1;
      let bestLevel = -1;

      for (let level = 0; level < CONFIG.trainLevels; level += 1) {
        const levelDescriptors = patternDescriptors[level];
        const levelCount = levelDescriptors.rows;
        const level32 = levelDescriptors.buffer.i32;
        let levelOffset = 0;

        for (let patternIndex = 0; patternIndex < levelCount; patternIndex += 1) {
          let distance = 0;
          for (let k = 0; k < 8; k += 1) distance += popcount32(query32[queryOffset + k] ^ level32[levelOffset + k]);

          if (distance < bestDistance) {
            secondDistance = bestDistance;
            bestDistance = distance;
            bestLevel = level;
            bestIndex = patternIndex;
          } else if (distance < secondDistance) {
            secondDistance = distance;
          }
          levelOffset += 8;
        }
      }

      const passesAbsolute = bestDistance < CONFIG.matchThreshold;
      const passesRatio = bestDistance < CONFIG.ratioThreshold * secondDistance;
      if (passesAbsolute && passesRatio && bestIndex >= 0 && matchCount < matches.length) {
        const match = matches[matchCount];
        match.screen_idx = queryIndex;
        match.pattern_lev = bestLevel;
        match.pattern_idx = bestIndex;
        match.distance = bestDistance;
        matchCount += 1;
      }
      queryOffset += 8;
    }

    return matchCount;
  }

  function findTransform(count) {
    const kernel = new jsfeat.motion_model.homography2d();
    const params = new jsfeat.ransac_params_t(4, 3, 0.5, 0.99);
    const patternPoints = new Array(count);
    const screenPoints = new Array(count);

    for (let i = 0; i < count; i += 1) {
      const match = matches[i];
      const screenPoint = screenCorners[match.screen_idx];
      const patternPoint = patternCorners[match.pattern_lev][match.pattern_idx];
      patternPoints[i] = { x: patternPoint.x, y: patternPoint.y };
      screenPoints[i] = { x: screenPoint.x, y: screenPoint.y };
    }

    const ok = jsfeat.motion_estimator.ransac(params, kernel, patternPoints, screenPoints, count, homography, matchMask, 1000);

    if (!ok) {
      jsfeat.matmath.identity_3x3(homography, 1);
      return 0;
    }

    let goodCount = 0;
    for (let i = 0; i < count; i += 1) {
      if (matchMask.data[i]) {
        patternPoints[goodCount] = patternPoints[i];
        screenPoints[goodCount] = screenPoints[i];
        goodCount += 1;
      }
    }

    if (goodCount >= 4) kernel.run(patternPoints, screenPoints, homography, goodCount);
    return goodCount;
  }

  function projectCorners(matrix, width, height) {
    const source = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height }
    ];

    return source.map((point) => {
      const denominator = matrix[6] * point.x + matrix[7] * point.y + matrix[8];
      const inverse = Math.abs(denominator) > 1e-7 ? 1 / denominator : 0;
      return {
        x: (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) * inverse,
        y: (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) * inverse
      };
    });
  }

  function smoothQuadrilateral(corners) {
    if (!smoothedCorners) {
      smoothedCorners = corners.map((point) => ({ ...point }));
      return smoothedCorners;
    }

    const alpha = CONFIG.smoothing;
    for (let i = 0; i < 4; i += 1) {
      smoothedCorners[i].x += (corners[i].x - smoothedCorners[i].x) * alpha;
      smoothedCorners[i].y += (corners[i].y - smoothedCorners[i].y) * alpha;
    }
    return smoothedCorners;
  }

  function isValidQuadrilateral(points) {
    if (!points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) return false;

    const margin = Math.max(frameWidth, frameHeight) * 0.3;
    if (points.some((point) => point.x < -margin || point.x > frameWidth + margin || point.y < -margin || point.y > frameHeight + margin)) return false;

    const area = Math.abs(polygonArea(points));
    const frameArea = frameWidth * frameHeight;
    if (area < frameArea * 0.012 || area > frameArea * 1.15) return false;

    const crossSigns = [];
    for (let i = 0; i < 4; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % 4];
      const c = points[(i + 2) % 4];
      crossSigns.push(Math.sign((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)));
    }
    return crossSigns.every((sign) => sign === crossSigns[0] && sign !== 0);
  }

  function polygonArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i += 1) {
      const next = points[(i + 1) % points.length];
      area += points[i].x * next.y - next.x * points[i].y;
    }
    return area / 2;
  }

  function drawAugmentedOverlay(corners, inliers, now) {
    const elapsed = detectionStartedAt ? (now - detectionStartedAt) / 1000 : 0;
    const pulse = (Math.sin(now / 250) + 1) / 2;
    const [a, b, c, d] = corners;
    const center = {
      x: (a.x + b.x + c.x + d.x) / 4,
      y: (a.y + b.y + c.y + d.y) / 4
    };
    const topWidth = distance(a, b);
    const bottomWidth = distance(d, c);
    const leftHeight = distance(a, d);
    const rightHeight = distance(b, c);
    const width = (topWidth + bottomWidth) / 2;
    const height = (leftHeight + rightHeight) / 2;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fillStyle = `rgba(10, 4, 6, ${0.08 + pulse * 0.05})`;
    ctx.fill();

    ctx.setLineDash([Math.max(18, width * 0.05), Math.max(9, width * 0.028)]);
    ctx.lineDashOffset = -(now / 40);
    ctx.strokeStyle = 'rgba(255,233,219,.95)';
    ctx.lineWidth = clamp(width * 0.015, 2.5, 8);
    ctx.shadowColor = 'rgba(255,145,90,.55)';
    ctx.shadowBlur = 16 + pulse * 8;
    strokePolygon(ctx, corners);

    ctx.setLineDash([]);
    ctx.shadowBlur = 10;
    const bracket = clamp(Math.min(width, height) * 0.12, 18, 54);
    const bracketWidth = clamp(width * 0.01, 2, 6);
    drawCornerBracket(a, unitVector(a, b), unitVector(a, d), bracket, '#ffd5c2', bracketWidth);
    drawCornerBracket(b, unitVector(b, a), unitVector(b, c), bracket, '#ffd5c2', bracketWidth);
    drawCornerBracket(c, unitVector(c, d), unitVector(c, b), bracket, '#ffd5c2', bracketWidth);
    drawCornerBracket(d, unitVector(d, c), unitVector(d, a), bracket, '#ffd5c2', bracketWidth);

    ctx.translate(center.x, center.y);
    ctx.rotate(angle);
    const localScale = clamp(width / patternWidth, 0.18, 2.4);
    ctx.scale(localScale, localScale);

    const labelWidth = Math.min(patternWidth * 0.72, 370);
    const labelHeight = 82;
    const reveal = Math.min(1, elapsed * 2.2);
    const lift = (1 - reveal) * 18;
    ctx.globalAlpha = 0.28 + reveal * 0.72;
    ctx.translate(0, lift);

    const halo = ctx.createRadialGradient(0, -16, 6, 0, -16, 72 + pulse * 14);
    halo.addColorStop(0, 'rgba(255,213,194,.40)');
    halo.addColorStop(0.45, 'rgba(255,90,46,.22)');
    halo.addColorStop(1, 'rgba(255,90,46,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, -16, 74 + pulse * 14, 0, Math.PI * 2);
    ctx.fill();

    roundedRect(ctx, -labelWidth / 2, -labelHeight / 2, labelWidth, labelHeight, 18);
    ctx.fillStyle = 'rgba(11,5,7,.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,224,212,.92)';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 24px Georgia, serif';
    ctx.fillText('PORTADA RECONOCIDA', 0, -10);
    ctx.fillStyle = '#ffcab7';
    ctx.font = '700 12px Inter, system-ui, sans-serif';
    ctx.fillText(`VIDEO TRACKING · ${inliers} PUNTOS`, 0, 20);

    ctx.restore();
  }

  function updateTrackedPlane(corners, now, inliers) {
    syncLayerBounds();
    if (!layerRect.width || !layerRect.height) return;

    const scaleX = layerRect.width / frameWidth;
    const scaleY = layerRect.height / frameHeight;
    const planeWidth = patternWidth * scaleX;
    const planeHeight = patternHeight * scaleY;
    const destination = corners.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY }));
    const source = [
      { x: 0, y: 0 },
      { x: planeWidth, y: 0 },
      { x: planeWidth, y: planeHeight },
      { x: 0, y: planeHeight }
    ];

    const matrix = computeProjectiveMatrix(source, destination);
    if (!matrix) return;

    arPlane.style.width = `${planeWidth}px`;
    arPlane.style.height = `${planeHeight}px`;
    arPlane.style.transform = `matrix3d(${matrix.map((value) => (Math.abs(value) < 1e-10 ? 0 : Number(value.toFixed(10)))).join(',')})`;

    if (detectionStartedAt && performance.now() - detectionStartedAt > CONFIG.minimumTrackedRevealMs) {
      arLayer.hidden = false;
      arPlane.classList.add('is-visible');
      planeMeta.textContent = `Seguimiento activo · ${inliers} coincidencias útiles`;
      setYouTubePlayback(true);
    }
  }

  function hideTrackedPlane(forceUnmount = false) {
    arPlane.classList.remove('is-visible');
    arLayer.hidden = true;
    planeMeta.textContent = 'Seguimiento activo de portada';
    if (forceUnmount) unmountYouTubePlayer();
  }

  function syncLayerBounds() {
    const rect = canvas.getBoundingClientRect();
    layerRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    arLayer.style.left = `${rect.left}px`;
    arLayer.style.top = `${rect.top}px`;
    arLayer.style.width = `${rect.width}px`;
    arLayer.style.height = `${rect.height}px`;
  }

  function mountYouTubePlayer() {
    if (youtubeMounted || !EXPERIENCE.youtubeVideoId) return;
    youtubeMounted = true;
    youtubeReady = false;
    planeState.textContent = 'Cargando video';
    videoPlaceholder.hidden = true;
    const playerHost = document.createElement('div');
    playerHost.id = 'youtubePlayer';
    videoStage.appendChild(playerHost);
    createYouTubePlayer();
  }

  function createYouTubePlayer() {
    if (!youtubeMounted || youtubePlayer || !window.YT?.Player) return;
    youtubePlayer = new window.YT.Player('youtubePlayer', {
      videoId: EXPERIENCE.youtubeVideoId,
      playerVars: {
        autoplay: 0,
        controls: 0,
        playsinline: 1,
        rel: 0,
        loop: 1,
        playlist: EXPERIENCE.youtubeVideoId,
        origin: window.location.origin
      },
      events: {
        onReady: (event) => {
          youtubeReady = true;
          if (youtubeMuted) event.target.mute();
          setYouTubePlayback(youtubeShouldPlay);
        },
        onError: () => {
          planeState.textContent = 'Video no disponible';
        }
      }
    });
  }

  function unmountYouTubePlayer() {
    if (youtubePlayer?.destroy) youtubePlayer.destroy();
    else document.getElementById('youtubePlayer')?.remove();
    youtubePlayer = null;
    youtubeMounted = false;
    youtubeReady = false;
    youtubeShouldPlay = false;
    planeState.textContent = EXPERIENCE.youtubeVideoId ? 'Video listo' : 'Esperando video';
    videoPlaceholder.hidden = false;
  }

  function setYouTubePlayback(shouldPlay) {
    youtubeShouldPlay = shouldPlay;
    if (!youtubeMounted || !youtubeReady || !youtubePlayer) return;
    if (shouldPlay) youtubePlayer.playVideo();
    else youtubePlayer.pauseVideo();
    planeState.textContent = shouldPlay
      ? (youtubeMuted ? 'Video en reproducción' : 'Video con sonido')
      : 'Video listo';
  }

  function activateSound() {
    youtubeMuted = false;
    youtubePlayer?.unMute();
    youtubePlayer?.setVolume(100);
    app.classList.add('has-sound');
    soundButton.setAttribute('aria-pressed', 'true');
    planeState.textContent = 'Video con sonido';
  }

  window.onYouTubeIframeAPIReady = createYouTubePlayer;

  function computeProjectiveMatrix(source, destination) {
    const h = solveHomography(source, destination);
    if (!h) return null;
    const n = Math.abs(h[8]) > 1e-9 ? h[8] : 1;
    for (let i = 0; i < h.length; i += 1) h[i] /= n;

    return [
      h[0], h[3], 0, h[6],
      h[1], h[4], 0, h[7],
      0,    0,    1, 0,
      h[2], h[5], 0, h[8]
    ];
  }

  function solveHomography(from, to) {
    const A = [];
    const b = [];
    for (let i = 0; i < 4; i += 1) {
      const x = from[i].x;
      const y = from[i].y;
      const X = to[i].x;
      const Y = to[i].y;
      A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
      b.push(X);
      A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
      b.push(Y);
    }
    const solution = solveLinearSystem(A, b);
    if (!solution) return null;
    solution.push(1);
    return solution;
  }

  function solveLinearSystem(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);

    for (let col = 0; col < n; col += 1) {
      let pivot = col;
      for (let row = col + 1; row < n; row += 1) {
        if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
      }
      if (Math.abs(M[pivot][col]) < 1e-10) return null;
      if (pivot !== col) [M[col], M[pivot]] = [M[pivot], M[col]];

      const pivotValue = M[col][col];
      for (let j = col; j <= n; j += 1) M[col][j] /= pivotValue;

      for (let row = 0; row < n; row += 1) {
        if (row === col) continue;
        const factor = M[row][col];
        if (!factor) continue;
        for (let j = col; j <= n; j += 1) M[row][j] -= factor * M[col][j];
      }
    }

    return M.map((row) => row[n]);
  }

  function strokePolygon(context, points) {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) context.lineTo(points[i].x, points[i].y);
    context.closePath();
    context.stroke();
  }

  function drawCornerBracket(origin, horizontal, vertical, length, color, width) {
    ctx.beginPath();
    ctx.moveTo(origin.x + horizontal.x * length, origin.y + horizontal.y * length);
    ctx.lineTo(origin.x, origin.y);
    ctx.lineTo(origin.x + vertical.x * length, origin.y + vertical.y * length);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function unitVector(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length };
  }

  function distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  startCameraButton.addEventListener('click', startCamera);
  startDemoButton.addEventListener('click', startDemo);
  soundButton.addEventListener('click', activateSound);
  stopButton.addEventListener('click', stopRunning);
  window.addEventListener('resize', () => {
    configureCanvas();
    allocateDetector();
    trainPattern(targetImage);
    syncLayerBounds();
  });
  window.addEventListener('pagehide', stopRunning);

  init();
})();
