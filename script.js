/**
 * AUREN — HIGH LUXURY EDITORIAL CONTROLLER
 * Precision scroll-controlled video scrubber, momentum interpolation,
 * scene text synchronization, and reduced-motion fallback.
 */

(function () {
  'use strict';

  // DOM Elements
  const heroSection = document.getElementById('hero-scroll-section');
  const heroVideo = document.getElementById('hero-video');
  const heroPoster = document.getElementById('hero-poster');
  const heroOpening = document.getElementById('hero-opening-content');
  const mainNav = document.getElementById('main-nav');
  const timelineFill = document.getElementById('timeline-fill');
  const timelineTimecode = document.getElementById('timeline-timecode');
  const chapterDots = document.querySelectorAll('.chapter-dot');
  
  // Scene Overlays
  const scenes = {
    mansion: {
      el: document.getElementById('scene-mansion'),
      start: 7.5,
      end: 12.5
    },
    gallery: {
      el: document.getElementById('scene-gallery'),
      start: 13.5,
      end: 18.0
    },
    cafe: {
      el: document.getElementById('scene-cafe'),
      start: 19.0,
      end: 24.0
    },
    marble: {
      el: document.getElementById('scene-marble'),
      start: 25.0,
      end: 29.2
    },
    final: {
      el: document.getElementById('scene-final'),
      start: 29.8,
      end: 32.42
    }
  };

  // State
  let videoDuration = 32.42; // Known native duration
  let targetTime = 0;
  let currentTime = 0;
  let scrollProgress = 0;
  let isVideoReady = false;
  let isReducedMotion = false;
  let isSeeking = false;
  let pendingSeekTime = null;
  let autoPlayInterval = null;

  // Audio State
  let audioCtx = null;
  let masterGain = null;
  let isSoundActive = false;

  // Initialize
  function init() {
    setupVideo();
    setupScroll();
    setupTimeline();
    setupCardsDeck();
    setupStatueExpand();
    setupCursorParallax();
    setupMotionToggle();
    setupSoundToggle();
    setupProductModals();
    setupSmoothScrollLinks();

    // Check system preference for reduced motion
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionQuery.matches) {
      enableReducedMotion(true);
    }
    motionQuery.addEventListener('change', (e) => {
      enableReducedMotion(e.matches);
    });

    // Start Animation Render Loop
    requestAnimationFrame(renderLoop);
  }

  // Video Setup & Optimization
  function setupVideo() {
    heroVideo.muted = true;
    heroVideo.pause();

    heroVideo.addEventListener('loadedmetadata', () => {
      if (heroVideo.duration && !isNaN(heroVideo.duration)) {
        videoDuration = heroVideo.duration;
      }
      isVideoReady = true;
      updateTimecode(0);
    });

    heroVideo.addEventListener('canplay', () => {
      isVideoReady = true;
    });

    heroVideo.addEventListener('seeking', () => {
      isSeeking = true;
    });

    heroVideo.addEventListener('seeked', () => {
      isSeeking = false;
      if (pendingSeekTime !== null) {
        const nextTime = pendingSeekTime;
        pendingSeekTime = null;
        applyVideoSeek(nextTime);
      }
    });

    // Ensure poster is shown at start
    heroPoster.style.opacity = '1';
  }

  // Scroll Handling
  function setupScroll() {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();
  }

  function onScroll() {
    if (isReducedMotion) return;

    const rect = heroSection.getBoundingClientRect();
    const scrollableDistance = heroSection.offsetHeight - window.innerHeight;
    const currentScroll = -rect.top;

    // Calculate normalized progress [0.0 - 1.0]
    scrollProgress = Math.min(Math.max(currentScroll / scrollableDistance, 0), 1);
    targetTime = scrollProgress * videoDuration;

    // 1. First scroll phase: Smoothly fade image, wordmark, button, cue
    // Phase completes within the first 7% of scroll
    const fadeThreshold = 0.07;
    if (scrollProgress <= 0.001) {
      heroPoster.style.opacity = '1';
      heroOpening.style.opacity = '1';
      heroOpening.style.transform = 'translateY(0) scale(1)';
      heroOpening.style.pointerEvents = 'auto';
      mainNav.classList.remove('scrolled');
    } else if (scrollProgress < fadeThreshold) {
      const f = scrollProgress / fadeThreshold;
      const opacity = Math.max(0, 1 - f);
      const translateY = -f * 35; // Gentle upward drift
      const scale = 1 - f * 0.05;

      heroPoster.style.opacity = opacity.toFixed(3);
      heroOpening.style.opacity = opacity.toFixed(3);
      heroOpening.style.transform = `translateY(${translateY.toFixed(1)}px) scale(${scale.toFixed(3)})`;
      heroOpening.style.pointerEvents = opacity < 0.1 ? 'none' : 'auto';
      mainNav.classList.remove('scrolled');
    } else {
      heroPoster.style.opacity = '0';
      heroOpening.style.opacity = '0';
      heroOpening.style.transform = 'translateY(-35px) scale(0.95)';
      heroOpening.style.pointerEvents = 'none';
    }

    // Transparent Header on homepage hero:
    // Only transitions to subtle glass navigation once scrolled completely past the hero
    if (scrollProgress < 0.98) {
      mainNav.classList.add('transparent-header');
      mainNav.classList.remove('past-hero-nav');
    } else {
      mainNav.classList.add('past-hero-nav');
      mainNav.classList.remove('transparent-header');
    }

    // Update diagonal cards scroll position
    updateCardsScroll();
    // Update expanding statue monolith scroll position
    updateStatueExpandScroll();
  }

  // Video Time Physics Interpolation Loop (RAF)
  function renderLoop() {
    if (!isReducedMotion) {
      // Eased gentle interpolation:
      // Delta represents distance to target scroll time
      const delta = targetTime - currentTime;
      
      // Easing coefficient: 0.10 delivers a weighty, luxurious momentum
      // that continues briefly when scrolling stops and then settles softly
      const ease = 0.10;

      if (Math.abs(delta) > 0.001) {
        currentTime += delta * ease;
      } else {
        currentTime = targetTime;
      }

      // Clamp currentTime within bounds
      currentTime = Math.max(0, Math.min(currentTime, videoDuration));

      // Apply to video element
      applyVideoSeek(currentTime);

      // Update HUD & Overlays
      updateSceneOverlays(currentTime);
      updateTimelineHUD(currentTime, scrollProgress);

      // Interpolate cards and expanding monolith on RAF
      updateCardsScroll();
      updateStatueExpandScroll();
    }

    // Always update cursor parallax with smooth LERP (re-centers smoothly if reduced motion active)
    updateCursorParallax();

    requestAnimationFrame(renderLoop);
  }

  // Safe seek handler with queueing to prevent browser seek thrashing
  function applyVideoSeek(time) {
    if (!isVideoReady && heroVideo.readyState < 2) return;

    if (isSeeking) {
      pendingSeekTime = time;
      return;
    }

    // Only update if difference is meaningful to save GPU cycles
    if (Math.abs(heroVideo.currentTime - time) > 0.025) {
      try {
        heroVideo.currentTime = time;
      } catch (err) {
        // Fallback for edge cases
      }
    }
  }

  // Scene Text Overlay Controller
  // Text appears only when scene is visible, positioned away from statues
  function updateSceneOverlays(time) {
    // Mansion: 7.5s - 12.5s
    toggleScene(scenes.mansion.el, time >= scenes.mansion.start && time <= scenes.mansion.end);

    // Gallery: 13.5s - 18.0s
    toggleScene(scenes.gallery.el, time >= scenes.gallery.start && time <= scenes.gallery.end);

    // Café: 19.0s - 24.0s
    toggleScene(scenes.cafe.el, time >= scenes.cafe.start && time <= scenes.cafe.end);

    // Marble Hall: 25.0s - 29.2s
    toggleScene(scenes.marble.el, time >= scenes.marble.start && time <= scenes.marble.end);

    // Final Garden View: 29.8s - 32.42s
    toggleScene(scenes.final.el, time >= scenes.final.start && time <= scenes.final.end);
  }

  function toggleScene(el, isVisible) {
    if (!el) return;
    if (isVisible) {
      if (!el.classList.contains('active')) {
        el.classList.add('active');
        el.setAttribute('aria-hidden', 'false');
      }
    } else {
      if (el.classList.contains('active')) {
        el.classList.remove('active');
        el.setAttribute('aria-hidden', 'true');
      }
    }
  }

  // Timeline HUD & Chapter Dots
  function setupTimeline() {
    chapterDots.forEach((dot) => {
      dot.addEventListener('click', () => {
        const destTime = parseFloat(dot.getAttribute('data-time'));
        jumpToTime(destTime);
      });
    });

    const scrollCue = document.getElementById('hero-scroll-cue');
    if (scrollCue) {
      scrollCue.addEventListener('click', () => {
        jumpToTime(8.5); // Jump into the estate scene
      });
    }
  }

  function updateTimelineHUD(time, progress) {
    if (timelineFill) {
      timelineFill.style.height = `${(progress * 100).toFixed(1)}%`;
    }
    updateTimecode(time);

    // Highlight active chapter
    chapterDots.forEach((dot) => {
      const dotTime = parseFloat(dot.getAttribute('data-time'));
      const isActive = Math.abs(time - dotTime) < 3.2;
      dot.classList.toggle('active', isActive);
    });
  }

  function updateTimecode(seconds) {
    if (!timelineTimecode) return;
    const curM = Math.floor(seconds / 60);
    const curS = Math.floor(seconds % 60);
    const totM = Math.floor(videoDuration / 60);
    const totS = Math.floor(videoDuration % 60);
    timelineTimecode.textContent = `${pad(curM)}:${pad(curS)} / ${pad(totM)}:${pad(totS)}`;
  }

  function pad(n) {
    return n < 10 ? '0' + n : n;
  }

  function jumpToTime(targetSeconds) {
    const scrollableDistance = heroSection.offsetHeight - window.innerHeight;
    const targetScrollY = heroSection.offsetTop + (targetSeconds / videoDuration) * scrollableDistance;

    window.scrollTo({
      top: targetScrollY,
      behavior: 'smooth'
    });
  }

  // Reduced-Motion Fallback Controller
  function setupMotionToggle() {
    const btn = document.getElementById('motion-toggle');
    const label = document.getElementById('motion-btn-text');
    const panel = document.getElementById('reduced-motion-panel');
    const rmPlayBtn = document.getElementById('rm-play-btn');
    const rmPrevBtn = document.getElementById('rm-prev-scene');
    const rmNextBtn = document.getElementById('rm-next-scene');

    if (!btn) return;

    btn.addEventListener('click', () => {
      enableReducedMotion(!isReducedMotion);
    });

    if (rmPlayBtn) {
      rmPlayBtn.addEventListener('click', () => {
        if (heroVideo.paused) {
          heroVideo.play();
          rmPlayBtn.textContent = 'Pause Journey';
        } else {
          heroVideo.pause();
          rmPlayBtn.textContent = 'Play Journey';
        }
      });
    }

    const sceneKeyframes = [0, 9.5, 15.5, 21.0, 27.0, 32.0];
    let currentKeyframeIdx = 0;

    if (rmPrevBtn) {
      rmPrevBtn.addEventListener('click', () => {
        currentKeyframeIdx = Math.max(0, currentKeyframeIdx - 1);
        jumpToKeyframe(sceneKeyframes[currentKeyframeIdx]);
      });
    }

    if (rmNextBtn) {
      rmNextBtn.addEventListener('click', () => {
        currentKeyframeIdx = Math.min(sceneKeyframes.length - 1, currentKeyframeIdx + 1);
        jumpToKeyframe(sceneKeyframes[currentKeyframeIdx]);
      });
    }

    function jumpToKeyframe(time) {
      currentTime = time;
      targetTime = time;
      heroVideo.currentTime = time;
      updateSceneOverlays(time);
      updateTimelineHUD(time, time / videoDuration);
    }
  }

  function enableReducedMotion(enable) {
    isReducedMotion = enable;
    const btn = document.getElementById('motion-toggle');
    const label = document.getElementById('motion-btn-text');
    const panel = document.getElementById('reduced-motion-panel');

    if (enable) {
      btn.classList.add('active');
      label.textContent = 'MOTION: REDUCED';
      panel.style.display = 'flex';
      heroPoster.style.opacity = '0';
      heroOpening.style.opacity = '1';
      heroOpening.style.transform = 'none';
      heroVideo.pause();
      mouseTargetX = 0;
      mouseTargetY = 0;
    } else {
      btn.classList.remove('active');
      label.textContent = 'MOTION: CINEMATIC';
      panel.style.display = 'none';
      heroVideo.pause();
      onScroll();
    }
  }

  // Atmospheric Web Audio Synthesizer
  function setupSoundToggle() {
    const soundBtn = document.getElementById('sound-toggle');
    const soundText = document.getElementById('sound-btn-text');
    const notice = document.getElementById('audio-notice');

    if (!soundBtn) return;

    soundBtn.addEventListener('click', () => {
      if (!isSoundActive) {
        initAudioAtmosphere();
        isSoundActive = true;
        soundBtn.classList.add('playing');
        soundText.textContent = 'SOUND ON';
        showAudioNotice('Atmospheric Atelier soundscape active');
      } else {
        muteAudioAtmosphere();
        isSoundActive = false;
        soundBtn.classList.remove('playing');
        soundText.textContent = 'SOUND OFF';
        showAudioNotice('Soundscape muted');
      }
    });

    function showAudioNotice(msg) {
      if (!notice) return;
      notice.querySelector('p').textContent = msg;
      notice.classList.add('visible');
      setTimeout(() => {
        notice.classList.remove('visible');
      }, 2600);
    }
  }

  function initAudioAtmosphere() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    if (!audioCtx) {
      audioCtx = new AudioContext();
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0.001, audioCtx.currentTime);
    masterGain.gain.exponentialRampToValueAtTime(0.22, audioCtx.currentTime + 2.5);
    masterGain.connect(audioCtx.destination);

    // Deep Sub-Bass Classical Drone (55Hz / A1)
    const subOsc = audioCtx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(55, audioCtx.currentTime);

    const subFilter = audioCtx.createBiquadFilter();
    subFilter.type = 'lowpass';
    subFilter.frequency.setValueAtTime(120, audioCtx.currentTime);

    subOsc.connect(subFilter);
    subFilter.connect(masterGain);
    subOsc.start();

    // Ethereal Velvet Chord (A3, C#4, E4)
    [220, 277.18, 329.63].forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

      const gain = audioCtx.createGain();
      gain.gain.value = 0.035 / (idx + 1);

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(freq, audioCtx.currentTime);
      filter.Q.value = 3.0;

      // Slow LFO for breathing movement
      const lfo = audioCtx.createOscillator();
      lfo.frequency.value = 0.15 + idx * 0.05;
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 0.015;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();

      osc.connect(gain);
      gain.connect(filter);
      filter.connect(masterGain);
      osc.start();
    });
  }

  function muteAudioAtmosphere() {
    if (masterGain && audioCtx) {
      masterGain.gain.setValueAtTime(masterGain.gain.value, audioCtx.currentTime);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.2);
    }
  }

  // Smooth Scroll Anchor Links
  function setupSmoothScrollLinks() {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', function (e) {
        const targetId = this.getAttribute('href');
        if (targetId === '#') return;
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          e.preventDefault();
          targetEl.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }

  // ==========================================================================
  // PINNED DIAGONAL CARDS CONTROLLER (5 CARDS: 1.jpg to 5.jpg)
  // Cards enter from bottom right, glide toward top left with tilt, fade out,
  // fully reversible, responsive without horizontal scrollbar.
  // ==========================================================================
  const cardsSection = document.getElementById('collection');
  const cards = document.querySelectorAll('.diagonal-card');
  const cardsCurrentIdx = document.getElementById('cards-current-idx');
  const cardDots = document.querySelectorAll('.card-dot');

  // Center alignment progress checkpoints for the 5 cards
  const cardCenterPoints = [0.10, 0.30, 0.50, 0.70, 0.90];
  const cardSpread = 0.22;

  function setupCardsDeck() {
    cardDots.forEach((dot) => {
      dot.addEventListener('click', () => {
        const idx = parseInt(dot.getAttribute('data-idx'), 10);
        if (isNaN(idx) || idx < 0 || idx >= cardCenterPoints.length || !cardsSection) return;
        const centerP = cardCenterPoints[idx];
        const totalScroll = cardsSection.offsetHeight - window.innerHeight;
        const targetScrollY = cardsSection.offsetTop + centerP * totalScroll;
        window.scrollTo({
          top: targetScrollY,
          behavior: 'smooth'
        });
      });
    });

    updateCardsScroll();
  }

  function updateCardsScroll() {
    if (!cardsSection || cards.length === 0) return;

    const rect = cardsSection.getBoundingClientRect();
    const totalScroll = cardsSection.offsetHeight - window.innerHeight;
    const currentY = -rect.top;
    
    // Normalized progress within this section [0.0 - 1.0]
    const progress = Math.min(Math.max(currentY / totalScroll, 0), 1);

    let activeIndex = 0;
    let minAbsDist = Infinity;

    cards.forEach((card, idx) => {
      const centerP = cardCenterPoints[idx];
      const dist = progress - centerP;
      const u = dist / cardSpread; // -1 when entering from bottom-right, 0 when centered, +1 when leaving to top-left

      const absDist = Math.abs(dist);
      if (absDist < minAbsDist) {
        minAbsDist = absDist;
        activeIndex = idx;
      }

      if (u < -1.3 || u > 1.3) {
        // Offscreen
        card.style.opacity = '0';
        card.style.pointerEvents = 'none';
        card.style.visibility = 'hidden';
        return;
      }

      card.style.visibility = 'visible';

      // Diagonal motion kinematics:
      // Entering from bottom-right (u < 0): travelX > 0, travelY > 0, tilt > 0
      // Leaving to top-left (u > 0): travelX < 0, travelY < 0, tilt < 0
      const travelX = -u * 44; // in vw
      const travelY = -u * 28; // in vh
      const tilt = -u * 6.0;   // degrees slight tilt
      const scale = 1 - Math.min(Math.abs(u) * 0.1, 0.12);

      // Smooth opacity ramp:
      let opacity = 1;
      if (u < 0) {
        // Enters from bottom right: fades in smoothly between u = -1.0 and u = -0.25
        opacity = Math.max(0, Math.min(1, (u + 1.0) / 0.75));
      } else {
        // Leaves toward top left: fades out smoothly between u = +0.15 and u = +0.75
        // Disappears cleanly before it could ever reach the header text
        opacity = Math.max(0, Math.min(1, (0.75 - u) / 0.6));
      }

      // Dynamic z-index ensuring focused card is on top
      const zIdx = Math.round(50 - Math.abs(u) * 20);

      card.style.transform = `translate(-50%, -50%) translate3d(${travelX.toFixed(2)}vw, ${travelY.toFixed(2)}vh, 0) rotate(${tilt.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      card.style.opacity = opacity.toFixed(3);
      card.style.zIndex = zIdx;
      card.style.pointerEvents = opacity > 0.4 ? 'auto' : 'none';
    });

    // Update Stage Index Indicator & Dots
    if (cardsCurrentIdx) {
      cardsCurrentIdx.textContent = pad(activeIndex + 1);
    }

    cardDots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === activeIndex);
    });
  }

  // ==========================================================================
  // SECTION 2.5: EXPANDING 9:16 STATUE MONOLITH CONTROLLER (THE ART OF BEING SEEN)
  // - Starts as centered 9:16 portrait card with rounded corners on site cream (#F7F3EA)
  // - Centered Apollo statue (image 7.jpg) with object-fit: cover
  // - Restrained corner labels matching site typography
  // - Pinned while scrolling: labels fade and gently blur (0 -> 12px blur)
  // - Card smoothly expands to 16:9 full viewport (revealing wider sides without distortion)
  // - Gradually removes rounded corners (22px -> 0px)
  // - Once full-screen: fades in "The art of being seen.", description, and Explore button
  // - Reversible in both directions and unpins naturally into The Philosophy section
  // ==========================================================================
  const statueSection = document.getElementById('art-of-being-seen');
  const statueCard = document.getElementById('statue-card-container');
  const statueCornerLabels = document.querySelectorAll('.statue-corner-label');
  const statueEditorialReveal = document.getElementById('statue-editorial-reveal');
  const statueCinematicScrim = document.getElementById('statue-cinematic-scrim');

  function setupStatueExpand() {
    if (!statueSection || !statueCard) return;
    updateStatueExpandScroll();
  }

  function updateStatueExpandScroll() {
    if (!statueSection || !statueCard) return;

    const rect = statueSection.getBoundingClientRect();
    const totalScroll = statueSection.offsetHeight - window.innerHeight;
    if (totalScroll <= 0) return;

    const currentY = -rect.top;
    // Normalized progress [0.0 - 1.0]
    const progress = Math.min(Math.max(currentY / totalScroll, 0), 1);

    // Viewport dimensions
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Initial 9:16 portrait dimensions:
    let initialH, initialW;
    if (vw >= 768) {
      initialH = Math.min(vh * 0.70, 650);
      initialW = initialH * (9 / 16);
    } else {
      initialW = Math.min(vw * 0.78, 330);
      initialH = initialW * (16 / 9);
    }

    const initialRadius = 22; // px rounded corners

    // Phase 1: Card Expansion (progress 0.04 to 0.70)
    const expandStart = 0.04;
    const expandEnd = 0.70;
    const pExpand = Math.min(Math.max((progress - expandStart) / (expandEnd - expandStart), 0), 1);

    // Eased expansion progress (smooth cubic)
    const easeExpand = pExpand < 0.5 
      ? 2 * pExpand * pExpand 
      : 1 - Math.pow(-2 * pExpand + 2, 2) / 2;

    // 1. Surrounding Corner Labels:
    // Fade and gently blur during the first 35% of expansion
    const pLabels = Math.min(Math.max(pExpand / 0.35, 0), 1);
    const labelOpacity = 1 - pLabels;
    const labelBlur = pLabels * 12; // 0px to 12px blur
    const labelScale = 1 - pLabels * 0.06;

    statueCornerLabels.forEach((label) => {
      label.style.opacity = labelOpacity.toFixed(3);
      if (!isReducedMotion && labelBlur > 0.1) {
        label.style.filter = `blur(${labelBlur.toFixed(1)}px)`;
      } else {
        label.style.filter = 'none';
      }
      label.style.transform = `scale(${labelScale.toFixed(3)})`;
      label.style.visibility = labelOpacity <= 0.005 ? 'hidden' : 'visible';
    });

    // 2. Card Dimensions, Corner Radius & Box Shadow:
    // Card widens and height expands to fill viewport in 16:9
    // As container widens, image reveals wider sides without any distortion or stretching
    const currentW = initialW + (vw - initialW) * easeExpand;
    const currentH = initialH + (vh - initialH) * easeExpand;
    const currentRadius = initialRadius * (1 - easeExpand);
    const shadowAlpha = 0.35 * (1 - easeExpand);

    statueCard.style.width = `${currentW.toFixed(1)}px`;
    statueCard.style.height = `${currentH.toFixed(1)}px`;
    statueCard.style.borderRadius = `${currentRadius.toFixed(1)}px`;
    statueCard.style.boxShadow = shadowAlpha > 0.01 
      ? `0 35px 80px -15px rgba(22, 19, 15, ${shadowAlpha.toFixed(3)}), 0 15px 35px -10px rgba(22, 19, 15, ${(shadowAlpha * 0.5).toFixed(3)})` 
      : 'none';
    statueCard.style.border = currentRadius > 0.5 
      ? '1px solid rgba(212, 175, 55, 0.35)' 
      : 'none';

    // 3. Full-Screen Editorial Overlay (progress 0.70 to 0.95):
    // Fades in "The art of being seen.", description, and Explore button with subtle text shadows
    const overlayStart = 0.70;
    const overlayPeak = 0.92;
    const pOverlay = Math.min(Math.max((progress - overlayStart) / (overlayPeak - overlayStart), 0), 1);
    const easeOverlay = pOverlay * pOverlay * (3 - 2 * pOverlay); // smoothstep

    if (statueEditorialReveal) {
      const textOpacity = easeOverlay;
      const textTranslateY = (1 - easeOverlay) * 25;
      statueEditorialReveal.style.opacity = textOpacity.toFixed(3);
      statueEditorialReveal.style.transform = `translate3d(0, ${textTranslateY.toFixed(1)}px, 0)`;
      statueEditorialReveal.style.pointerEvents = textOpacity > 0.6 ? 'auto' : 'none';
    }

    if (statueCinematicScrim) {
      const scrimOpacity = easeOverlay * 0.85;
      statueCinematicScrim.style.opacity = scrimOpacity.toFixed(3);
    }
  }

  // ==========================================================================
  // CURSOR-FOLLOWING PARALLAX SYSTEM
  // - Applies subtle, restrained cursor parallax to:
  //   1) Opening hero image & scroll-driven hero video (.hero-parallax-canvas)
  //   2) Featured cards (.card-cream-body 3D tilt + .card-image parallax)
  //   3) Expanding statue card (#statue-card-img)
  //   4) Large images in other sections (.manifesto-img)
  // - Images scaled ~108% inside clipped overflow:hidden frames
  // - Move gently opposite the cursor with smooth weighted LERP easing
  // - Dedicated visual layers preserve video scroll control & timing
  // - On touch devices or reduced motion: kept centered & still
  // - Smoothly recenters when cursor leaves window
  // ==========================================================================
  let mouseTargetX = 0; // Normalized [-1.0, 1.0] from center
  let mouseTargetY = 0; // Normalized [-1.0, 1.0] from center
  let mouseCurrentX = 0;
  let mouseCurrentY = 0;
  const isTouchDevice = window.matchMedia('(hover: none), (pointer: coarse)').matches || ('ontouchstart' in window);

  const heroParallaxCanvas = document.getElementById('hero-parallax-canvas');
  const cardBodies = document.querySelectorAll('.card-cream-body');
  const cardImages = document.querySelectorAll('.card-image');
  const statueCardImg = document.getElementById('statue-card-img');
  const manifestoImg = document.querySelector('.manifesto-img');

  function setupCursorParallax() {
    if (isTouchDevice) return;

    window.addEventListener('mousemove', (e) => {
      if (isReducedMotion) return;
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      mouseTargetX = Math.max(-1, Math.min(1, (e.clientX - centerX) / centerX));
      mouseTargetY = Math.max(-1, Math.min(1, (e.clientY - centerY) / centerY));
    }, { passive: true });

    document.addEventListener('mouseleave', () => {
      mouseTargetX = 0;
      mouseTargetY = 0;
    });

    window.addEventListener('blur', () => {
      mouseTargetX = 0;
      mouseTargetY = 0;
    });
  }

  function updateCursorParallax() {
    if (isTouchDevice || isReducedMotion) {
      mouseTargetX = 0;
      mouseTargetY = 0;
    }

    // Smooth weighted LERP easing (0.075 delivers a buttery, luxury optical glide)
    const lerpEase = 0.075;
    mouseCurrentX += (mouseTargetX - mouseCurrentX) * lerpEase;
    mouseCurrentY += (mouseTargetY - mouseCurrentY) * lerpEase;

    const isAtRest = Math.abs(mouseCurrentX) < 0.0003 && Math.abs(mouseCurrentY) < 0.0003 && mouseTargetX === 0 && mouseTargetY === 0;

    // 1. Hero Parallax Canvas:
    // Moves opposite the cursor, isolating movement from video scroll control
    if (heroParallaxCanvas) {
      if (isAtRest) {
        heroParallaxCanvas.style.transform = 'translate3d(0, 0, 0)';
      } else {
        const heroX = -mouseCurrentX * 18; // px opposite cursor
        const heroY = -mouseCurrentY * 14; // px opposite cursor
        heroParallaxCanvas.style.transform = `translate3d(${heroX.toFixed(2)}px, ${heroY.toFixed(2)}px, 0)`;
      }
    }

    // 2. Featured Diagonal Cards:
    // Card body gets subtle 3D tilt for depth (max 2.2 deg X, 2.5 deg Y)
    // Card image gets subtle translation opposite cursor (max 10px X, 8px Y) inside clipped frame
    if (cardBodies.length > 0) {
      if (isAtRest) {
        cardBodies.forEach((body) => {
          body.style.transform = 'none';
        });
        cardImages.forEach((img) => {
          img.style.transform = 'scale(1.08) translate3d(0, 0, 0)';
        });
      } else {
        const tiltX = -mouseCurrentY * 2.2;
        const tiltY = mouseCurrentX * 2.5;
        const cardImgX = -mouseCurrentX * 10;
        const cardImgY = -mouseCurrentY * 8;

        cardBodies.forEach((body) => {
          body.style.transform = `perspective(900px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg)`;
        });

        cardImages.forEach((img) => {
          img.style.transform = `scale(1.08) translate3d(${cardImgX.toFixed(2)}px, ${cardImgY.toFixed(2)}px, 0)`;
        });
      }
    }

    // 3. Expanding Statue Monolith Card (#statue-card-img):
    // Moves gently opposite cursor inside its clipped container (max 14px X, 10px Y)
    if (statueCardImg) {
      if (isAtRest) {
        statueCardImg.style.transform = 'scale(1.08) translate3d(0, 0, 0)';
      } else {
        const statueImgX = -mouseCurrentX * 14;
        const statueImgY = -mouseCurrentY * 10;
        statueCardImg.style.transform = `scale(1.08) translate3d(${statueImgX.toFixed(2)}px, ${statueImgY.toFixed(2)}px, 0)`;
      }
    }

    // 4. Large Images in Other Sections (The Philosophy / #world-of-auren):
    if (manifestoImg) {
      if (isAtRest) {
        manifestoImg.style.transform = 'scale(1.08) translate3d(0, 0, 0)';
      } else {
        const manImgX = -mouseCurrentX * 14;
        const manImgY = -mouseCurrentY * 11;
        manifestoImg.style.transform = `scale(1.08) translate3d(${manImgX.toFixed(2)}px, ${manImgY.toFixed(2)}px, 0)`;
      }
    }
  }

  // Product Data & Quick View Modal (Updated for 1.jpg to 5.jpg)
  const products = {
    '1': {
      title: 'The Rose Sovereign Tuxedo',
      price: '€ 3,450',
      image: 'images/1.jpg',
      edition: 'LOOK 01 // VILLA FLORENCE',
      desc: 'Double-breasted pastel silk tailoring with sculpted Carrara marble lapels and fresh Florentine botanical corsage. Features hand-stitched silk lining and mother-of-pearl buttons.',
      sizes: ['S', 'M', 'L', 'XL']
    },
    '2': {
      title: 'The Tangerine Palazzo Suit',
      price: '€ 2,850',
      image: 'images/2.jpg',
      edition: 'LOOK 02 // PALAZZO BISTRO',
      desc: 'Lacquered amber calfskin streetwear suit with rolled cuffs, relaxed dropped-shoulder blazer, and high-top marble sneakers. Effortless neoclassical lounge posture.',
      sizes: ['S', 'M', 'L']
    },
    '3': {
      title: 'The Shaggy Cloud Overcoat',
      price: '€ 3,100',
      image: 'images/3.jpg',
      edition: 'LOOK 03 // PEDESTAL POP',
      desc: 'High-pile blush shearling coat paired with relaxed cotton joggers and citrus court high-tops. Designed for monumental volume and effortless street nonchalance.',
      sizes: ['S', 'M', 'L', 'XL']
    },
    '4': {
      title: 'The Emerald Salon Velvet',
      price: '€ 2,950',
      image: 'images/4.jpg',
      edition: 'LOOK 04 // THE ATELIER',
      desc: 'Deep moss velvet smoking suit with unbuttoned champagne silk faille shirt and gilded baroque accents. Cut with a generous relaxed trouser silhouette.',
      sizes: ['M', 'L', 'XL']
    },
    '5': {
      title: 'The Imperial Caesar Robe',
      price: '€ 4,600',
      image: 'images/5.jpg',
      edition: 'LOOK 05 // THE BASILICA',
      desc: 'Dusted rose fur mantle with hand-forged 24K gold laurel wreath and ceremonial sphinx shield. A crowning triumph of Florentine sculpture and modern couture.',
      sizes: ['M', 'L']
    }
  };

  function setupProductModals() {
    const modal = document.getElementById('product-modal');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const modalClose = document.getElementById('modal-close');
    const modalBody = document.getElementById('modal-body');

    if (!modal) return;

    document.querySelectorAll('.btn-quick-view, .btn-bag').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = btn.getAttribute('data-product');
        const prod = products[id];
        if (!prod) return;

        modalBody.innerHTML = `
          <div class="modal-grid">
            <div class="modal-media">
              <img src="${prod.image}" alt="${prod.title}">
            </div>
            <div class="modal-details">
              <div>
                <span class="product-edition-badge" style="position: static; display: inline-block; margin-bottom: 1rem;">${prod.edition}</span>
                <h3 class="modal-title">${prod.title}</h3>
                <div class="modal-price">${prod.price}</div>
                <p class="modal-desc">${prod.desc}</p>
                <div class="size-selector">
                  <span class="size-label">SELECT ATELIER SIZE:</span>
                  <div class="size-options">
                    ${prod.sizes.map((s, idx) => `<button class="size-btn ${idx === 1 ? 'active' : ''}">${s}</button>`).join('')}
                  </div>
                </div>
              </div>
              <button class="btn-modal-add" id="btn-modal-order">REQUEST ATELIER ALLOCATION ↗</button>
            </div>
          </div>
        `;

        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');

        // Modal size selection
        modalBody.querySelectorAll('.size-btn').forEach((sBtn) => {
          sBtn.addEventListener('click', () => {
            modalBody.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
            sBtn.classList.add('active');
          });
        });

        // Add action
        const orderBtn = document.getElementById('btn-modal-order');
        if (orderBtn) {
          orderBtn.addEventListener('click', () => {
            orderBtn.textContent = 'ALLOCATION CONFIRMED ✓';
            orderBtn.style.background = '#55E08F';
            orderBtn.style.color = '#0B0B0D';
            setTimeout(() => {
              modal.classList.remove('open');
              modal.setAttribute('aria-hidden', 'true');
            }, 1200);
          });
        }
      });
    });

    const closeModal = () => {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    };

    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (modalBackdrop) modalBackdrop.addEventListener('click', closeModal);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) {
        closeModal();
      }
    });
  }

  // VIP Salon Submission Handler
  window.handleVipSubmit = function () {
    const input = document.getElementById('vip-email');
    const status = document.getElementById('vip-status');
    const btn = document.getElementById('vip-submit-btn');

    if (!input || !input.value) return;

    btn.textContent = 'DISPATCHING...';
    btn.disabled = true;

    setTimeout(() => {
      btn.textContent = 'INVITATION SENT ✓';
      btn.style.background = '#55E08F';
      status.textContent = `A private invitation has been dispatched to ${input.value}. Welcome to the world of AUREN.`;
      input.value = '';
    }, 900);
  };

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
