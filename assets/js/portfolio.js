(function () {
  "use strict";

  var TAU = Math.PI * 2;
  var SQRT3 = Math.sqrt(3);
  var FONT_FALLBACK =
    'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function mix(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(edge0, edge1, value) {
    var t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function easeOutCubic(value) {
    var t = clamp(value, 0, 1);
    return 1 - Math.pow(1 - t, 3);
  }

  function lerpPoint(a, b, t) {
    return {
      x: mix(a.x, b.x, t),
      y: mix(a.y, b.y, t),
    };
  }

  function seededRandom(seed) {
    var state = seed >>> 0;
    return function () {
      state += 0x6d2b79f5;
      var value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function parseRgb(color) {
    if (!color) return null;
    var match = color.match(
      /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i
    );
    if (!match) return null;
    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
      a: match[4] === undefined ? 1 : Number(match[4]),
    };
  }

  function canvasPalette(canvas) {
    var node = canvas;
    var background = null;

    while (node && node !== document.documentElement) {
      var candidate = parseRgb(window.getComputedStyle(node).backgroundColor);
      if (candidate && candidate.a > 0.08) {
        background = candidate;
        break;
      }
      node = node.parentElement;
    }

    if (!background) {
      background = parseRgb(window.getComputedStyle(document.body).backgroundColor) || {
        r: 250,
        g: 250,
        b: 249,
        a: 1,
      };
    }

    var luminance =
      (0.2126 * background.r + 0.7152 * background.g + 0.0722 * background.b) /
      255;
    var dark = luminance < 0.42;
    var inheritedFont = window.getComputedStyle(canvas).fontFamily;

    return {
      dark: dark,
      font: inheritedFont && inheritedFont !== "serif" ? inheritedFont : FONT_FALLBACK,
      ink: dark ? "rgba(235,241,246,0.94)" : "rgba(24,38,54,0.92)",
      muted: dark ? "rgba(192,205,217,0.66)" : "rgba(65,82,99,0.64)",
      faint: dark ? "rgba(174,195,211,0.14)" : "rgba(35,61,84,0.12)",
      faintStrong: dark ? "rgba(185,207,222,0.24)" : "rgba(35,61,84,0.22)",
      panel: dark ? "rgba(218,232,242,0.025)" : "rgba(30,72,102,0.025)",
      shared: dark ? "rgba(239,145,118," : "rgba(197,91,68,",
      conditional: dark ? "rgba(90,207,190," : "rgba(22,143,128,",
      blue: dark ? "rgba(112,169,244," : "rgba(54,111,190,",
      gold: dark ? "rgba(244,196,105," : "rgba(190,132,31,",
    };
  }

  function withAlpha(prefix, alpha) {
    return prefix + clamp(alpha, 0, 1).toFixed(3) + ")";
  }

  function clearCanvas(ctx, width, height, dpr) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
  }

  function installCanvasAnimation(canvasId, painter, cycleLength) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || canvas.tagName.toLowerCase() !== "canvas") return null;

    var ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return null;

    var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    var state = {
      width: 0,
      height: 0,
      dpr: 1,
      palette: canvasPalette(canvas),
      visible: true,
      frame: null,
      reduced: motionQuery.matches,
      startTime: performance.now(),
    };

    function measure() {
      var rect = canvas.getBoundingClientRect();
      var width = Math.max(1, Math.round(rect.width || canvas.clientWidth || 640));
      var declaredWidth = Number(canvas.getAttribute("width")) || 640;
      var declaredHeight = Number(canvas.getAttribute("height")) || 360;
      var fallbackHeight = width * (declaredHeight / declaredWidth);
      var height = Math.max(1, Math.round(rect.height || canvas.clientHeight || fallbackHeight));
      var dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);

      state.width = width;
      state.height = height;
      state.dpr = dpr;
      state.palette = canvasPalette(canvas);

      var pixelWidth = Math.round(width * dpr);
      var pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      draw(performance.now());
    }

    function draw(now) {
      state.frame = null;
      clearCanvas(ctx, state.width, state.height, state.dpr);

      var elapsed = state.reduced ? cycleLength * 0.84 : now - state.startTime;
      painter(ctx, state.width, state.height, elapsed, state.palette, state.reduced);

      if (state.visible && !state.reduced && !document.hidden) {
        state.frame = window.requestAnimationFrame(draw);
      }
    }

    function schedule() {
      if (state.frame !== null) return;
      if (!state.visible || state.reduced || document.hidden) {
        draw(performance.now());
        return;
      }
      state.frame = window.requestAnimationFrame(draw);
    }

    function cancel() {
      if (state.frame !== null) {
        window.cancelAnimationFrame(state.frame);
        state.frame = null;
      }
    }

    function onMotionChange(event) {
      state.reduced = event.matches;
      if (state.reduced) cancel();
      schedule();
    }

    function onVisibilityChange() {
      if (document.hidden) cancel();
      else schedule();
    }

    var intersectionObserver = null;
    if ("IntersectionObserver" in window) {
      intersectionObserver = new IntersectionObserver(
        function (entries) {
          state.visible = entries[0] ? entries[0].isIntersecting : true;
          if (state.visible) schedule();
          else cancel();
        },
        { rootMargin: "80px 0px", threshold: 0.04 }
      );
      intersectionObserver.observe(canvas);
    }

    var resizeObserver = null;
    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(canvas);
    } else {
      window.addEventListener("resize", measure, { passive: true });
    }

    if (motionQuery.addEventListener) motionQuery.addEventListener("change", onMotionChange);
    else if (motionQuery.addListener) motionQuery.addListener(onMotionChange);
    document.addEventListener("visibilitychange", onVisibilityChange);

    measure();
    schedule();

    return {
      refresh: measure,
      destroy: function () {
        cancel();
        if (intersectionObserver) intersectionObserver.disconnect();
        if (resizeObserver) resizeObserver.disconnect();
        else window.removeEventListener("resize", measure);
        if (motionQuery.removeEventListener) {
          motionQuery.removeEventListener("change", onMotionChange);
        } else if (motionQuery.removeListener) {
          motionQuery.removeListener(onMotionChange);
        }
        document.removeEventListener("visibilitychange", onVisibilityChange);
      },
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Value-mismatch simplex                                                  */
  /* ---------------------------------------------------------------------- */

  function createParticlePairs() {
    var random = seededRandom(71831);
    var particles = [];
    for (var i = 0; i < 24; i += 1) {
      var sample = {
        c1: mix(0.42, 1.08, random()),
        c2: mix(0.38, 1.05, random()),
        f1: mix(0.54, 1.24, random()),
        f2: mix(0.78, 1.62, random()),
        phase1: random() * TAU,
        phase2: random() * TAU,
        radius: mix(1.25, 2.35, random()),
        burst: random() > 0.77 ? mix(0.4, 1, random()) : 0,
        branch: i % 4 === 0,
        branchStrength: mix(0.82, 0.96, random()),
      };
      particles.push(Object.assign({ sign: 1 }, sample));
      particles.push(Object.assign({ sign: -1 }, sample));
    }
    return particles;
  }

  var PARTICLES = createParticlePairs();

  function simplexPoint(vertices, barycentric) {
    return {
      x:
        vertices[0].x * barycentric[0] +
        vertices[1].x * barycentric[1] +
        vertices[2].x * barycentric[2],
      y:
        vertices[0].y * barycentric[0] +
        vertices[1].y * barycentric[1] +
        vertices[2].y * barycentric[2],
    };
  }

  function meanPolicy(progress) {
    var t = easeOutCubic(progress);
    return [1 / 3 + 0.43 * t, 1 / 3 - 0.245 * t, 1 / 3 - 0.185 * t];
  }

  function particlePolicy(sample, progress, conditional) {
    var mean = meanPolicy(progress);
    var arc = Math.pow(Math.sin(Math.PI * clamp(progress, 0, 1)), 0.72);
    var amplitude = conditional ? 0.006 + 0.021 * arc : 0.018 + 0.082 * arc + 0.018 * progress;
    var walk1 =
      sample.c1 *
      (0.66 * Math.sin(TAU * sample.f1 * progress + sample.phase1) +
        0.34 * Math.sin(TAU * (sample.f2 + 0.31) * progress + sample.phase2));
    var walk2 =
      sample.c2 *
      (0.7 * Math.cos(TAU * sample.f2 * progress + sample.phase2) +
        0.3 * Math.sin(TAU * (sample.f1 + 0.47) * progress + sample.phase1));

    if (!conditional && sample.burst) {
      var drawdown = Math.exp(-Math.pow((progress - 0.46) / 0.12, 2));
      walk1 -= sample.burst * 0.95 * drawdown;
    }

    var sign = sample.sign;
    var delta = [
      amplitude * sign * walk1,
      amplitude * sign * (-0.5 * walk1 + 0.78 * walk2),
      amplitude * sign * (-0.5 * walk1 - 0.78 * walk2),
    ];

    var scale = 1;
    for (var i = 0; i < 3; i += 1) {
      if (delta[i] < 0) scale = Math.min(scale, (mean[i] - 0.018) / -delta[i]);
    }
    scale = clamp(scale, 0, 1);

    var policy = [
      mean[0] + delta[0] * scale,
      mean[1] + delta[1] * scale,
      mean[2] + delta[2] * scale,
    ];

    // A visible minority of shared-baseline paths commits to a suboptimal
    // corner over the displayed finite horizon. Conditional paths never use
    // this branch and remain concentrated around the improving mean path.
    if (!conditional && sample.branch) {
      var branchProgress = smoothstep(0.16, 0.92, progress) * sample.branchStrength;
      var target = [0.025, 0.95, 0.025];
      policy = [
        mix(policy[0], target[0], branchProgress),
        mix(policy[1], target[1], branchProgress),
        mix(policy[2], target[2], branchProgress),
      ];
    }

    return policy;
  }

  function drawSimplexFrame(ctx, vertices, palette) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    ctx.lineTo(vertices[1].x, vertices[1].y);
    ctx.lineTo(vertices[2].x, vertices[2].y);
    ctx.closePath();
    ctx.fillStyle = palette.panel;
    ctx.fill();
    ctx.strokeStyle = palette.faintStrong;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = palette.faint;
    ctx.lineWidth = 0.75;
    [1 / 3, 2 / 3].forEach(function (fraction) {
      var a = lerpPoint(vertices[0], vertices[1], fraction);
      var b = lerpPoint(vertices[0], vertices[2], fraction);
      var c = lerpPoint(vertices[1], vertices[2], fraction);
      var d = lerpPoint(vertices[1], vertices[0], fraction);
      var e = lerpPoint(vertices[2], vertices[0], fraction);
      var f = lerpPoint(vertices[2], vertices[1], fraction);

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(f.x, f.y);
      ctx.stroke();
    });

    vertices.forEach(function (vertex, index) {
      ctx.beginPath();
      ctx.arc(vertex.x, vertex.y, index === 0 ? 2.3 : 1.7, 0, TAU);
      ctx.fillStyle = index === 0 ? palette.ink : palette.muted;
      ctx.fill();
    });
    ctx.restore();
  }

  function cloudMeanPolicy(progress, conditional) {
    var total = [0, 0, 0];
    PARTICLES.forEach(function (sample) {
      var policy = particlePolicy(sample, progress, conditional);
      total[0] += policy[0];
      total[1] += policy[1];
      total[2] += policy[2];
    });
    return total.map(function (value) {
      return value / PARTICLES.length;
    });
  }

  function drawMeanPath(ctx, vertices, progress, conditional, palette, alpha) {
    ctx.save();
    ctx.beginPath();
    var steps = 30;
    for (var i = 0; i <= steps; i += 1) {
      var t = (i / steps) * progress;
      var point = simplexPoint(vertices, cloudMeanPolicy(t, conditional));
      if (i === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = withAlpha(palette.blue, 0.3 * alpha);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    var current = simplexPoint(vertices, cloudMeanPolicy(progress, conditional));
    ctx.beginPath();
    ctx.arc(current.x, current.y, 3.6, 0, TAU);
    ctx.fillStyle = palette.dark ? "rgba(13,22,30,0.82)" : "rgba(255,255,255,0.88)";
    ctx.fill();
    ctx.strokeStyle = withAlpha(palette.blue, 0.92 * alpha);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  function drawParticleCloud(ctx, vertices, progress, conditional, palette, alpha, scale) {
    var prefix = conditional ? palette.conditional : palette.shared;

    ctx.save();
    ctx.globalCompositeOperation = palette.dark ? "lighter" : "source-over";

    PARTICLES.forEach(function (sample, index) {
      if (!conditional && sample.branch && progress > 0.06) {
        ctx.beginPath();
        for (var step = 0; step <= 14; step += 1) {
          var trailProgress = (progress * step) / 14;
          var trailPoint = simplexPoint(
            vertices,
            particlePolicy(sample, trailProgress, false)
          );
          if (step === 0) ctx.moveTo(trailPoint.x, trailPoint.y);
          else ctx.lineTo(trailPoint.x, trailPoint.y);
        }
        ctx.strokeStyle = withAlpha(prefix, 0.16 * alpha);
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      var previousProgress = Math.max(0, progress - (conditional ? 0.035 : 0.05));
      if (index % 4 === 0 && progress > 0.025) {
        var previous = simplexPoint(
          vertices,
          particlePolicy(sample, previousProgress, conditional)
        );
        var current = simplexPoint(vertices, particlePolicy(sample, progress, conditional));
        ctx.beginPath();
        ctx.moveTo(previous.x, previous.y);
        ctx.lineTo(current.x, current.y);
        ctx.strokeStyle = withAlpha(prefix, (conditional ? 0.18 : 0.12) * alpha);
        ctx.lineWidth = 0.75;
        ctx.stroke();
      }
    });

    PARTICLES.forEach(function (sample) {
      var point = simplexPoint(vertices, particlePolicy(sample, progress, conditional));
      var radius = sample.radius * scale * (conditional ? 0.88 : 1);
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, TAU);
      ctx.fillStyle = withAlpha(prefix, (conditional ? 0.54 : 0.4) * alpha);
      ctx.fill();
    });

    ctx.restore();
  }

  function paintValueMismatch(ctx, width, height, elapsed, palette, reduced) {
    var cycle = reduced ? 0.78 : (elapsed % 8200) / 8200;
    var progress = reduced ? 0.74 : smoothstep(0.045, 0.84, cycle);
    var alpha = reduced
      ? 1
      : smoothstep(0, 0.055, cycle) * (1 - smoothstep(0.91, 1, cycle));

    var cellWidth = width / 2;
    var labelHeight = clamp(height * 0.13, 22, 30);
    var horizontalInset = clamp(cellWidth * 0.12, 13, 34);
    var side = Math.min(cellWidth - 2 * horizontalInset, ((height - labelHeight - 12) * 2) / SQRT3);
    side = Math.max(32, side);
    var triangleHeight = (side * SQRT3) / 2;
    var top = labelHeight + Math.max(4, (height - labelHeight - triangleHeight) * 0.42);
    var centers = [cellWidth * 0.5, cellWidth * 1.5];
    var scale = clamp(side / 230, 0.64, 1.18);

    centers.forEach(function (centerX, index) {
      var vertices = [
        { x: centerX, y: top },
        { x: centerX - side / 2, y: top + triangleHeight },
        { x: centerX + side / 2, y: top + triangleHeight },
      ];
      drawSimplexFrame(ctx, vertices, palette);
      drawMeanPath(ctx, vertices, progress, index === 1, palette, alpha);
      drawParticleCloud(ctx, vertices, progress, index === 1, palette, alpha, scale);
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Active curriculum paths                                                 */
  /* ---------------------------------------------------------------------- */

  var PATH_ENDPOINTS = [
    [0.78, 0.52, 0.3],
    [0.58, 0.77, 0.34],
    [0.7, 0.66, 0.26],
    [0.48, 0.72, 0.4],
    [0.8, 0.38, 0.36],
    [0.62, 0.6, 0.43],
    [0.74, 0.72, 0.34],
  ];

  function createMonotonePath(seed, endpoint) {
    var random = seededRandom(seed);
    var count = 12;
    var increments = [[], [], []];
    var totals = [0, 0, 0];
    var start = [mix(0.018, 0.065, random()), mix(0.018, 0.065, random()), 0.018];

    for (var axis = 0; axis < 3; axis += 1) {
      for (var i = 1; i < count; i += 1) {
        var weight = mix(0.28, 1.35, random());
        increments[axis].push(weight);
        totals[axis] += weight;
      }
    }

    var path = [start];
    var cumulative = [0, 0, 0];
    for (var step = 1; step < count; step += 1) {
      var point = [];
      for (var dimension = 0; dimension < 3; dimension += 1) {
        cumulative[dimension] += increments[dimension][step - 1];
        point.push(
          mix(start[dimension], endpoint[dimension], cumulative[dimension] / totals[dimension])
        );
      }
      path.push(point);
    }
    return path;
  }

  var CURRICULUM_PATHS = PATH_ENDPOINTS.map(function (endpoint, index) {
    return createMonotonePath(9107 + index * 101, endpoint);
  });

  var BREAKTHROUGH = [0.62, 0.54, 0.42];
  var REFINEMENT_EDGES = [
    { from: BREAKTHROUGH, to: [0.53, 0.49, 0.6], delay: 0 },
    { from: BREAKTHROUGH, to: [0.55, 0.64, 0.61], delay: 0.03 },
    { from: BREAKTHROUGH, to: [0.7, 0.45, 0.6], delay: 0.06 },
    { from: [0.53, 0.49, 0.6], to: [0.44, 0.44, 0.74], delay: 0.23 },
    { from: [0.53, 0.49, 0.6], to: [0.52, 0.36, 0.72], delay: 0.28 },
    { from: [0.55, 0.64, 0.61], to: [0.43, 0.62, 0.76], delay: 0.3 },
    { from: [0.55, 0.64, 0.61], to: [0.57, 0.74, 0.74], delay: 0.36 },
    { from: [0.7, 0.45, 0.6], to: [0.67, 0.32, 0.74], delay: 0.34 },
    { from: [0.7, 0.45, 0.6], to: [0.82, 0.41, 0.72], delay: 0.42 },
    { from: [0.44, 0.44, 0.74], to: [0.36, 0.39, 0.9], delay: 0.56 },
    { from: [0.43, 0.62, 0.76], to: [0.31, 0.59, 0.92], delay: 0.59 },
    { from: [0.67, 0.32, 0.74], to: [0.63, 0.21, 0.9], delay: 0.62 },
  ];

  function projector(width, height) {
    var scale = Math.min(width * 0.43, height * 0.92);
    var originX = width * 0.5;
    var originY = height * 0.82;
    return function (point) {
      return {
        x: originX + point[0] * scale * 0.76 - point[1] * scale * 0.68,
        y:
          originY -
          point[0] * scale * 0.18 -
          point[1] * scale * 0.17 -
          point[2] * scale * 0.58,
      };
    };
  }

  function drawPerspectiveGrid(ctx, project, palette) {
    ctx.save();
    ctx.strokeStyle = palette.faint;
    ctx.lineWidth = 0.75;

    for (var i = 0; i <= 4; i += 1) {
      var t = i / 4;
      var x0 = project([t, 0, 0]);
      var x1 = project([t, 1, 0]);
      var y0 = project([0, t, 0]);
      var y1 = project([1, t, 0]);
      ctx.beginPath();
      ctx.moveTo(x0.x, x0.y);
      ctx.lineTo(x1.x, x1.y);
      ctx.moveTo(y0.x, y0.y);
      ctx.lineTo(y1.x, y1.y);
      ctx.stroke();
    }

    var origin = project([0, 0, 0]);
    var axes = [project([1.08, 0, 0]), project([0, 1.08, 0]), project([0, 0, 1.08])];
    axes.forEach(function (end) {
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = palette.faintStrong;
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawPartialPolyline(ctx, path, project, progress, palette, alpha, halo) {
    if (progress <= 0 || path.length < 2) return;
    var exact = clamp(progress, 0, 1) * (path.length - 1);
    var fullSegments = Math.floor(exact);
    var remainder = exact - fullSegments;
    var points = [];

    for (var i = 0; i <= fullSegments; i += 1) points.push(project(path[i]));
    if (remainder > 0 && fullSegments < path.length - 1) {
      var a = path[fullSegments];
      var b = path[fullSegments + 1];
      points.push(
        project([
          mix(a[0], b[0], remainder),
          mix(a[1], b[1], remainder),
          mix(a[2], b[2], remainder),
        ])
      );
    }
    if (points.length < 2) return;

    function stroke(width, color) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (var index = 1; index < points.length; index += 1) {
        ctx.lineTo(points[index].x, points[index].y);
      }
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = color;
      ctx.stroke();
    }

    ctx.save();
    if (halo) stroke(8, withAlpha(palette.blue, 0.025 * alpha));
    stroke(1.05, withAlpha(palette.blue, 0.3 * alpha));

    var nodeStep = Math.max(1, Math.floor(path.length / 5));
    for (var nodeIndex = 0; nodeIndex <= fullSegments; nodeIndex += nodeStep) {
      var node = project(path[nodeIndex]);
      ctx.beginPath();
      ctx.arc(node.x, node.y, 1.45, 0, TAU);
      ctx.fillStyle = withAlpha(palette.blue, 0.42 * alpha);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRefinement(ctx, project, progress, palette, alpha) {
    if (progress <= 0) return;

    ctx.save();
    ctx.globalCompositeOperation = palette.dark ? "lighter" : "source-over";

    REFINEMENT_EDGES.forEach(function (edge) {
      var local = smoothstep(edge.delay, Math.min(1, edge.delay + 0.28), progress);
      if (local <= 0) return;
      var start = project(edge.from);
      var destination = project(edge.to);
      var end = lerpPoint(start, destination, easeOutCubic(local));

      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = withAlpha(palette.conditional, 0.11 * alpha * local);
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = withAlpha(palette.conditional, 0.7 * alpha * local);
      ctx.lineWidth = 1.25;
      ctx.stroke();

      if (local > 0.84) {
        ctx.beginPath();
        ctx.arc(destination.x, destination.y, 1.7, 0, TAU);
        ctx.fillStyle = withAlpha(palette.conditional, 0.78 * alpha);
        ctx.fill();
      }
    });
    ctx.restore();
  }

  function drawBreakthrough(ctx, point, pulse, palette, alpha) {
    ctx.save();
    ctx.globalCompositeOperation = palette.dark ? "lighter" : "source-over";

    var radius = 4.5 + 7.5 * pulse;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, TAU);
    ctx.strokeStyle = withAlpha(palette.gold, (0.34 - 0.23 * pulse) * alpha);
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.2, 0, TAU);
    ctx.fillStyle = withAlpha(palette.gold, 0.88 * alpha);
    ctx.fill();
    ctx.restore();
  }

  function paintCurriculum(ctx, width, height, elapsed, palette, reduced) {
    var cycle = reduced ? 0.84 : (elapsed % 10800) / 10800;
    var fade = reduced ? 1 : 1 - smoothstep(0.94, 1, cycle);
    var coverage = reduced ? 1 : smoothstep(0.04, 0.61, cycle);
    var breakthrough = reduced ? 1 : smoothstep(0.62, 0.71, cycle);
    var refinement = reduced ? 1 : smoothstep(0.69, 0.92, cycle);
    var coverageAlpha = fade * mix(1, 0.32, refinement);
    var project = projector(width, height);

    drawPerspectiveGrid(ctx, project, palette);

    CURRICULUM_PATHS.forEach(function (path, index) {
      var delay = index * 0.09;
      var local = smoothstep(delay, Math.min(1, delay + 0.42), coverage);
      drawPartialPolyline(ctx, path, project, local, palette, coverageAlpha, true);
    });

    if (breakthrough > 0) {
      var root = project(BREAKTHROUGH);
      var pulse = reduced ? 0.45 : (Math.sin(elapsed * 0.0045) + 1) / 2;
      drawBreakthrough(ctx, root, pulse, palette, fade * breakthrough);
    }

    drawRefinement(ctx, project, refinement, palette, fade);

    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "600 " + clamp(width / 66, 9.5, 11.5) + "px " + palette.font;
    ctx.fillStyle =
      refinement > 0.1
        ? withAlpha(palette.conditional, 0.8 * fade)
        : withAlpha(palette.blue, 0.7 * fade);
    var label = refinement > 0.1 ? "ACTIVE REFINEMENT" : "MONOTONE CURRICULUM PATHS";
    ctx.fillText(label, clamp(width * 0.045, 12, 24), clamp(height * 0.055, 10, 18));
    ctx.restore();
  }

  function initializePortfolioAnimations() {
    var animations = [
      installCanvasAnimation("valueMismatchCanvas", paintValueMismatch, 8200),
      installCanvasAnimation("curriculumCanvas", paintCurriculum, 10800),
    ].filter(Boolean);

    window.PortfolioAnimations = {
      refresh: function () {
        animations.forEach(function (animation) {
          animation.refresh();
        });
      },
      destroy: function () {
        animations.forEach(function (animation) {
          animation.destroy();
        });
      },
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializePortfolioAnimations, { once: true });
  } else {
    initializePortfolioAnimations();
  }
})();
