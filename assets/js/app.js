// ==========================================================================
// ZALET MOTORSPORT STREETWEAR // CORE APPLICATION LOGIC
// ==========================================================================

(function() {
  'use strict';

  // --- STATE ---
  const state = {
    currency: localStorage.getItem('zalet_currency') || 'RSD',
    cart: JSON.parse(localStorage.getItem('zalet_cart') || '[]'),
    audioEnabled: localStorage.getItem('zalet_audio') === 'true',
    activeCategory: 'tees',
    activeProduct: null,
    selectedSize: 'M',
    selectedQty: 1,
    pdpImageIndex: 0,
    freeShippingThresholdRSD: 8000,
    freeShippingThresholdEUR: 70
  };

  // --- FORMULA 1 REAL ON-BOARD TEAM RADIO COMMS ---
  let audioCtx = null;
  const f1RadioTracks = [
    {
      id: 'max_box',
      driver: '1 VER // MAX VERSTAPPEN',
      team: 'ORACLE RED BULL RACING',
      audioSrc: 'assets/audio/radio_verstappen_box.mp3',
      text: "I've damaged the front wing. Do you need to box? Stay out, unless you've got big damage!",
      duration: 10500
    },
    {
      id: 'hamilton_box',
      driver: '44 HAM // LEWIS HAMILTON',
      team: 'MERCEDES-AMG PETRONAS',
      audioSrc: 'assets/audio/radio_hamilton_box.mp3',
      text: "Box, box, box, box! Do the opposite to Raikkonen, do the opposite!",
      duration: 6200
    },
    {
      id: 'max_push',
      driver: '1 VER // MAX VERSTAPPEN',
      team: 'ORACLE RED BULL RACING',
      audioSrc: 'assets/audio/radio_verstappen_push.mp3',
      text: "Well done, mate. Easy pickings! Let's push up.",
      duration: 6200
    },
    {
      id: 'ricciardo_box',
      driver: '3 RIC // DANIEL RICCIARDO',
      team: 'RED BULL RACING',
      audioSrc: 'assets/audio/radio_ricciardo_box.mp3',
      text: "Safety car, safety car! Box this lap Daniel, box this lap, box this lap!",
      duration: 7200
    },
    {
      id: 'alonso_box',
      driver: '14 ALO // FERNANDO ALONSO',
      team: 'ASTON MARTIN F1',
      audioSrc: 'assets/audio/radio_alonso_box.mp3',
      text: "Okay, I need to box! What a stupid guy, he closed the door on me!",
      duration: 8300
    },
    {
      id: 'pit_wall_box',
      driver: 'PIT WALL // RACE ENGINEER',
      team: 'SCUDERIA TORO ROSSO',
      audioSrc: 'assets/audio/radio_pit_call.mp3',
      text: "Box, box! Box this lap, box box!",
      duration: 2500
    }
  ];

  let currentRadioAudio = null;
  let radioTrackIndex = 0;
  let activeRadioToastTimeout = null;
  let activeRadioToastEl = null;

  function initAudio() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  // Pre-load voices if speech synthesis is present
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
      try { window.speechSynthesis.getVoices(); } catch(e) {}
    };
  }

  // Generate filtered radio static burst (PTT switch squelch)
  function playRadioStatic(startTime, duration = 0.18, volume = 0.14) {
    if (!audioCtx) return;
    try {
      const sampleRate = audioCtx.sampleRate;
      const bufferSize = Math.floor(sampleRate * duration);
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.85;
      }

      const whiteNoise = audioCtx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      // F1 Intercom Bandpass Filter (sharp telecommunication spectrum ~1200Hz - 3200Hz)
      const bandpass = audioCtx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(2200, startTime);
      bandpass.Q.setValueAtTime(2.4, startTime);

      const gainNode = audioCtx.createGain();
      gainNode.gain.setValueAtTime(volume, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      whiteNoise.connect(bandpass);
      bandpass.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      whiteNoise.start(startTime);
      whiteNoise.stop(startTime + duration);
    } catch (e) {
      console.warn('Radio static error:', e);
    }
  }

  // Generate low V6 Turbo Hybrid Cockpit Rumble during transmission
  function playCockpitEngineRumble(startTime, duration = 1.8) {
    if (!audioCtx) return;
    try {
      // V6 Engine Fundamental Tone (idling / braking into pit lane)
      const osc = audioCtx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(142, startTime);
      osc.frequency.linearRampToValueAtTime(126, startTime + duration);

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, startTime);

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.035, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);

      // MGU-K / Turbo spool whine
      const turbo = audioCtx.createOscillator();
      turbo.type = 'sine';
      turbo.frequency.setValueAtTime(2500, startTime);
      turbo.frequency.exponentialRampToValueAtTime(1750, startTime + duration);

      const turboGain = audioCtx.createGain();
      turboGain.gain.setValueAtTime(0.012, startTime);
      turboGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      turbo.connect(turboGain);
      turboGain.connect(audioCtx.destination);

      turbo.start(startTime);
      turbo.stop(startTime + duration);
    } catch (e) {
      console.warn('Engine rumble error:', e);
    }
  }

  // Roger Beep (FIA PTT release tone)
  function playRogerBeep(time) {
    if (!audioCtx) return;
    try {
      const roger = audioCtx.createOscillator();
      const rogerGain = audioCtx.createGain();
      roger.type = 'sine';
      roger.frequency.setValueAtTime(2150, time);
      rogerGain.gain.setValueAtTime(0.18, time);
      rogerGain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
      roger.connect(rogerGain);
      rogerGain.connect(audioCtx.destination);
      roger.start(time);
      roger.stop(time + 0.04);
    } catch (e) {
      console.warn('Roger beep error:', e);
    }
  }

  // Radio Disconnect / Mute Squelch
  function playRadioMuteSound() {
    initAudio();
    if (!audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      playRadioStatic(now, 0.15, 0.12);

      const desc = audioCtx.createOscillator();
      const descGain = audioCtx.createGain();
      desc.type = 'sine';
      desc.frequency.setValueAtTime(1400, now);
      desc.frequency.exponentialRampToValueAtTime(450, now + 0.08);
      descGain.gain.setValueAtTime(0.14, now);
      descGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      desc.connect(descGain);
      descGain.connect(audioCtx.destination);
      desc.start(now);
      desc.stop(now + 0.08);
    } catch (e) {
      console.warn('Radio mute error:', e);
    }
  }

  // Stop active radio transmission cleanly
  function stopCurrentRadio(playMute = false) {
    if (currentRadioAudio) {
      try {
        currentRadioAudio.pause();
        currentRadioAudio.currentTime = 0;
      } catch (e) {}
      currentRadioAudio = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
    if (activeRadioToastEl) {
      activeRadioToastEl.classList.remove('show');
      setTimeout(() => {
        if (activeRadioToastEl) activeRadioToastEl.remove();
        activeRadioToastEl = null;
      }, 350);
    }
    if (activeRadioToastTimeout) {
      clearTimeout(activeRadioToastTimeout);
      activeRadioToastTimeout = null;
    }
    if (playMute) {
      playRadioMuteSound();
    }
  }

  // Display Authentic F1 Team Radio Broadcast Graphic Toast
  function showF1RadioToast(driverName, teamName, radioQuote, durationMs = 6000) {
    if (!DOM.toastContainer) return;
    if (activeRadioToastEl) {
      activeRadioToastEl.remove();
      activeRadioToastEl = null;
    }
    const toast = document.createElement('div');
    toast.className = 'toast toast-f1-radio';
    toast.innerHTML = `
      <div class="f1-radio-header">
        <span class="f1-radio-badge">TEAM RADIO</span>
        <span class="f1-live-dot"></span>
        <span class="f1-driver-tag">${driverName}</span>
        <span class="f1-team-tag">${teamName}</span>
        <span class="f1-channel">PIT WALL // 462.55 MHz</span>
      </div>
      <div class="f1-radio-body">
        <span class="f1-radio-waves">
          <span></span><span></span><span></span><span></span>
        </span>
        <span class="f1-radio-quote">"${radioQuote}"</span>
      </div>
    `;
    DOM.toastContainer.appendChild(toast);
    activeRadioToastEl = toast;

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    activeRadioToastTimeout = setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (activeRadioToastEl === toast) activeRadioToastEl = null;
        toast.remove();
      }, 400);
    }, durationMs);
  }

  // Fallback Voice Transmission if audio file is blocked or unsupported
  function fallbackRadioTTS(track) {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(track.text);
      utterance.rate = 1.15;
      utterance.pitch = 0.95;
      utterance.volume = 1.0;
      utterance.onend = () => {
        if (audioCtx) {
          const endNow = audioCtx.currentTime;
          playRadioStatic(endNow, 0.12, 0.12);
          playRogerBeep(endNow + 0.03);
        }
      };
      window.speechSynthesis.speak(utterance);
    }
  }

  // Main F1 Team Radio Transmission Trigger (Plays Real On-Board Cockpit Audio)
  function playF1PitRadioCall() {
    try {
      initAudio();
      stopCurrentRadio(false);

      const track = f1RadioTracks[radioTrackIndex % f1RadioTracks.length];
      radioTrackIndex++;

      const now = audioCtx ? audioCtx.currentTime : 0;

      // 1. Iconic F1 Team Radio Graphic Dual-Chirp (FIA TV Graphic Tone)
      if (audioCtx) {
        const beep1 = audioCtx.createOscillator();
        const beep1Gain = audioCtx.createGain();
        beep1.type = 'sine';
        beep1.frequency.setValueAtTime(1760, now); // A6
        beep1Gain.gain.setValueAtTime(0.20, now);
        beep1Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
        beep1.connect(beep1Gain);
        beep1Gain.connect(audioCtx.destination);
        beep1.start(now);
        beep1.stop(now + 0.045);

        const beep2 = audioCtx.createOscillator();
        const beep2Gain = audioCtx.createGain();
        beep2.type = 'sine';
        beep2.frequency.setValueAtTime(2349, now + 0.048); // D7
        beep2Gain.gain.setValueAtTime(0.22, now + 0.048);
        beep2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
        beep2.connect(beep2Gain);
        beep2Gain.connect(audioCtx.destination);
        beep2.start(now + 0.048);
        beep2.stop(now + 0.11);

        playRadioStatic(now + 0.08, 0.18, 0.14);
      }

      // 2. Display F1 Team Radio HUD Broadcast Toast
      const displayDuration = (track.duration || 6000) + 1200;
      showF1RadioToast(track.driver, track.team, track.text, displayDuration);

      // 3. Play the REAL F1 Cockpit Radio Recording
      const audio = new Audio(track.audioSrc);
      audio.volume = 1.0;
      currentRadioAudio = audio;

      let rogerBeepPlayed = false;
      function onClipEnd() {
        if (!rogerBeepPlayed) {
          rogerBeepPlayed = true;
          if (audioCtx) {
            const endNow = audioCtx.currentTime;
            playRadioStatic(endNow, 0.12, 0.12);
            playRogerBeep(endNow + 0.02);
          }
        }
        if (currentRadioAudio === audio) {
          currentRadioAudio = null;
        }
      }

      if (track.duration) {
        setTimeout(() => {
          if (currentRadioAudio === audio) {
            audio.pause();
            onClipEnd();
          }
        }, track.duration);
      }

      audio.addEventListener('ended', onClipEnd);

      // Play real audio right as intro chime finishes
      setTimeout(() => {
        audio.play().catch(err => {
          console.warn('Real audio file playback note:', err);
          fallbackRadioTTS(track);
        });
      }, 120);

    } catch (err) {
      console.warn('F1 Radio transmission error:', err);
    }
  }

  // General Sound Effects for Site Haptics
  function playSound(type = 'click') {
    if (!state.audioEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;

      const now = audioCtx.currentTime;

      if (type === 'click') {
        oscillatorClick(now);
      } else if (type === 'add') {
        oscillatorAdd(now);
      } else if (type === 'telemetry') {
        oscillatorTelemetry(now);
      }
    } catch (e) {
      console.warn('Audio notice:', e);
    }
  }

  function oscillatorClick(now) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  function oscillatorAdd(now) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.12);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  function oscillatorTelemetry(now) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.setValueAtTime(1600, now + 0.03);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  // --- PRICE FORMATTER ---
  function formatPrice(priceRSD, priceEUR) {
    if (state.currency === 'EUR') {
      return `€${priceEUR.toFixed(2)}`;
    }
    return `${priceRSD.toLocaleString('sr-RS')} RSD`;
  }

  function getActivePrice(product) {
    return state.currency === 'EUR' ? product.priceEUR : product.priceRSD;
  }

  function getSecondaryPrice(product) {
    if (state.currency === 'EUR') {
      return `${product.priceRSD.toLocaleString('sr-RS')} RSD`;
    }
    return `~€${product.priceEUR.toFixed(2)}`;
  }

  // --- DOM CACHE ---
  const DOM = {
    productsGrid: document.getElementById('productsGrid'),
    filterBtns: document.querySelectorAll('.filter-btn'),
    currencyBtns: document.querySelectorAll('.currency-btn'),
    audioToggleBtn: document.getElementById('audioToggleBtn'),
    cartTriggerBtn: document.getElementById('cartTriggerBtn'),
    cartBadge: document.getElementById('cartBadge'),
    cartDrawerOverlay: document.getElementById('cartDrawerOverlay'),
    cartDrawer: document.getElementById('cartDrawer'),
    cartCloseBtn: document.getElementById('cartCloseBtn'),
    cartNotifBanner: document.getElementById('cartNotifBanner'),
    cartNotifItem: document.getElementById('cartNotifItem'),
    cartItemsList: document.getElementById('cartItemsList'),
    cartSubtotalVal: document.getElementById('cartSubtotalVal'),
    cartTotalCountVal: document.getElementById('cartTotalCountVal'),
    cartShippingMeterFill: document.getElementById('cartShippingMeterFill'),
    cartShippingMeterText: document.getElementById('cartShippingMeterText'),
    proceedCheckoutBtn: document.getElementById('proceedCheckoutBtn'),
    cartContinueShoppingBtn: document.getElementById('cartContinueShoppingBtn'),
    cartInstagramDmBtn: document.getElementById('cartInstagramDmBtn'),
    
    // PDP Elements
    pdpOverlay: document.getElementById('pdpOverlay'),
    pdpCloseBtn: document.getElementById('pdpCloseBtn'),
    pdpMainImageWrap: document.getElementById('pdpMainImageWrap'),
    pdpMainImage: document.getElementById('pdpMainImage'),
    pdpThumbnailsRow: document.getElementById('pdpThumbnailsRow'),
    pdpPrevImgBtn: document.getElementById('pdpPrevImgBtn'),
    pdpNextImgBtn: document.getElementById('pdpNextImgBtn'),
    pdpBreadcrumbs: document.getElementById('pdpBreadcrumbs'),
    pdpTitle: document.getElementById('pdpTitle'),
    pdpSku: document.getElementById('pdpSku'),
    pdpEditionBadge: document.getElementById('pdpEditionBadge'),
    pdpPriceMain: document.getElementById('pdpPriceMain'),
    pdpPriceSecondary: document.getElementById('pdpPriceSecondary'),
    pdpDescription: document.getElementById('pdpDescription'),
    pdpSizeOptions: document.getElementById('pdpSizeOptions'),
    pdpStockStatus: document.getElementById('pdpStockStatus'),
    pdpQtyMinus: document.getElementById('pdpQtyMinus'),
    pdpQtyPlus: document.getElementById('pdpQtyPlus'),
    pdpQtyDisplay: document.getElementById('pdpQtyDisplay'),
    pdpAddBtn: document.getElementById('pdpAddBtn'),
    pdpDmBtn: document.getElementById('pdpDmBtn'),
    pdpAccordions: document.getElementById('pdpAccordions'),
    pdpSizeGuideTrigger: document.getElementById('pdpSizeGuideTrigger'),

    // Checkout Modal
    checkoutModalOverlay: document.getElementById('checkoutModalOverlay'),
    checkoutCloseBtn: document.getElementById('checkoutCloseBtn'),
    checkoutForm: document.getElementById('checkoutForm'),
    checkoutSubmitBtn: document.getElementById('checkoutSubmitBtn'),
    checkoutErrorBox: document.getElementById('checkoutErrorBox'),
    checkoutErrorMessage: document.getElementById('checkoutErrorMessage'),
    checkoutRetryBtn: document.getElementById('checkoutRetryBtn'),
    checkoutCopyErrorOrderBtn: document.getElementById('checkoutCopyErrorOrderBtn'),
    checkoutInstagramFallbackBtn: document.getElementById('checkoutInstagramFallbackBtn'),
    checkoutSubtotal: document.getElementById('checkoutSubtotal'),
    checkoutShipping: document.getElementById('checkoutShipping'),
    checkoutTotal: document.getElementById('checkoutTotal'),
    orderSuccessBox: document.getElementById('orderSuccessBox'),
    orderSummaryWrap: document.getElementById('orderSummaryWrap'),

    // DM Modal
    dmModalOverlay: document.getElementById('dmModalOverlay'),
    dmModalCloseBtn: document.getElementById('dmModalCloseBtn'),
    dmTemplateBox: document.getElementById('dmTemplateBox'),
    copyDmTemplateBtn: document.getElementById('copyDmTemplateBtn'),
    directInstagramLink: document.getElementById('directInstagramLink'),

    // Size Guide Modal
    sizeGuideModalOverlay: document.getElementById('sizeGuideModalOverlay'),
    sizeGuideCloseBtn: document.getElementById('sizeGuideCloseBtn'),
    sizeHeightSlider: document.getElementById('sizeHeightSlider'),
    sizeWeightSlider: document.getElementById('sizeWeightSlider'),
    heightValDisplay: document.getElementById('heightValDisplay'),
    weightValDisplay: document.getElementById('weightValDisplay'),
    calcRecommendedSize: document.getElementById('calcRecommendedSize'),
    calcAdviceText: document.getElementById('calcAdviceText'),

    // Mobile Navigation
    mobileMenuBtn: document.getElementById('mobileMenuBtn'),
    mobileNavDrawer: document.getElementById('mobileNavDrawer'),
    mobileNavCloseBtn: document.getElementById('mobileNavCloseBtn'),
    mobileNavLinks: document.querySelectorAll('.mobile-nav-item a'),

    // Telemetry Clock
    liveClockEl: document.getElementById('liveClockEl'),

    // Toast Container
    toastContainer: document.getElementById('toastContainer')
  };

  // --- RENDER PRODUCTS CATALOG ---
  function renderProducts() {
    if (!DOM.productsGrid) return;

    const filtered = PRODUCTS_DATA.filter(prod => {
      if (state.activeCategory === 'tees') return prod.category === 'tees';
      if (state.activeCategory === 'hoodies') return prod.category === 'hoodies';
      if (state.activeCategory === 'all') return true;
      return prod.category === state.activeCategory;
    });

    DOM.productsGrid.innerHTML = filtered.map(prod => {
      const priceMain = formatPrice(prod.priceRSD, prod.priceEUR);
      const priceSecondary = getSecondaryPrice(prod);
      const secondaryImg = prod.hoverImage || (prod.images && prod.images[1]) || (prod.images && prod.images[0]);

      return `
        <article class="product-card" data-id="${prod.id}">
          <div class="card-crosshair card-crosshair-tl"></div>
          <div class="card-crosshair card-crosshair-tr"></div>
          <div class="card-crosshair card-crosshair-bl"></div>
          <div class="card-crosshair card-crosshair-br"></div>

          <div class="card-media-wrap" data-action="quickview" data-id="${prod.id}">
            <div class="card-badge-row">
              <span class="card-badge badge-highlight">${prod.badges[0] || 'DROP 01'}</span>
              <span class="card-badge">${prod.badges[1] || 'LIMITIRANO'}</span>
              <span class="card-badge">${prod.badges[2] || 'PREMIUM PAMUK'}</span>
            </div>

            <img class="card-img-primary" src="${prod.images[0]}" alt="${prod.title}" loading="lazy" width="600" height="600">
            <img class="card-img-secondary" src="${secondaryImg}" alt="${prod.title} Druga strana" loading="lazy" width="600" height="600">

            <button type="button" class="card-flip-btn" data-action="flip-card" aria-label="Okreni komad">
              <span>⇄ OKRENI</span>
            </button>

            <div class="hover-swap-indicator font-mono">
              <span>// DRUGI UGAO</span>
            </div>

            <div class="card-quick-actions" onclick="event.stopPropagation()">
              <div class="quick-size-pills">
                <span class="mono-tag" style="color: #FFF; font-size: 0.65rem;">BRZI IZBOR:</span>
                ${['S', 'M', 'L', 'XL', 'XXL'].map(size => `
                  <button type="button" class="size-pill" data-action="quick-add" data-id="${prod.id}" data-size="${size}">${size}</button>
                `).join('')}
              </div>
              <div class="quick-btns-row">
                <button type="button" class="btn-card-quickview" data-action="quickview" data-id="${prod.id}">
                  DODAJ U KORPU
                </button>
                <button type="button" class="btn-card-dm" data-action="dm-order" data-id="${prod.id}">
                  PORUČIVANJE PREKO INSTAGRAMA
                </button>
              </div>
            </div>
          </div>

          <div class="card-content">
            <div class="card-meta-top">
              <span class="card-sku">${prod.sku}</span>
              <span class="card-density">${prod.telemetry ? prod.telemetry.density : '100% PAMUK'}</span>
            </div>

            <h3 class="card-title" data-action="quickview" data-id="${prod.id}">
              ${prod.title}
            </h3>

            <div class="card-bottom-row">
              <div class="card-price-wrap">
                <span class="card-price">${priceMain}</span>
                <span class="card-secondary-price">${priceSecondary}</span>
              </div>
              <div class="card-action-btns">
                <button type="button" class="card-btn-action card-btn-cart" data-action="quickview" data-id="${prod.id}" title="Dodaj u korpu">
                  <span>DODAJ U KORPU</span>
                </button>
                <button type="button" class="card-btn-action card-btn-dm" data-action="dm-order" data-id="${prod.id}" title="Poručivanje preko Instagrama">
                  <span>PORUČIVANJE PREKO INSTAGRAMA</span>
                </button>
              </div>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  // --- TOAST NOTIFICATIONS ---
  function showToast(message) {
    if (!DOM.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <span style="color: var(--accent-orange); font-weight: 700;">// ZALET:</span>
      <span>${message}</span>
    `;
    DOM.toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 3200);
  }

  // --- CART MANAGEMENT ---
  function saveCart() {
    localStorage.setItem('zalet_cart', JSON.stringify(state.cart));
    updateCartUI();
  }

  function addToCart(productId, size = 'M', quantity = 1) {
    const product = PRODUCTS_DATA.find(p => p.id === productId);
    if (!product) return;

    const existingIndex = state.cart.findIndex(item => item.productId === productId && item.size === size);

    if (existingIndex > -1) {
      state.cart[existingIndex].quantity += quantity;
    } else {
      state.cart.push({
        productId: product.id,
        sku: product.sku,
        title: product.title,
        size: size,
        quantity: quantity,
        priceRSD: product.priceRSD,
        priceEUR: product.priceEUR,
        image: product.images[0]
      });
    }

    saveCart();
    playSound('add');
    showToast(`${product.title} (VELIČINA ${size}) DODATO U KORPU`);

    // Animate badge
    if (DOM.cartBadge) {
      DOM.cartBadge.classList.add('bounce');
      setTimeout(() => DOM.cartBadge.classList.remove('bounce'), 350);
    }

    // Show Confirmation in Cart Drawer and Open Slider sa strane
    if (DOM.cartNotifBanner && DOM.cartNotifItem) {
      DOM.cartNotifItem.textContent = `${product.title} // Veličina: ${size} (${quantity} kom.)`;
      DOM.cartNotifBanner.style.display = 'flex';
    }

    if (DOM.cartDrawerOverlay) {
      DOM.cartDrawerOverlay.classList.add('open');
      document.body.classList.add('lock-scroll');
    }
  }

  function removeFromCart(index) {
    playSound('click');
    state.cart.splice(index, 1);
    saveCart();
  }

  function updateCartQty(index, delta) {
    playSound('click');
    if (state.cart[index]) {
      state.cart[index].quantity += delta;
      if (state.cart[index].quantity <= 0) {
        state.cart.splice(index, 1);
      }
      saveCart();
    }
  }

  function calculateCartTotals() {
    let totalRSD = 0;
    let totalEUR = 0;
    let count = 0;

    state.cart.forEach(item => {
      totalRSD += item.priceRSD * item.quantity;
      totalEUR += item.priceEUR * item.quantity;
      count += item.quantity;
    });

    return { totalRSD, totalEUR, count };
  }

  function updateCartUI() {
    const { totalRSD, totalEUR, count } = calculateCartTotals();

    // Badge
    if (DOM.cartBadge) {
      DOM.cartBadge.textContent = count;
    }

    // Total quantity count in drawer
    if (DOM.cartTotalCountVal) {
      DOM.cartTotalCountVal.textContent = `${count} ${count === 1 ? 'komad' : 'komada'}`;
    }

    // Subtotal in drawer
    if (DOM.cartSubtotalVal) {
      DOM.cartSubtotalVal.textContent = formatPrice(totalRSD, totalEUR);
    }

    // Shipping Meter
    if (DOM.cartShippingMeterFill && DOM.cartShippingMeterText) {
      const threshold = state.currency === 'EUR' ? state.freeShippingThresholdEUR : state.freeShippingThresholdRSD;
      const current = state.currency === 'EUR' ? totalEUR : totalRSD;
      const percentage = Math.min(100, Math.round((current / threshold) * 100));

      DOM.cartShippingMeterFill.style.width = `${percentage}%`;

      if (current >= threshold) {
        DOM.cartShippingMeterText.innerHTML = `
          <span style="color: var(--accent-green-telemetry);">✓ BESPLATNA DOSTAVA NA KUĆNU ADRESU OSTVARENA!</span>
          <span>100%</span>
        `;
        DOM.cartShippingMeterFill.style.backgroundColor = 'var(--accent-green-telemetry)';
      } else {
        const remaining = threshold - current;
        const formattedRemaining = state.currency === 'EUR' ? `€${remaining.toFixed(2)}` : `${remaining.toLocaleString('sr-RS')} RSD`;
        DOM.cartShippingMeterText.innerHTML = `
          <span>DODAJ JOŠ <strong>${formattedRemaining}</strong> ZA BESPLATNU DOSTAVU</span>
          <span>${percentage}%</span>
        `;
        DOM.cartShippingMeterFill.style.backgroundColor = 'var(--accent-orange)';
      }
    }

    // Items list
    if (DOM.cartItemsList) {
      if (state.cart.length === 0) {
        if (DOM.cartNotifBanner) DOM.cartNotifBanner.style.display = 'none';
        DOM.cartItemsList.innerHTML = `
          <div class="cart-empty-state">
            <span style="font-family: var(--font-brand); font-size: 2.2rem; color: #333;">ZL//00</span>
            <p style="font-family: var(--font-display); font-size: 0.85rem; color: var(--text-white);">VAŠA KORPA JE TRENUTNO PRAZNA</p>
            <p style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-gray-muted);">Istražite Drop 01 komade od teškog pamuka i osigurajte svoju veličinu na vreme.</p>
            <button type="button" class="btn-secondary" style="font-size: 0.75rem; padding: 10px 18px;" onclick="document.getElementById('cartDrawerOverlay').classList.remove('open'); document.body.classList.remove('lock-scroll');">POVRATAK U PRODAVNICU</button>
          </div>
        `;
        if (DOM.proceedCheckoutBtn) DOM.proceedCheckoutBtn.disabled = true;
      } else {
        DOM.cartItemsList.innerHTML = state.cart.map((item, index) => {
          const itemPriceFormatted = formatPrice(item.priceRSD * item.quantity, item.priceEUR * item.quantity);
          const singlePriceFormatted = formatPrice(item.priceRSD, item.priceEUR);
          return `
            <div class="cart-item">
              <img class="cart-item-thumb" src="${item.image}" alt="${item.title}">
              <div class="cart-item-info">
                <span class="mono-tag" style="color: var(--accent-orange); font-size: 0.65rem;">${item.sku}</span>
                <h4 class="cart-item-title" style="margin: 2px 0 4px; font-size: 0.9rem;">${item.title}</h4>
                <div style="font-family: var(--font-mono); font-size: 0.74rem; color: var(--text-gray-light); display: flex; flex-direction: column; gap: 3px;">
                  <div>ODABRANA VELIČINA: <strong style="color: #fff;">${item.size}</strong></div>
                  <div>CENA: <strong style="color: #fff;">${item.quantity > 1 ? `${singlePriceFormatted} × ${item.quantity} = ${itemPriceFormatted}` : singlePriceFormatted}</strong></div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
                  <button type="button" class="size-pill" style="padding: 2px 8px; font-size: 0.7rem;" onclick="window.ZaletApp.updateCartQty(${index}, -1)" aria-label="Smanji količinu">-</button>
                  <span style="font-family: var(--font-mono); font-size: 0.78rem; font-weight: 700;">${item.quantity}</span>
                  <button type="button" class="size-pill" style="padding: 2px 8px; font-size: 0.7rem;" onclick="window.ZaletApp.updateCartQty(${index}, 1)" aria-label="Povećaj količinu">+</button>
                </div>
              </div>
              <div class="cart-item-actions">
                <button type="button" class="cart-remove-btn" onclick="window.ZaletApp.removeFromCart(${index})" title="Ukloni artikal">UKLONI [✕]</button>
              </div>
            </div>
          `;
        }).join('');
        if (DOM.proceedCheckoutBtn) DOM.proceedCheckoutBtn.disabled = false;
      }
    }
  }

  // --- DEDICATED PRODUCT DETAIL VIEW (PDP) ---
  function openPdp(productId) {
    const product = PRODUCTS_DATA.find(p => p.id === productId);
    if (!product) return;

    playSound('telemetry');
    state.activeProduct = product;
    state.pdpImageIndex = 0;
    state.selectedSize = 'M';
    state.selectedQty = 1;

    // Hash routing
    history.pushState(null, null, `#product/${product.id}`);

    // Update gallery
    renderPdpGallery();

    // Populate meta
    if (DOM.pdpBreadcrumbs) {
      DOM.pdpBreadcrumbs.textContent = `ZALET // ARCHIVE // DROP 01 // ${product.sku}`;
    }
    if (DOM.pdpTitle) {
      DOM.pdpTitle.textContent = product.title;
    }
    if (DOM.pdpSku) {
      DOM.pdpSku.textContent = `${product.sku} // ${product.telemetry.chassis}`;
    }
    if (DOM.pdpEditionBadge) {
      DOM.pdpEditionBadge.textContent = product.telemetry.edition;
    }
    if (DOM.pdpPriceMain) {
      DOM.pdpPriceMain.textContent = formatPrice(product.priceRSD, product.priceEUR);
    }
    if (DOM.pdpPriceSecondary) {
      DOM.pdpPriceSecondary.textContent = getSecondaryPrice(product);
    }
    if (DOM.pdpDescription) {
      DOM.pdpDescription.textContent = product.description;
    }
    if (DOM.pdpQtyDisplay) {
      DOM.pdpQtyDisplay.textContent = state.selectedQty;
    }

    // Render Sizing Options
    renderPdpSizes();

    // Render Accordions
    renderPdpAccordions(product);

    // Update DM button
    if (DOM.pdpDmBtn) {
      DOM.pdpDmBtn.onclick = () => openDmModalForProduct(product, state.selectedSize, state.selectedQty);
    }

    // Show Overlay
    DOM.pdpOverlay.classList.add('open');
    document.body.classList.add('lock-scroll');
  }

  function closePdp() {
    playSound('click');
    DOM.pdpOverlay.classList.remove('open');
    document.body.classList.remove('lock-scroll');
    if (window.location.hash.startsWith('#product/')) {
      history.pushState(null, null, ' ');
    }
  }

  function renderPdpGallery() {
    const product = state.activeProduct;
    if (!product) return;

    if (DOM.pdpMainImageWrap) {
      DOM.pdpMainImageWrap.classList.remove('zoomed');
    }
    if (DOM.pdpMainImage) {
      DOM.pdpMainImage.style.transformOrigin = 'center center';
    }

    const currentImg = product.images[state.pdpImageIndex] || product.images[0];
    DOM.pdpMainImage.src = currentImg;
    DOM.pdpMainImage.alt = `${product.title} - View ${state.pdpImageIndex + 1}`;

    // Thumbnails
    DOM.pdpThumbnailsRow.innerHTML = product.images.map((img, idx) => `
      <div class="pdp-thumb-item ${idx === state.pdpImageIndex ? 'active' : ''}" data-index="${idx}">
        <img src="${img}" alt="Thumbnail ${idx + 1}">
      </div>
    `).join('');

    DOM.pdpThumbnailsRow.querySelectorAll('.pdp-thumb-item').forEach(thumb => {
      thumb.addEventListener('click', (e) => {
        const idx = parseInt(thumb.getAttribute('data-index'), 10);
        state.pdpImageIndex = idx;
        renderPdpGallery();
        playSound('click');
      });
    });
  }

  function renderPdpSizes() {
    const sizes = ['S', 'M', 'L', 'XL', 'XXL'];
    DOM.pdpSizeOptions.innerHTML = sizes.map(sz => `
      <button type="button" class="pdp-size-btn ${sz === state.selectedSize ? 'active' : ''}" data-size="${sz}">
        ${sz}
      </button>
    `).join('');

    DOM.pdpSizeOptions.querySelectorAll('.pdp-size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.selectedSize = btn.getAttribute('data-size');
        renderPdpSizes();
        playSound('click');
        if (DOM.pdpStockStatus) {
          DOM.pdpStockStatus.textContent = `// VELIČINA ${state.selectedSize}: NA STANJU I SPREMNO ZA SLANJE`;
        }
      });
    });
  }

  function renderPdpAccordions(product) {
    const m = product.measurements;
    let tableHtml = '';
    if (m && m.rows) {
      tableHtml = `
        <div class="table-responsive">
          <table class="spec-table">
            <thead>
              <tr>${m.columns.map(c => `<th>${c}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${m.rows.map(row => `
                <tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    DOM.pdpAccordions.innerHTML = `
      <div class="accordion-item open">
        <button type="button" class="accordion-trigger">
          <span>// 01. TABELA VELIČINA I DIMENZIJE (CM)</span>
          <span class="accordion-icon">+</span>
        </button>
        <div class="accordion-content">
          <p style="margin-bottom: 8px;">${product.fitAdvice}</p>
          ${tableHtml}
          <p style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--accent-orange);">* Sve dimenzije su izražene u centimetrima. Tolerancija: ±1cm.</p>
        </div>
      </div>

      <div class="accordion-item">
        <button type="button" class="accordion-trigger">
          <span>// 02. SASTAV MATERIJALA I ODRŽAVANJE</span>
          <span class="accordion-icon">+</span>
        </button>
        <div class="accordion-content">
          <ul style="padding-left: 20px; display: flex; flex-direction: column; gap: 6px; font-family: var(--font-mono); font-size: 0.78rem;">
            <li><strong>Sastav:</strong> ${product.specs.composition}</li>
            <li><strong>Težina pamuka:</strong> ${product.specs.weight}</li>
            <li><strong>Obrada:</strong> ${product.specs.finish}</li>
            <li><strong>Tehnika štampe:</strong> ${product.specs.print}</li>
            <li><strong>Održavanje:</strong> Mašinsko pranje na 30°C izvrnuto naopako sa sličnim bojama. Ne sušiti u mašini za sušenje. Peglati sa unutrašnje strane, dalje od štampe.</li>
          </ul>
        </div>
      </div>

      <div class="accordion-item">
        <button type="button" class="accordion-trigger">
          <span>// 03. DOSTAVA NA KUĆNU ADRESU I ZAMENA</span>
          <span class="accordion-icon">+</span>
        </button>
        <div class="accordion-content">
          <div style="font-family: var(--font-mono); font-size: 0.78rem; display: flex; flex-direction: column; gap: 8px;">
            <p><strong>Domaće slanje (Srbija):</strong> Šaljemo istog dana ili narednog jutra putem usluge dostave na kućnu adresu. Isporuka u roku od 24-48h direktno na vaša vrata.</p>
            <p><strong>Plaćanje:</strong> Gotovinom kuriru pri preuzimanju paketa (pouzećem).</p>
            <p><strong>Zamena u roku od 14 dana:</strong> Jednostavna zamena veličine ukoliko je komad nenošen sa originalnim etiketama.</p>
          </div>
        </div>
      </div>
    `;

    // Accordion toggle events
    DOM.pdpAccordions.querySelectorAll('.accordion-trigger').forEach(trigger => {
      trigger.addEventListener('click', () => {
        const item = trigger.closest('.accordion-item');
        item.classList.toggle('open');
        playSound('click');
      });
    });
  }

  // --- INSTAGRAM DM ORDER ASSISTANT ---
  function openDmModalForProduct(productOrId, size = 'L', qty = 1) {
    const product = typeof productOrId === 'string' ? getProductById(productOrId) : productOrId;
    if (!product) return;
    const priceText = formatPrice(product.priceRSD * qty, product.priceEUR * qty);
    const template = 
`Pozdrav @zaletclub! Želim da poručim artikal:
------------------------------------------
ARTIKAL: ${product.title}
ŠIFRA: ${product.sku}
VELIČINA: ${size}
KOLIČINA: ${qty}
CENA: ${priceText}
------------------------------------------
PODACI ZA SLANJE (Dostava na kućnu adresu):
Ime i Prezime: [Upišite vaše ime i prezime]
Broj telefona: [Upišite kontakt telefon]
Grad i Poštanski broj: [Npr. Beograd 11000]
Ulica i broj stana: [Upišite adresu]
Način plaćanja: Plaćanje pouzećem kuriru`;

    DOM.dmTemplateBox.textContent = template;
    DOM.directInstagramLink.href = 'https://www.instagram.com/zaletclub/';
    DOM.dmModalOverlay.classList.add('open');
    document.body.classList.add('lock-scroll');
    playSound('telemetry');
  }

  function openDmModalForCart() {
    const { totalRSD, totalEUR, count } = calculateCartTotals();
    if (state.cart.length === 0) {
      showToast('PIT BAG IS EMPTY');
      return;
    }

    const itemsText = state.cart.map(item => `• ${item.title} (Vel: ${item.size}, Kol: ${item.quantity}) - ${formatPrice(item.priceRSD * item.quantity, item.priceEUR * item.quantity)}`).join('\n');
    const priceText = formatPrice(totalRSD, totalEUR);

    const template = 
`Pozdrav @zaletclub! Želim da poručim artikle iz korpe:
------------------------------------------
${itemsText}
------------------------------------------
UKUPNO ZA NAPLATU: ${priceText}
DOSTAVA: Dostava na kućnu adresu (24-48h)
------------------------------------------
PODACI ZA SLANJE:
Ime i Prezime: [Upišite vaše ime i prezime]
Broj telefona: [Upišite kontakt telefon]
Grad i Poštanski broj: [Npr. Novi Sad 21000]
Ulica i broj: [Upišite adresu]
Plaćanje: Pouzećem`;

    DOM.dmTemplateBox.textContent = template;
    DOM.directInstagramLink.href = 'https://www.instagram.com/zaletclub/';
    DOM.dmModalOverlay.classList.add('open');
    document.body.classList.add('lock-scroll');
    playSound('telemetry');
  }

  // --- CHECKOUT MODAL LOGIC ---
  function openCheckoutModal() {
    const { totalRSD, totalEUR } = calculateCartTotals();
    if (state.cart.length === 0) {
      showToast('PIT BAG IS EMPTY');
      return;
    }

    const isFree = state.currency === 'EUR' ? totalEUR >= state.freeShippingThresholdEUR : totalRSD >= state.freeShippingThresholdRSD;
    const shippingFeeRSD = isFree ? 0 : 350;
    const shippingFeeEUR = isFree ? 0 : 3.5;

    const grandTotalRSD = totalRSD + shippingFeeRSD;
    const grandTotalEUR = totalEUR + shippingFeeEUR;

    DOM.checkoutSubtotal.textContent = formatPrice(totalRSD, totalEUR);
    DOM.checkoutShipping.textContent = isFree ? 'BESPLATNO (0 RSD)' : (state.currency === 'EUR' ? '€3.50' : '350 RSD');
    DOM.checkoutTotal.textContent = formatPrice(grandTotalRSD, grandTotalEUR);

    DOM.checkoutForm.style.display = 'flex';
    if (DOM.checkoutSubmitBtn) {
      DOM.checkoutSubmitBtn.disabled = false;
      DOM.checkoutSubmitBtn.innerHTML = 'POTVRDI PORUDŽBINU';
    }
    if (DOM.checkoutErrorBox) {
      DOM.checkoutErrorBox.style.display = 'none';
    }
    DOM.orderSuccessBox.classList.remove('show');
    DOM.checkoutModalOverlay.classList.add('open');
    document.body.classList.add('lock-scroll');
    playSound('telemetry');
  }

  // --- SIZE GUIDE RECOMMENDER ---
  function updateSizeRecommendation() {
    if (!DOM.sizeHeightSlider || !DOM.sizeWeightSlider) return;

    const height = parseInt(DOM.sizeHeightSlider.value, 10);
    const weight = parseInt(DOM.sizeWeightSlider.value, 10);

    DOM.heightValDisplay.textContent = `${height} cm`;
    DOM.weightValDisplay.textContent = `${weight} kg`;

    let recommended = 'M';
    let advice = 'Relaxed Boxy Streetwear Silhouette';

    // Simple robust sizing rubric for boxy streetwear
    if (height < 170) {
      if (weight < 65) recommended = 'S';
      else if (weight < 78) recommended = 'M';
      else recommended = 'L';
    } else if (height <= 180) {
      if (weight < 70) recommended = 'M';
      else if (weight < 84) recommended = 'L';
      else recommended = 'XL';
    } else if (height <= 190) {
      if (weight < 80) recommended = 'L';
      else if (weight < 95) recommended = 'XL';
      else recommended = 'XXL';
    } else {
      if (weight < 90) recommended = 'XL';
      else recommended = 'XXL';
    }

    DOM.calcRecommendedSize.textContent = `VELIČINA ${recommended}`;
    DOM.calcAdviceText.textContent = `// Na osnovu visine ${height}cm i težine ${weight}kg: Veličina ${recommended} pruža autentičan motorsport boxy kroj sa spuštenim ramenima i prirodnim teškim padom.`;
  }

  // --- LIVE TELEMETRY CLOCK ---
  function updateTelemetryClock() {
    if (!DOM.liveClockEl) return;
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    DOM.liveClockEl.textContent = `${hours}:${minutes} CET`;
  }

  // --- EVENT LISTENERS INITIALIZATION ---
  function setupEventListeners() {
    // Currency Switcher
    DOM.currencyBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-currency') === state.currency));
    DOM.currencyBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const selected = btn.getAttribute('data-currency');
        if (selected === state.currency) return;
        state.currency = selected;
        localStorage.setItem('zalet_currency', selected);

        DOM.currencyBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-currency') === selected));

        playSound('click');
        renderProducts();
        updateCartUI();

        if (state.activeProduct) {
          DOM.pdpPriceMain.textContent = formatPrice(state.activeProduct.priceRSD, state.activeProduct.priceEUR);
          DOM.pdpPriceSecondary.textContent = getSecondaryPrice(state.activeProduct);
        }

        showToast(`TELEMETRY CURRENCY SWITCHED TO ${selected}`);
      });
    });

    // Audio Toggle (Formula 1 Team Radio Comms)
    if (DOM.audioToggleBtn) {
      DOM.audioToggleBtn.addEventListener('click', () => {
        state.audioEnabled = !state.audioEnabled;
        localStorage.setItem('zalet_audio', state.audioEnabled);
        DOM.audioToggleBtn.classList.toggle('sound-on', state.audioEnabled);
        if (state.audioEnabled) {
          playF1PitRadioCall();
        } else {
          stopCurrentRadio(true);
          showToast('TEAM RADIO // PIT COMMS MUTED');
        }
      });
      DOM.audioToggleBtn.classList.toggle('sound-on', state.audioEnabled);
    }

    // Filter Buttons
    DOM.filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        DOM.filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeCategory = btn.getAttribute('data-filter');
        playSound('click');
        renderProducts();
      });
    });

    // Global Delegated Clicks on Product Grid
    if (DOM.productsGrid) {
      DOM.productsGrid.addEventListener('click', (e) => {
        const flipBtn = e.target.closest('[data-action="flip-card"]');
        if (flipBtn) {
          e.stopPropagation();
          const card = flipBtn.closest('.product-card');
          if (card) {
            card.classList.toggle('is-flipped');
            playSound('click');
          }
          return;
        }

        const quickAddBtn = e.target.closest('[data-action="quick-add"]');
        if (quickAddBtn) {
          const id = quickAddBtn.getAttribute('data-id');
          const size = quickAddBtn.getAttribute('data-size');
          addToCart(id, size, 1);
          return;
        }

        const dmOrderBtn = e.target.closest('[data-action="dm-order"]');
        if (dmOrderBtn) {
          e.stopPropagation();
          const id = dmOrderBtn.getAttribute('data-id');
          openDmModalForProduct(id);
          return;
        }

        const quickViewTrigger = e.target.closest('[data-action="quickview"]');
        if (quickViewTrigger) {
          const id = quickViewTrigger.getAttribute('data-id');
          openPdp(id);
          return;
        }

        const card = e.target.closest('.product-card');
        if (card && !e.target.closest('.card-quick-actions')) {
          const id = card.getAttribute('data-id');
          openPdp(id);
        }
      });
    }

    // Cart Drawer Toggle
    if (DOM.cartTriggerBtn) {
      DOM.cartTriggerBtn.addEventListener('click', () => {
        playSound('click');
        DOM.cartDrawerOverlay.classList.add('open');
      });
    }

    if (DOM.cartCloseBtn) {
      DOM.cartCloseBtn.addEventListener('click', () => {
        playSound('click');
        DOM.cartDrawerOverlay.classList.remove('open');
        document.body.classList.remove('lock-scroll');
      });
    }

    if (DOM.cartContinueShoppingBtn) {
      DOM.cartContinueShoppingBtn.addEventListener('click', () => {
        playSound('click');
        DOM.cartDrawerOverlay.classList.remove('open');
        document.body.classList.remove('lock-scroll');
      });
    }

    if (DOM.cartDrawerOverlay) {
      DOM.cartDrawerOverlay.addEventListener('click', (e) => {
        if (e.target === DOM.cartDrawerOverlay) {
          playSound('click');
          DOM.cartDrawerOverlay.classList.remove('open');
          document.body.classList.remove('lock-scroll');
        }
      });
    }

    // Checkout Buttons
    if (DOM.proceedCheckoutBtn) {
      DOM.proceedCheckoutBtn.addEventListener('click', () => {
        DOM.cartDrawerOverlay.classList.remove('open');
        document.body.classList.remove('lock-scroll');
        openCheckoutModal();
      });
    }

    if (DOM.cartInstagramDmBtn) {
      DOM.cartInstagramDmBtn.addEventListener('click', () => {
        DOM.cartDrawerOverlay.classList.remove('open');
        document.body.classList.remove('lock-scroll');
        openDmModalForCart();
      });
    }

    // PDP Gallery Controls
    if (DOM.pdpCloseBtn) DOM.pdpCloseBtn.addEventListener('click', closePdp);
    if (DOM.pdpOverlay) {
      DOM.pdpOverlay.addEventListener('click', (e) => {
        if (e.target === DOM.pdpOverlay) closePdp();
      });
    }

    if (DOM.pdpPrevImgBtn) {
      DOM.pdpPrevImgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!state.activeProduct) return;
        state.pdpImageIndex = (state.pdpImageIndex - 1 + state.activeProduct.images.length) % state.activeProduct.images.length;
        renderPdpGallery();
        playSound('click');
      });
    }

    if (DOM.pdpNextImgBtn) {
      DOM.pdpNextImgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!state.activeProduct) return;
        state.pdpImageIndex = (state.pdpImageIndex + 1) % state.activeProduct.images.length;
        renderPdpGallery();
        playSound('click');
      });
    }

    // Touch Swipe Navigation on Mobile
    if (DOM.pdpMainImageWrap) {
      let touchStartX = 0;
      let touchStartY = 0;
      DOM.pdpMainImageWrap.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches[0]) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
      }, { passive: true });

      DOM.pdpMainImageWrap.addEventListener('touchend', (e) => {
        if (e.changedTouches && e.changedTouches[0]) {
          const deltaX = e.changedTouches[0].clientX - touchStartX;
          const deltaY = e.changedTouches[0].clientY - touchStartY;
          if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaX < 0) {
              if (DOM.pdpNextImgBtn) DOM.pdpNextImgBtn.click();
            } else {
              if (DOM.pdpPrevImgBtn) DOM.pdpPrevImgBtn.click();
            }
          }
        }
      }, { passive: true });
    }

    // PDP Quantity Controls
    if (DOM.pdpQtyMinus) {
      DOM.pdpQtyMinus.addEventListener('click', () => {
        if (state.selectedQty > 1) {
          state.selectedQty--;
          DOM.pdpQtyDisplay.textContent = state.selectedQty;
          playSound('click');
        }
      });
    }

    if (DOM.pdpQtyPlus) {
      DOM.pdpQtyPlus.addEventListener('click', () => {
        state.selectedQty++;
        DOM.pdpQtyDisplay.textContent = state.selectedQty;
        playSound('click');
      });
    }

    // PDP Add to Cart
    if (DOM.pdpAddBtn) {
      DOM.pdpAddBtn.addEventListener('click', () => {
        if (!state.activeProduct) return;
        addToCart(state.activeProduct.id, state.selectedSize, state.selectedQty);
        DOM.pdpAddBtn.textContent = 'KOMAD JE U KORPI ✓';
        DOM.pdpAddBtn.style.backgroundColor = 'var(--accent-green-telemetry)';
        setTimeout(() => {
          DOM.pdpAddBtn.textContent = 'DODAJ U KORPU // OSIGURAJ KOMAD';
          DOM.pdpAddBtn.style.backgroundColor = '';
        }, 1800);
      });
    }

    // PDP Size Guide Modal Trigger
    if (DOM.pdpSizeGuideTrigger) {
      DOM.pdpSizeGuideTrigger.addEventListener('click', () => {
        DOM.sizeGuideModalOverlay.classList.add('open');
        playSound('click');
      });
    }

    // Size Guide Modal Controls
    if (DOM.sizeGuideCloseBtn) {
      DOM.sizeGuideCloseBtn.addEventListener('click', () => {
        DOM.sizeGuideModalOverlay.classList.remove('open');
        playSound('click');
      });
    }

    if (DOM.sizeGuideModalOverlay) {
      DOM.sizeGuideModalOverlay.addEventListener('click', (e) => {
        if (e.target === DOM.sizeGuideModalOverlay) {
          DOM.sizeGuideModalOverlay.classList.remove('open');
        }
      });
    }

    // Size Guide Sliders
    if (DOM.sizeHeightSlider) DOM.sizeHeightSlider.addEventListener('input', updateSizeRecommendation);
    if (DOM.sizeWeightSlider) DOM.sizeWeightSlider.addEventListener('input', updateSizeRecommendation);

    // Checkout Modal Controls
    if (DOM.checkoutCloseBtn) {
      DOM.checkoutCloseBtn.addEventListener('click', () => {
        DOM.checkoutModalOverlay.classList.remove('open');
        document.body.classList.remove('lock-scroll');
        playSound('click');
      });
    }

    if (DOM.checkoutModalOverlay) {
      DOM.checkoutModalOverlay.addEventListener('click', (e) => {
        if (e.target === DOM.checkoutModalOverlay) {
          DOM.checkoutModalOverlay.classList.remove('open');
          document.body.classList.remove('lock-scroll');
        }
      });
    }

    // Checkout Form Submit
    if (DOM.checkoutForm) {
      DOM.checkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (state.cart.length === 0) {
          showToast('PIT BAG JE PRAZNA');
          return;
        }

        const formData = new FormData(DOM.checkoutForm);
        const fullName = (formData.get('fullName') || '').trim();
        const phone = (formData.get('phone') || '').trim();
        const address = (formData.get('address') || '').trim();
        const city = (formData.get('city') || '').trim();
        const postalCode = (formData.get('postalCode') || '').trim();
        const note = (formData.get('note') || '').trim();
        const shippingMethod = formData.get('shippingMethod') || 'Dostava na kućnu adresu';
        const paymentMethod = formData.get('paymentMethod') || 'Plaćanje pouzećem (gotovinom kuriru pri preuzimanju)';

        if (!fullName || !phone || !address || !city) {
          showToast('MOLIMO POPUNITE SVA OBAVEZNA POLJA');
          return;
        }

        const orderNumDigits = Math.floor(1000 + Math.random() * 9000);
        const orderNumber = `ZL-${orderNumDigits}`;
        const orderDate = new Date();
        const formattedDateTime = orderDate.toLocaleString('sr-RS', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        const { totalRSD, totalEUR } = calculateCartTotals();
        const isFree = state.currency === 'EUR' ? totalEUR >= state.freeShippingThresholdEUR : totalRSD >= state.freeShippingThresholdRSD;
        const shippingFeeRSD = isFree ? 0 : 350;
        const shippingFeeEUR = isFree ? 0 : 3.5;
        const grandTotalRSD = totalRSD + shippingFeeRSD;
        const grandTotalEUR = totalEUR + shippingFeeEUR;

        const cartSnapshot = JSON.parse(JSON.stringify(state.cart));

        // Format ordered items with explicit RSD and EUR prices for domestic courier and international clarity
        const itemsFormattedList = cartSnapshot.map((item, idx) => {
          const itemTotalRSD = (item.priceRSD * item.quantity).toLocaleString('sr-RS');
          const itemTotalEUR = (item.priceEUR * item.quantity).toFixed(2);
          const itemUnitRSD = item.priceRSD.toLocaleString('sr-RS');
          const itemUnitEUR = item.priceEUR.toFixed(2);
          return `${idx + 1}. ${item.title} | Vel: ${item.size} | Kol: ${item.quantity} | Cena: ${itemTotalRSD} RSD (€${itemTotalEUR}) [Jedinična: ${itemUnitRSD} RSD / €${itemUnitEUR}] [SKU: ${item.sku}]`;
        }).join('\n');

        const shippingFeeText = isFree ? 'BESPLATNO (0 RSD / €0.00)' : '350 RSD (€3.50)';
        const grandTotalText = `${grandTotalRSD.toLocaleString('sr-RS')} RSD (€${grandTotalEUR.toFixed(2)})`;
        const subtotalText = `${totalRSD.toLocaleString('sr-RS')} RSD (€${totalEUR.toFixed(2)})`;

        // Payload for FormSubmit to deliver order to owner email
        const orderPayload = {
          _subject: `Nova ZALET Porudžbina #${orderNumber} - ${fullName}`,
          _template: 'table',
          _captcha: 'false',
          'Broj Porudžbine': `#${orderNumber}`,
          'Datum i Vreme': formattedDateTime,
          'Kupac': fullName,
          'Telefon': phone,
          'Adresa za Isporuku': address,
          'Grad': city,
          'Poštanski Broj': postalCode || 'Nije navedeno',
          'Napomena': note || 'Nema napomene',
          'Način Isporuke': shippingMethod,
          'Način Plaćanja': paymentMethod,
          'Naručeni Artikli': itemsFormattedList,
          'Vrednost Artikala': subtotalText,
          'Trošak Dostave': shippingFeeText,
          'UKUPNO ZA NAPLATU': grandTotalText
        };

        // Loading state on submit button
        const submitBtn = DOM.checkoutSubmitBtn || DOM.checkoutForm.querySelector('button[type="submit"]');
        const defaultBtnHtml = submitBtn ? submitBtn.innerHTML : 'POTVRDI PORUDŽBINU';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = 'OBRADA PORUDŽBINE...';
        }
        if (DOM.checkoutErrorBox) {
          DOM.checkoutErrorBox.style.display = 'none';
        }

        try {
          // Timeout after 15 seconds to prevent hanging button state if network stalls
          const abortController = new AbortController();
          const timeoutId = setTimeout(() => abortController.abort(), 15000);

          const response = await fetch('https://formsubmit.co/ajax/teodorastanojevic555@gmail.com', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(orderPayload),
            signal: abortController.signal
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const responseData = await response.json();

          // FormSubmit responds with success: "true"/true on active forms,
          // or a message stating "This form needs Activation..." on the first unverified submission.
          // In both cases the submission has been accepted into FormSubmit's system.
          const isSuccessfulDispatch = responseData && (
            responseData.success === true ||
            responseData.success === 'true' ||
            (typeof responseData.message === 'string' && /activat/i.test(responseData.message))
          );

          if (!isSuccessfulDispatch) {
            throw new Error(responseData?.message || 'Server je odbio porudžbinu.');
          }

          // --- SUCCESS ---
          // Save order to localStorage.zalet_orders
          const orderRecord = {
            orderNumber: `#${orderNumber}`,
            date: orderDate.toISOString(),
            formattedDate: formattedDateTime,
            customer: {
              fullName,
              phone,
              address,
              city,
              postalCode,
              note,
              shippingMethod,
              paymentMethod
            },
            items: cartSnapshot,
            totals: {
              subtotalRSD: totalRSD,
              subtotalEUR: totalEUR,
              shippingFeeRSD: shippingFeeRSD,
              shippingFeeEUR: shippingFeeEUR,
              grandTotalRSD: grandTotalRSD,
              grandTotalEUR: grandTotalEUR,
              currency: state.currency
            }
          };

          try {
            const existingOrders = JSON.parse(localStorage.getItem('zalet_orders') || '[]');
            existingOrders.unshift(orderRecord);
            localStorage.setItem('zalet_orders', JSON.stringify(existingOrders));
          } catch (storageErr) {
            console.warn('Greška pri čuvanju porudžbine u localStorage:', storageErr);
          }

          // Build summary HTML for confirmation box
          const itemsSummaryHtml = cartSnapshot.map(item => `
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.78rem; color: var(--text-gray-light);">
              <span>${item.quantity}x ${item.title} (${item.size})</span>
              <span style="color: #fff; font-weight: 600;">${formatPrice(item.priceRSD * item.quantity, item.priceEUR * item.quantity)}</span>
            </div>
          `).join('');

          const summaryHtml = `
            <div style="background: var(--bg-surface); border: 1px solid var(--border-medium); padding: 18px; margin: 16px 0; text-align: left; font-family: var(--font-mono); font-size: 0.8rem; width: 100%;">
              <div style="color: var(--accent-orange); font-weight: 700; font-size: 1.05rem; margin-bottom: 10px;">BROJ PORUDŽBINE: #${orderNumber}</div>
              <div style="margin-bottom: 4px;"><strong style="color: #fff;">KUPAC:</strong> ${fullName}</div>
              <div style="margin-bottom: 4px;"><strong style="color: #fff;">TELEFON:</strong> ${phone}</div>
              <div style="margin-bottom: 4px;"><strong style="color: #fff;">ADRESA ZA ISPORUKU:</strong> ${address}, ${postalCode ? postalCode + ' ' : ''}${city}</div>
              ${note ? `<div style="margin-bottom: 4px;"><strong style="color: #fff;">NAPOMENA:</strong> ${note}</div>` : ''}
              <div style="margin-bottom: 4px;"><strong style="color: #fff;">NAČIN DOSTAVE:</strong> ${shippingMethod}</div>
              <div style="margin-bottom: 8px;"><strong style="color: #fff;">NAČIN PLAĆANJA:</strong> ${paymentMethod}</div>
              <div style="border-top: 1px dashed var(--border-dark); margin: 10px 0; padding-top: 8px;">
                <strong style="color: #fff; display: block; margin-bottom: 6px;">PORUČENI ARTIKLI:</strong>
                ${itemsSummaryHtml}
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-gray-muted); margin-bottom: 4px;">
                <span>DOSTAVA:</span>
                <span>${shippingFeeText}</span>
              </div>
              <div style="border-top: 1px solid var(--border-dark); padding-top: 8px; font-weight: 700; color: var(--accent-orange); display: flex; justify-content: space-between; font-size: 0.95rem;">
                <span>UKUPNO ZA UPLATU:</span>
                <span>${formatPrice(grandTotalRSD, grandTotalEUR)}</span>
              </div>
            </div>
          `;

          DOM.orderSummaryWrap.innerHTML = summaryHtml;

          // Display success box and hide checkout form
          DOM.checkoutForm.style.display = 'none';
          DOM.orderSuccessBox.classList.add('show');

          // Reset checkout form fields
          DOM.checkoutForm.reset();

          // Clear cart
          state.cart = [];
          saveCart();

          // Reset submit button state
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = defaultBtnHtml;
          }

          // Play telemetry sound
          playSound('telemetry');
          showToast(`PORUDŽBINA #${orderNumber} USPEŠNO ZABELEŽENA!`);

        } catch (error) {
          console.error('Checkout dispatch error:', error);

          // Restore submit button
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = defaultBtnHtml;
          }

          // Show error fallback container
          if (DOM.checkoutErrorBox) {
            DOM.checkoutErrorBox.style.display = 'block';
            if (DOM.checkoutErrorMessage) {
              DOM.checkoutErrorMessage.textContent = 'Došlo je do greške u povezivanju sa serverom. Vaši podaci i artikli u korpi su sačuvani! Možete pokušati ponovo, kopirati podatke ili poručiti preko Instagram DM-a.';
            }
          }

          // Prepare Instagram DM fallback text with entered details
          const fallbackDmText =
`Pozdrav @zaletclub! Želim da poručim komade direktno:
------------------------------------------
BROJ PORUDŽBINE: #${orderNumber}
------------------------------------------
ARTIKLI:
${itemsFormattedList}
------------------------------------------
UKUPNO ZA UPLATU: ${grandTotalText}
DOSTAVA: ${shippingMethod} (${shippingFeeText})
PLAĆANJE: ${paymentMethod}
------------------------------------------
PODACI ZA ISPORUKU:
Ime i Prezime: ${fullName}
Telefon: ${phone}
Adresa: ${address}
Grad: ${city}${postalCode ? ' (' + postalCode + ')' : ''}
${note ? `Napomena: ${note}\n` : ''}`;

          if (DOM.dmTemplateBox) {
            DOM.dmTemplateBox.textContent = fallbackDmText;
          }

          showToast('GREŠKA PRI SLANJU PORUDŽBINE - POKUŠAJTE PONOVO ILI PREKO DM-a');
        }
      });
    }

    // Checkout Error Retry Button
    if (DOM.checkoutRetryBtn) {
      DOM.checkoutRetryBtn.addEventListener('click', () => {
        if (DOM.checkoutErrorBox) {
          DOM.checkoutErrorBox.style.display = 'none';
        }
        if (DOM.checkoutForm) {
          if (typeof DOM.checkoutForm.requestSubmit === 'function') {
            DOM.checkoutForm.requestSubmit();
          } else {
            DOM.checkoutForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
          }
        }
      });
    }

    // Checkout Error Quick Copy Order Button
    if (DOM.checkoutCopyErrorOrderBtn) {
      DOM.checkoutCopyErrorOrderBtn.addEventListener('click', () => {
        const textToCopy = (DOM.dmTemplateBox && DOM.dmTemplateBox.textContent) ? DOM.dmTemplateBox.textContent : '';
        if (textToCopy && navigator.clipboard) {
          navigator.clipboard.writeText(textToCopy).then(() => {
            DOM.checkoutCopyErrorOrderBtn.textContent = 'KOPIRANO U KLIPBORD ✓';
            DOM.checkoutCopyErrorOrderBtn.classList.add('copy-btn-success');
            playSound('telemetry');
            setTimeout(() => {
              DOM.checkoutCopyErrorOrderBtn.textContent = 'KOPIRAJ PORUDŽBINU';
              DOM.checkoutCopyErrorOrderBtn.classList.remove('copy-btn-success');
            }, 2400);
          }).catch(() => {
            showToast('Nije moguće pristupiti klipbordu');
          });
        }
      });
    }

    // Checkout Error Instagram Fallback Button
    if (DOM.checkoutInstagramFallbackBtn) {
      DOM.checkoutInstagramFallbackBtn.addEventListener('click', () => {
        if (DOM.checkoutModalOverlay) {
          DOM.checkoutModalOverlay.classList.remove('open');
        }
        if (DOM.dmModalOverlay) {
          DOM.dmModalOverlay.classList.add('open');
          document.body.classList.add('lock-scroll');
        }
        playSound('click');
      });
    }

    // DM Modal Controls
    if (DOM.dmModalCloseBtn) {
      DOM.dmModalCloseBtn.addEventListener('click', () => {
        DOM.dmModalOverlay.classList.remove('open');
        document.body.classList.remove('lock-scroll');
        playSound('click');
      });
    }

    if (DOM.dmModalOverlay) {
      DOM.dmModalOverlay.addEventListener('click', (e) => {
        if (e.target === DOM.dmModalOverlay) {
          DOM.dmModalOverlay.classList.remove('open');
          document.body.classList.remove('lock-scroll');
        }
      });
    }

    if (DOM.copyDmTemplateBtn) {
      DOM.copyDmTemplateBtn.addEventListener('click', () => {
        const text = DOM.dmTemplateBox.textContent;
        navigator.clipboard.writeText(text).then(() => {
          DOM.copyDmTemplateBtn.textContent = 'COPIED TO CLIPBOARD ✓';
          DOM.copyDmTemplateBtn.classList.add('copy-btn-success');
          playSound('telemetry');
          setTimeout(() => {
            DOM.copyDmTemplateBtn.textContent = 'COPY MESSAGE TEMPLATE';
            DOM.copyDmTemplateBtn.classList.remove('copy-btn-success');
          }, 2400);
        });
      });
    }

    // Mobile Menu Toggle
    if (DOM.mobileMenuBtn) {
      DOM.mobileMenuBtn.addEventListener('click', () => {
        DOM.mobileNavDrawer.classList.add('open');
        document.body.classList.add('lock-scroll');
        playSound('click');
      });
    }

    if (DOM.mobileNavCloseBtn) {
      DOM.mobileNavCloseBtn.addEventListener('click', () => {
        DOM.mobileNavDrawer.classList.remove('open');
        document.body.classList.remove('lock-scroll');
        playSound('click');
      });
    }

    DOM.mobileNavLinks.forEach(link => {
      link.addEventListener('click', () => {
        DOM.mobileNavDrawer.classList.remove('open');
        document.body.classList.remove('lock-scroll');
      });
    });

    // Hash change handler
    window.addEventListener('hashchange', checkUrlHash);

    // Zoom lens on PDP image
    if (DOM.pdpMainImageWrap) {
      DOM.pdpMainImageWrap.addEventListener('mousemove', (e) => {
        if (!DOM.pdpMainImageWrap.classList.contains('zoomed')) return;
        const rect = DOM.pdpMainImageWrap.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        DOM.pdpMainImage.style.transformOrigin = `${x}% ${y}%`;
      });

      DOM.pdpMainImageWrap.addEventListener('click', (e) => {
        if (e.target.closest('.pdp-gallery-nav-btns') || e.target.closest('.pdp-gallery-arrow')) return;
        DOM.pdpMainImageWrap.classList.toggle('zoomed');
      });

      DOM.pdpMainImageWrap.addEventListener('mouseleave', () => {
        DOM.pdpMainImageWrap.classList.remove('zoomed');
      });
    }

    // Keyboard ESC to close any open modal
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (DOM.pdpOverlay.classList.contains('open')) closePdp();
        if (DOM.cartDrawerOverlay.classList.contains('open')) DOM.cartDrawerOverlay.classList.remove('open');
        if (DOM.checkoutModalOverlay.classList.contains('open')) DOM.checkoutModalOverlay.classList.remove('open');
        if (DOM.dmModalOverlay.classList.contains('open')) DOM.dmModalOverlay.classList.remove('open');
        if (DOM.sizeGuideModalOverlay.classList.contains('open')) DOM.sizeGuideModalOverlay.classList.remove('open');
        if (DOM.mobileNavDrawer.classList.contains('open')) DOM.mobileNavDrawer.classList.remove('open');
        document.body.classList.remove('lock-scroll');
      }
    });

    // Interactive Atmospheric Mouse Torch Glow (Desktop)
    if (window.matchMedia('(pointer: fine)').matches) {
      let ticking = false;
      window.addEventListener('pointermove', (e) => {
        if (!ticking) {
          window.requestAnimationFrame(() => {
            document.documentElement.style.setProperty('--cursor-x', `${e.clientX}px`);
            document.documentElement.style.setProperty('--cursor-y', `${e.clientY}px`);
            ticking = false;
          });
          ticking = true;
        }
      }, { passive: true });
    }
  }

  // --- HASH ROUTING CHECK ---
  function checkUrlHash() {
    const hash = window.location.hash;
    if (hash.startsWith('#product/')) {
      const id = hash.replace('#product/', '');
      openPdp(id);
    } else if (hash === '#size-guide') {
      DOM.sizeGuideModalOverlay.classList.add('open');
    }
  }

  // --- 3D INTERACTIVE TEE & HOODIE MOCKUP CAROUSEL WITH PHYSICS ---
  function init3dTeeMockup() {
    const stage = document.getElementById('hero3dTeeStage');
    const wrapper = document.getElementById('tee3dWrapper');
    const shadow = document.getElementById('tee3dShadow');
    const glare = document.getElementById('teeGlare');
    if (!stage || !wrapper) return;

    // --- CAROUSEL & SWAP LOGIC ---
    let currentModelIndex = 0;
    const slides = stage.querySelectorAll('.mockup-slide');
    const badgeText = document.getElementById('mockupBadgeText');
    const toggleBtns = stage.querySelectorAll('.mockup-toggle-btn');
    const dots = stage.querySelectorAll('.mockup-dot');
    const prevBtn = document.getElementById('mockupPrevBtn');
    const nextBtn = document.getElementById('mockupNextBtn');

    function switchModel(newIndex, direction = 1) {
      if (!slides || slides.length === 0) return;
      if (newIndex < 0) newIndex = slides.length - 1;
      if (newIndex >= slides.length) newIndex = 0;
      if (newIndex === currentModelIndex && slides[newIndex].classList.contains('active')) return;

      const oldIndex = currentModelIndex;
      currentModelIndex = newIndex;

      slides.forEach((slide, idx) => {
        slide.classList.remove('slide-out-prev', 'slide-out-next', 'active');
        if (idx === oldIndex) {
          slide.classList.add(direction > 0 ? 'slide-out-prev' : 'slide-out-next');
        } else if (idx === newIndex) {
          slide.classList.add('active');
        }
      });

      // Update badge
      if (badgeText) {
        const badgeLabel = slides[newIndex].getAttribute('data-badge') || (newIndex === 0 ? 'DROP 01 // 3D MAJICA' : 'DROP 01 // 3D HOODIE');
        badgeText.textContent = badgeLabel;
      }

      // Update toggle buttons
      toggleBtns.forEach(btn => {
        const btnIdx = parseInt(btn.getAttribute('data-index'), 10);
        btn.classList.toggle('active', btnIdx === newIndex);
      });

      // Update pagination dots
      dots.forEach(dot => {
        const dotIdx = parseInt(dot.getAttribute('data-index'), 10);
        dot.classList.toggle('active', dotIdx === newIndex);
      });

      playSound('telemetry');
    }

    // Button event listeners
    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        switchModel(currentModelIndex - 1, -1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        switchModel(currentModelIndex + 1, 1);
      });
    }

    toggleBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        const dir = idx >= currentModelIndex ? 1 : -1;
        switchModel(idx, dir);
      });
    });

    dots.forEach(dot => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(dot.getAttribute('data-index'), 10);
        const dir = idx >= currentModelIndex ? 1 : -1;
        switchModel(idx, dir);
      });
    });

    // --- SWIPE & DRAG MECHANICS ---
    let touchStartX = 0;
    let touchStartY = 0;
    let isTouchDragging = false;

    let mouseStartX = 0;
    let isMouseDragging = false;

    // Mouse drag
    stage.addEventListener('mousedown', (e) => {
      if (e.target.closest('button') || e.target.closest('.mockup-toggle-pills')) return;
      mouseStartX = e.clientX;
      isMouseDragging = true;
    });

    window.addEventListener('mouseup', (e) => {
      if (isMouseDragging) {
        const deltaX = e.clientX - mouseStartX;
        if (Math.abs(deltaX) > 40) {
          if (deltaX < 0) {
            switchModel(currentModelIndex + 1, 1);
          } else {
            switchModel(currentModelIndex - 1, -1);
          }
        }
        isMouseDragging = false;
      }
    });

    // Touch swipe
    stage.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length === 0) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      isTouchDragging = true;
    }, { passive: true });

    stage.addEventListener('touchend', (e) => {
      if (!isTouchDragging) return;
      if (!e.changedTouches || e.changedTouches.length === 0) return;
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;

      if (Math.abs(deltaX) > 36 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
        if (deltaX < 0) {
          switchModel(currentModelIndex + 1, 1);
        } else {
          switchModel(currentModelIndex - 1, -1);
        }
      }
      isTouchDragging = false;
    }, { passive: true });

    // Keyboard navigation when stage is in view
    document.addEventListener('keydown', (e) => {
      if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      const rect = stage.getBoundingClientRect();
      const inView = rect.top < window.innerHeight && rect.bottom > 0;
      if (!inView) return;

      if (e.key === 'ArrowLeft') {
        switchModel(currentModelIndex - 1, -1);
      } else if (e.key === 'ArrowRight') {
        switchModel(currentModelIndex + 1, 1);
      }
    });

    // --- 3D TILT PHYSICS ---
    let bounds = null;
    let isHovering = false;
    let rafId = null;
    let targetRotateX = 0;
    let targetRotateY = 0;
    let targetTranslateX = 0;
    let targetTranslateY = 0;
    let currentRotateX = 0;
    let currentRotateY = 0;
    let currentTranslateX = 0;
    let currentTranslateY = 0;

    function updateBounds() {
      bounds = stage.getBoundingClientRect();
    }

    window.addEventListener('resize', updateBounds);
    window.addEventListener('scroll', updateBounds, { passive: true });

    function lerp(start, end, factor) {
      return start + (end - start) * factor;
    }

    function renderLoop() {
      if (!isHovering) {
        currentRotateX = lerp(currentRotateX, 0, 0.1);
        currentRotateY = lerp(currentRotateY, 0, 0.1);
        currentTranslateX = lerp(currentTranslateX, 0, 0.1);
        currentTranslateY = lerp(currentTranslateY, 0, 0.1);

        if (Math.abs(currentRotateX) < 0.04 && Math.abs(currentRotateY) < 0.04) {
          wrapper.style.transform = '';
          if (shadow) shadow.style.transform = '';
          rafId = null;
          return;
        }
      } else {
        currentRotateX = lerp(currentRotateX, targetRotateX, 0.18);
        currentRotateY = lerp(currentRotateY, targetRotateY, 0.18);
        currentTranslateX = lerp(currentTranslateX, targetTranslateX, 0.18);
        currentTranslateY = lerp(currentTranslateY, targetTranslateY, 0.18);
      }

      wrapper.style.transform = `perspective(1000px) rotateX(${currentRotateX.toFixed(2)}deg) rotateY(${currentRotateY.toFixed(2)}deg) translate3d(${currentTranslateX.toFixed(1)}px, ${currentTranslateY.toFixed(1)}px, 24px) scale3d(1.04, 1.04, 1.04)`;

      if (shadow) {
        shadow.style.transform = `translateX(${(currentTranslateX * 1.5).toFixed(1)}px) scale(${1 - Math.abs(currentRotateX * 0.015)})`;
      }

      rafId = requestAnimationFrame(renderLoop);
    }

    stage.addEventListener('mouseenter', () => {
      isHovering = true;
      updateBounds();
      if (!rafId) {
        rafId = requestAnimationFrame(renderLoop);
      }
    });

    stage.addEventListener('mousemove', (e) => {
      if (!bounds) updateBounds();
      const mouseX = e.clientX - bounds.left;
      const mouseY = e.clientY - bounds.top;

      const xPercent = (mouseX / bounds.width) - 0.5;
      const yPercent = (mouseY / bounds.height) - 0.5;

      targetRotateY = xPercent * 28;
      targetRotateX = -yPercent * 24;
      targetTranslateX = xPercent * 16;
      targetTranslateY = yPercent * 12;

      if (glare) {
        const glareX = Math.round((xPercent + 0.5) * 100);
        const glareY = Math.round((yPercent + 0.5) * 100);
        glare.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255, 255, 255, 0.16) 0%, transparent 60%)`;
      }

      if (!rafId) {
        rafId = requestAnimationFrame(renderLoop);
      }
    });

    stage.addEventListener('mouseleave', () => {
      isHovering = false;
      targetRotateX = 0;
      targetRotateY = 0;
      targetTranslateX = 0;
      targetTranslateY = 0;
    });

    // Touch Support for Mobile & Tablets Tilt
    stage.addEventListener('touchstart', (e) => {
      isHovering = true;
      updateBounds();
      if (!rafId) {
        rafId = requestAnimationFrame(renderLoop);
      }
    }, { passive: true });

    stage.addEventListener('touchmove', (e) => {
      if (!e.touches || e.touches.length === 0) return;
      if (!bounds) updateBounds();
      const touch = e.touches[0];
      const touchX = touch.clientX - bounds.left;
      const touchY = touch.clientY - bounds.top;

      const xPercent = (touchX / bounds.width) - 0.5;
      const yPercent = (touchY / bounds.height) - 0.5;

      targetRotateY = Math.max(-28, Math.min(28, xPercent * 28));
      targetRotateX = Math.max(-24, Math.min(24, -yPercent * 24));
      targetTranslateX = Math.max(-16, Math.min(16, xPercent * 16));
      targetTranslateY = Math.max(-12, Math.min(12, yPercent * 12));

      if (glare) {
        const glareX = Math.round((xPercent + 0.5) * 100);
        const glareY = Math.round((yPercent + 0.5) * 100);
        glare.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255, 255, 255, 0.2) 0%, transparent 60%)`;
      }

      if (!rafId) {
        rafId = requestAnimationFrame(renderLoop);
      }
    }, { passive: true });

    stage.addEventListener('touchend', () => {
      isHovering = false;
      targetRotateX = 0;
      targetRotateY = 0;
      targetTranslateX = 0;
      targetTranslateY = 0;
    }, { passive: true });
  }

  // --- INITIALIZE APPLICATION ---
  function init() {
    renderProducts();
    updateCartUI();
    updateSizeRecommendation();
    setupEventListeners();
    updateTelemetryClock();
    setInterval(updateTelemetryClock, 1000);
    init3dTeeMockup();

    // Initial hash check
    checkUrlHash();

    console.log('🏁 ZALET RACING CLUB // SYSTEM READY // DROP 01 LOADED');
  }

  // Export public methods for inline handlers
  window.ZaletApp = {
    addToCart,
    removeFromCart,
    updateCartQty,
    openPdp,
    openDmModalForProduct,
    openDmModalForCart,
    playF1PitRadioCall,
    stopCurrentRadio
  };

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
