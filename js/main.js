/*
  FORME — page interactions (no dependencies)
  -------------------------------------------
  1. Header, mobile menu, active section in navigation
  2. Services accordion + image panel
  3. Before / after comparison slider
  4. Process progress line
  5. Inspection light on gallery images
  6. Service finder (two questions -> recommendation)
  7. FAQ accordion
  8. Request form: validation and an honest "prepared message" result
  9. Scroll reveal
*/
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  document.documentElement.classList.add('js');

  /* Scroll to an element, then run a callback once scrolling has settled. */
  function scrollToEl(el, then) {
    if (!el) return;
    el.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    if (!then) return;
    let done = false;
    const finish = () => { if (!done) { done = true; then(); } };
    if ('onscrollend' in window) window.addEventListener('scrollend', finish, { once: true });
    setTimeout(finish, reduceMotion.matches ? 50 : 900);
  }

  /* ============ 1. Header & navigation ============ */
  const header = $('[data-header]');
  const menuToggle = $('[data-menu-toggle]');
  const menu = $('[data-menu]');
  let lastY = window.scrollY;
  let menuOpen = false;

  function onScrollHeader() {
    const y = window.scrollY;
    header.classList.toggle('is-scrolled', y > 24);
    const goingDown = y > lastY + 4;
    const goingUp = y < lastY - 4;
    if (!menuOpen && !header.contains(document.activeElement)) {
      if (goingDown && y > 640) header.classList.add('is-hidden');
      else if (goingUp || y < 640) header.classList.remove('is-hidden');
    }
    if (Math.abs(y - lastY) > 4) lastY = y;
  }

  function setMenu(open) {
    menuOpen = open;
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.querySelector('.menu-toggle__label').textContent = open ? 'Закрыть' : 'Меню';
    menu.classList.toggle('is-open', open);
    header.classList.toggle('menu-open', open);
    header.classList.remove('is-hidden');
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      const first = menu.querySelector('a');
      if (first) setTimeout(() => first.focus(), 60);
    }
  }
  if (menuToggle && menu) {
    menuToggle.addEventListener('click', () => setMenu(!menuOpen));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuOpen) { setMenu(false); menuToggle.focus(); }
    });
    window.matchMedia('(min-width: 900px)').addEventListener('change', (e) => { if (e.matches && menuOpen) setMenu(false); });
  }

  // Active section in the desktop navigation.
  const navLinks = $$('[data-nav]');
  if ('IntersectionObserver' in window && navLinks.length) {
    const map = new Map(navLinks.map((a) => [a.getAttribute('href').slice(1), a]));
    const visible = new Map();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => visible.set(en.target.id, en.isIntersecting ? en.intersectionRatio : 0));
      let best = null, bestR = 0;
      visible.forEach((r, id) => { if (r > bestR && map.has(id)) { best = id; bestR = r; } });
      navLinks.forEach((a) => a.removeAttribute('aria-current'));
      if (best) map.get(best).setAttribute('aria-current', 'true');
    }, { threshold: [0, 0.2, 0.4, 0.6], rootMargin: '-20% 0px -40% 0px' });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  }

  /* ============ 2. Services ============ */
  const services = $$('.service');
  const serviceImgs = $$('[data-service-img]');

  function openService(service, { focus = false } = {}) {
    services.forEach((s) => {
      const open = s === service;
      s.classList.toggle('is-open', open);
      s.querySelector('.service__toggle').setAttribute('aria-expanded', String(open));
    });
    const key = service?.dataset.service;
    if (key) serviceImgs.forEach((img) => img.classList.toggle('is-active', img.dataset.serviceImg === key));
    if (focus && service) service.querySelector('.service__toggle').focus({ preventScroll: true });
  }
  services.forEach((s) => {
    s.querySelector('.service__toggle').addEventListener('click', () => {
      if (s.classList.contains('is-open')) {
        s.classList.remove('is-open');
        s.querySelector('.service__toggle').setAttribute('aria-expanded', 'false');
      } else {
        openService(s);
      }
    });
    // Desktop: hovering a closed row previews its image without opening it.
    s.addEventListener('mouseenter', () => {
      if (!finePointer.matches) return;
      const key = s.dataset.service;
      serviceImgs.forEach((img) => img.classList.toggle('is-active', img.dataset.serviceImg === key));
    });
  });
  const servicesList = $('[data-services]');
  if (servicesList) {
    servicesList.addEventListener('mouseleave', () => {
      const open = services.find((s) => s.classList.contains('is-open'));
      if (open) serviceImgs.forEach((img) => img.classList.toggle('is-active', img.dataset.serviceImg === open.dataset.service));
    });
  }
  $$('[data-open-service]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const s = document.getElementById('service-' + a.dataset.openService);
      if (!s) return;
      e.preventDefault();
      openService(s);
      scrollToEl(s, () => s.querySelector('.service__toggle').focus({ preventScroll: true }));
      try { history.replaceState(null, '', '#' + s.id); } catch (err) { /* sandboxed frames may refuse */ }
    });
  });

  /* ============ 8a. form helpers used by several sections ============ */
  const form = $('[data-form]');
  const serviceSelect = $('#f-service');
  const commentField = $('#f-comment');
  const counter = $('[data-counter]');
  function updateCounter() { if (counter && commentField) counter.textContent = String(commentField.value.length); }

  function goToForm(serviceName, comment) {
    const done = $('[data-form-done]');
    if (done && !done.hidden) showForm();
    if (serviceName && serviceSelect) {
      const opt = Array.from(serviceSelect.options).find((o) => o.value === serviceName || o.text === serviceName);
      if (opt) serviceSelect.value = opt.value;
      clearError('service');
    }
    if (comment && commentField && !commentField.value.trim()) {
      commentField.value = comment;
      updateCounter();
    }
    const contact = $('#contact');
    scrollToEl(contact, () => { const n = $('#f-name'); if (n) n.focus({ preventScroll: true }); });
  }
  $$('[data-pick-service]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      goToForm(a.dataset.pickService);
    });
  });

  /* ============ 3. Before / after ============ */
  const ba = $('[data-ba]');
  if (ba) {
    const handle = $('[data-ba-handle]', ba);
    let pos = 50;
    let interacted = false;
    let drag = null;

    function setPos(p) {
      pos = clamp(p, 0, 100);
      ba.style.setProperty('--pos', pos + '%');
      ba.style.setProperty('--p', pos.toFixed(2));
      const r = Math.round(pos);
      handle.setAttribute('aria-valuenow', String(r));
      handle.setAttribute('aria-valuetext', `${r} процентов: слева до полировки, справа после`);
    }
    function posFromEvent(e) {
      const rect = ba.getBoundingClientRect();
      return ((e.clientX - rect.left) / rect.width) * 100;
    }
    ba.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      interacted = true;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, active: e.pointerType === 'mouse' || e.target.closest('[data-ba-handle]') };
      if (drag.active) {
        ba.setPointerCapture(e.pointerId);
        ba.classList.add('is-dragging');
        setPos(posFromEvent(e));
        e.preventDefault();
      }
    });
    ba.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      if (!drag.active) {
        // Touch: start dragging only on a clearly horizontal gesture, so vertical scrolling still works.
        const dx = Math.abs(e.clientX - drag.x);
        const dy = Math.abs(e.clientY - drag.y);
        if (dx > 8 && dx > dy * 1.2) {
          drag.active = true;
          ba.setPointerCapture(e.pointerId);
          ba.classList.add('is-dragging');
        } else if (dy > 10) {
          drag = null;
          return;
        } else return;
      }
      setPos(posFromEvent(e));
    });
    const end = (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      if (!drag.active && e.type === 'pointerup' && e.pointerType !== 'mouse') {
        // A tap moves the divider to the tapped point.
        setPos(posFromEvent(e));
      }
      drag = null;
      ba.classList.remove('is-dragging');
    };
    ba.addEventListener('pointerup', end);
    ba.addEventListener('pointercancel', end);

    handle.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 10 : 2;
      const map = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -10, PageUp: 10 };
      if (e.key in map) { setPos(pos + map[e.key]); interacted = true; e.preventDefault(); }
      else if (e.key === 'Home') { setPos(0); interacted = true; e.preventDefault(); }
      else if (e.key === 'End') { setPos(100); interacted = true; e.preventDefault(); }
    });

    // One gentle sweep the first time the slider comes into view, to show it can move.
    if ('IntersectionObserver' in window && !reduceMotion.matches) {
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((en) => en.isIntersecting)) return;
        io.disconnect();
        setTimeout(() => {
          if (interacted) return;
          const keys = [[0, 50], [700, 28], [1500, 66], [2200, 50]];
          const t0 = performance.now();
          const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
          const tick = (now) => {
            if (interacted) return;
            const t = now - t0;
            let i = 0;
            while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
            const [ta, pa] = keys[i];
            const [tb, pb] = keys[i + 1];
            const k = clamp((t - ta) / (tb - ta), 0, 1);
            setPos(pa + (pb - pa) * ease(k));
            if (t < keys[keys.length - 1][0]) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }, 600);
      }, { threshold: 0.55 });
      io.observe(ba);
    }
    setPos(50);
  }

  /* ============ 4. Process progress ============ */
  const steps = $('[data-steps]');
  const stepItems = steps ? $$('.step', steps) : [];
  function updateSteps() {
    if (!steps) return;
    const vh = window.innerHeight;
    const rect = steps.getBoundingClientRect();
    const start = vh * 0.85;
    const endY = vh * 0.35;
    const p = clamp((start - rect.top) / (start - endY), 0, 1);
    steps.style.setProperty('--progress', p.toFixed(3));
    stepItems.forEach((s, i) => {
      const r = s.getBoundingClientRect();
      const horizontal = window.innerWidth >= 900;
      const reached = horizontal ? p >= (i + 0.35) / stepItems.length : r.top < vh * 0.72;
      s.classList.toggle('is-reached', reached);
    });
  }

  /* ============ 5. Inspection light on gallery ============ */
  $$('[data-light]').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
      el.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
    });
  });

  /* ============ 6. Finder ============ */
  const finder = $('[data-finder]');
  if (finder) {
    const q2 = $('[data-q2]');
    const q2Title = $('[data-q2-title]');
    const result = $('[data-finder-result]');
    const out = {
      title: $('[data-r-title]'),
      text: $('[data-r-text]'),
      list: $('[data-r-list]'),
    };
    const GOALS = {
      look: 'Улучшить внешний вид кузова',
      protect: 'Защитить лакокрасочное покрытие',
      interior: 'Привести в порядок салон',
      complex: 'Комплексный уход',
    };
    const Q2 = {
      body: {
        title: 'В каком состоянии кузов?',
        options: [['new', 'Новый или почти новый'], ['light', 'Есть мелкие царапины и потёртости'], ['heavy', 'Заметные дефекты, тусклый цвет']],
        def: 'light',
      },
      interior: {
        title: 'Что беспокоит в салоне?',
        options: [['dirt', 'Общая загрязнённость'], ['stains', 'Пятна на сиденьях или потолке'], ['leather', 'Потёртая или пересохшая кожа']],
        def: 'dirt',
      },
    };
    const CAR = 'Марку, модель и размер автомобиля';
    const R = {
      look: {
        new: { title: 'Детейлинг-мойка и защитное покрытие', service: 'Защитные покрытия',
          text: 'На новом кузове обычно нечего исправлять. Достаточно аккуратной мойки и защитного покрытия, которое поможет дольше сохранить заводской блеск. Если на осмотре найдём следы неаккуратной предпродажной подготовки, предложим лёгкую доводку.',
          list: [CAR, 'Есть ли следы предпродажной полировки или мойки щётками', 'Как часто и где моется автомобиль'] },
        light: { title: 'Полировка кузова', service: 'Полировка кузова',
          text: 'Мелкие царапины и потёртости обычно убираются полировкой в один-два этапа. После неё стоит подумать о защитном покрытии, чтобы результат держался дольше.',
          list: [CAR, 'Толщину лака по замерам на осмотре', 'Нужна ли защита после полировки'] },
        heavy: { title: 'Восстановительная полировка', service: 'Полировка кузова',
          text: 'Тусклый цвет и заметные царапины требуют полировки в несколько этапов. Сначала проверим толщину лака: она показывает, сколько можно снять без риска. Царапины до грунта полировкой не убираются, это обсудим на осмотре.',
          list: [CAR, 'Толщину лака и следы прошлых покрасок', 'Какие дефекты для вас важнее всего'] },
      },
      protect: {
        new: { title: 'Защитная плёнка на зоны риска', service: 'Защитная плёнка',
          text: 'Пока лак в хорошем состоянии, его проще всего сохранить. Плёнка на капоте, бампере, фарах и порогах принимает сколы от камней, а остальной кузов можно закрыть защитным покрытием.',
          list: ['Какие зоны закрыть: частично или весь кузов', 'Глянцевую или сатиновую плёнку', 'Где ездит автомобиль: город, трасса, зима'] },
        light: { title: 'Лёгкая полировка, затем защита', service: 'Защитные покрытия',
          text: 'Защищать лучше уже выровненную поверхность: плёнка и покрытие сохранят под собой и достоинства, и недостатки лака. Сначала убираем мелкие дефекты, затем наносим покрытие или плёнку.',
          list: [CAR, 'Что выбрать: покрытие, плёнку или их сочетание', 'Толщину лака по замерам'] },
        heavy: { title: 'Сначала полировка, потом защита', service: 'Полировка кузова',
          text: 'При заметных дефектах защиту наносят только после восстановления лака, иначе она закрепит их под собой. Начнём с осмотра и замеров, затем предложим порядок работ.',
          list: ['Толщину лака и следы прошлых покрасок', 'Какие дефекты убираются полировкой, а какие нет', 'Вариант защиты после полировки'] },
      },
      interior: {
        dirt: { title: 'Комплексная чистка салона', service: 'Уход за салоном',
          text: 'Сухая уборка, химчистка текстиля, очистка кожи и обработка пластика за один визит. Средства подбираем под материал каждой поверхности.',
          list: ['Материалы отделки: ткань, кожа, алькантара', 'Размер салона и число рядов сидений', 'Есть ли пятна, которые нужно разобрать отдельно'] },
        stains: { title: 'Химчистка с разбором пятен', service: 'Уход за салоном',
          text: 'Разные пятна требуют разных средств, поэтому сначала выясняем их происхождение. Большинство бытовых загрязнений удаляется, но следы чернил, краски или старые пятна могут остаться частично. Об этом скажем до начала работ.',
          list: ['Происхождение и давность пятен', 'Материал сидений и потолка', 'Нужна ли защитная пропитка после чистки'] },
        leather: { title: 'Очистка и уход за кожей', service: 'Уход за салоном',
          text: 'Очистка убирает загрязнения из пор кожи, пропитка возвращает ей мягкость. Если на потёртостях стёрлась краска, нужно восстановление цвета. На осмотре скажем, можно ли его сделать.',
          list: ['Тип кожи и степень износа', 'Есть ли трещины и стёртая краска', 'Как часто планируете обслуживать салон'] },
      },
      complex: {
        new: { title: 'Комплексный уход за новым автомобилем', service: 'Комплексный уход',
          text: 'Мойка, защита кузова покрытием или плёнкой и защитная пропитка салона. Хороший момент, чтобы надолго сохранить заводское состояние.',
          list: [CAR, 'Чем защитить кузов: покрытием, плёнкой или вместе', 'Материалы отделки салона'] },
        light: { title: 'Полировка, защита и салон', service: 'Комплексный уход',
          text: 'За один визит выравниваем лак, наносим защиту и приводим в порядок салон. Порядок и объём работ уточним на осмотре.',
          list: [CAR, 'Толщину лака по замерам', 'Состояние и материалы салона'] },
        heavy: { title: 'Комплексное восстановление', service: 'Комплексный уход',
          text: 'Многоэтапная полировка, защита кузова и глубокая чистка салона. Это самый объёмный вариант, поэтому сначала оценим, какие работы действительно нужны.',
          list: ['Толщину лака и следы прошлых покрасок', 'Какие дефекты кузова и салона важнее всего', 'Сроки: работа может занять несколько дней'] },
      },
    };

    let current = null;
    const getVal = (name) => (finder.querySelector(`input[name="${name}"]:checked`) || {}).value;

    function renderQ2(goal) {
      const set = goal === 'interior' ? Q2.interior : Q2.body;
      const prev = getVal('state');
      const keep = set.options.some(([v]) => v === prev) ? prev : set.def;
      q2Title.textContent = set.title;
      q2.innerHTML = '';
      set.options.forEach(([v, label]) => {
        const l = document.createElement('label');
        l.className = 'choice choice--compact';
        const inp = document.createElement('input');
        inp.type = 'radio';
        inp.name = 'state';
        inp.value = v;
        inp.checked = v === keep;
        const body = document.createElement('span');
        body.className = 'choice__body';
        const t = document.createElement('span');
        t.className = 'choice__title';
        t.textContent = label;
        body.appendChild(t);
        l.append(inp, body);
        q2.appendChild(l);
      });
    }

    function renderResult(animate) {
      const goal = getVal('goal') || 'look';
      const state = getVal('state');
      const r = (R[goal] || {})[state];
      if (!r) return;
      const stateLabel = (goal === 'interior' ? Q2.interior : Q2.body).options.find(([v]) => v === state)[1];
      current = { ...r, summary: `Подбор на сайте: ${GOALS[goal].toLowerCase()}; ${stateLabel.toLowerCase()}. Рекомендация: ${r.title}.` };
      out.title.textContent = r.title;
      out.text.textContent = r.text;
      out.list.innerHTML = '';
      r.list.forEach((item) => { const li = document.createElement('li'); li.textContent = item; out.list.appendChild(li); });
      if (animate && !reduceMotion.matches) {
        result.classList.remove('is-updating');
        void result.offsetWidth;
        result.classList.add('is-updating');
      }
    }

    finder.addEventListener('change', (e) => {
      if (e.target.name === 'goal') renderQ2(e.target.value);
      renderResult(true);
    });
    finder.addEventListener('submit', (e) => e.preventDefault());
    renderQ2(getVal('goal'));
    renderResult(false);

    const apply = $('[data-finder-apply]');
    apply.addEventListener('click', (e) => {
      e.preventDefault();
      if (current) goToForm(current.service, current.summary);
    });
  }

  /* ============ 7. FAQ ============ */
  $$('.faq-item__q').forEach((btn) => {
    const panel = document.getElementById(btn.getAttribute('aria-controls'));
    if (btn.getAttribute('aria-expanded') === 'true') panel.classList.add('is-open');
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      panel.classList.toggle('is-open', open);
    });
  });

  /* ============ 8. Form ============ */
  const METHODS = {
    phone: { type: 'tel', inputmode: 'tel', autocomplete: 'tel', label: 'Номер телефона', placeholder: '+7 900 000-00-00', hint: 'Перезвоним или напишем на этот номер.', name: 'Телефон' },
    telegram: { type: 'text', inputmode: 'text', autocomplete: 'off', label: 'Ник в Telegram', placeholder: '@username', hint: 'Напишем вам в Telegram.', name: 'Telegram' },
    email: { type: 'email', inputmode: 'email', autocomplete: 'email', label: 'Адрес электронной почты', placeholder: 'name@example.com', hint: 'Ответим письмом на этот адрес.', name: 'E-mail' },
  };
  const touched = new Set();

  function fieldEls(key) {
    const wrap = form.querySelector(`[data-field="${key}"]`);
    return { wrap, err: wrap && wrap.querySelector('[data-error]') };
  }
  function showError(key, input, msg) {
    const { err } = fieldEls(key);
    input.setAttribute('aria-invalid', 'true');
    if (err) { err.textContent = msg; err.hidden = false; }
  }
  function clearError(key) {
    const { wrap, err } = fieldEls(key);
    if (!wrap) return;
    wrap.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
    if (err) { err.textContent = ''; err.hidden = true; }
  }
  const currentMethod = () => (form.querySelector('input[name="method"]:checked') || {}).value || 'phone';

  function validate(key) {
    if (key === 'name') {
      const el = $('#f-name');
      const v = el.value.trim();
      if (!v) return showError('name', el, 'Укажите, как к вам обращаться.'), false;
      if (v.replace(/[^\p{L}]/gu, '').length < 2) return showError('name', el, 'Имя должно содержать хотя бы две буквы.'), false;
      clearError('name');
      return true;
    }
    if (key === 'contact') {
      const el = $('#f-contact');
      const v = el.value.trim();
      const m = currentMethod();
      if (!v) {
        const msg = { phone: 'Укажите номер телефона.', telegram: 'Укажите ник в Telegram.', email: 'Укажите адрес электронной почты.' }[m];
        return showError('contact', el, msg), false;
      }
      if (m === 'phone') {
        const digits = v.replace(/\D/g, '');
        if (/[^\d\s()+\-]/.test(v) || digits.length < 10 || digits.length > 15) {
          return showError('contact', el, 'Проверьте номер: нужно от 10 до 15 цифр, например +7 900 000-00-00.'), false;
        }
      }
      if (m === 'telegram' && !/^@?[A-Za-z0-9_]{5,32}$/.test(v)) {
        return showError('contact', el, 'Ник в Telegram — от 5 до 32 символов: латинские буквы, цифры и знак _. Например, @forme_client.'), false;
      }
      if (m === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
        return showError('contact', el, 'Проверьте адрес: в нём должны быть @ и домен, например name@mail.ru.'), false;
      }
      clearError('contact');
      return true;
    }
    if (key === 'service') {
      const el = serviceSelect;
      if (!el.value) return showError('service', el, 'Выберите услугу или вариант «Пока не знаю».'), false;
      clearError('service');
      return true;
    }
    return true;
  }

  function applyMethod() {
    const m = METHODS[currentMethod()];
    const el = $('#f-contact');
    el.type = m.type;
    el.setAttribute('inputmode', m.inputmode);
    el.setAttribute('autocomplete', m.autocomplete);
    el.placeholder = m.placeholder;
    $('[data-contact-label]').textContent = m.label;
    $('[data-contact-hint]').textContent = m.hint;
    if (touched.has('contact') && el.value.trim()) validate('contact'); else clearError('contact');
  }

  function buildMessage(data) {
    const lines = [
      'Здравствуйте! Хочу записаться на осмотр в FORME.',
      '',
      `Имя: ${data.name}`,
      `Связаться: ${METHODS[data.method].name} — ${data.contact}`,
      `Услуга: ${data.service}`,
    ];
    if (data.comment) lines.push(`Комментарий: ${data.comment}`);
    return lines.join('\n');
  }

  function showForm() {
    const done = $('[data-form-done]');
    done.hidden = true;
    form.hidden = false;
  }

  if (form) {
    form.addEventListener('change', (e) => {
      if (e.target.name === 'method') applyMethod();
      if (e.target === serviceSelect) { touched.add('service'); validate('service'); }
    });
    ['name', 'contact'].forEach((key) => {
      const el = key === 'name' ? $('#f-name') : $('#f-contact');
      el.addEventListener('blur', () => { if (el.value.trim()) touched.add(key); if (touched.has(key)) validate(key); });
      el.addEventListener('input', () => { if (el.getAttribute('aria-invalid') === 'true') validate(key); });
    });
    commentField.addEventListener('input', updateCounter);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      ['name', 'contact', 'service'].forEach((k) => touched.add(k));
      const results = ['name', 'contact', 'service'].map((k) => [k, validate(k)]);
      const firstBad = results.find(([, ok]) => !ok);
      if (firstBad) {
        const el = { name: $('#f-name'), contact: $('#f-contact'), service: serviceSelect }[firstBad[0]];
        el.focus();
        return;
      }
      const data = {
        name: $('#f-name').value.trim(),
        method: currentMethod(),
        contact: $('#f-contact').value.trim(),
        service: serviceSelect.value,
        comment: commentField.value.trim(),
      };
      const text = buildMessage(data);
      const done = $('[data-form-done]');
      $('[data-message]').value = text;
      const email = ($('[data-studio-email]') || {}).textContent || '';
      const mailto = $('[data-mailto]');
      mailto.href = `mailto:${email.trim()}?subject=${encodeURIComponent('Заявка на осмотр — FORME')}&body=${encodeURIComponent(text)}`;
      $('[data-copy-status]').textContent = '';
      form.hidden = true;
      done.hidden = false;
      done.focus({ preventScroll: true });
      const r = done.getBoundingClientRect();
      if (r.top < 80 || r.top > window.innerHeight * 0.6) scrollToEl($('.contact__card'));
    });

    $('[data-edit]').addEventListener('click', () => {
      showForm();
      $('#f-name').focus();
    });

    $('[data-copy]').addEventListener('click', () => {
      const ta = $('[data-message]');
      const status = $('[data-copy-status]');
      const fallback = () => {
        ta.focus();
        ta.select();
        status.textContent = 'Не получилось скопировать автоматически. Текст выделен — скопируйте его вручную.';
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ta.value).then(
          () => { status.textContent = 'Текст скопирован. Вставьте его в письмо или сообщение студии.'; },
          fallback
        );
      } else fallback();
    });
    applyMethod();
    updateCounter();
  }

  /* ============ 9. Scroll reveal ============ */
  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    const els = $$('[data-reveal]');
    const vh = window.innerHeight;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    els.forEach((el) => {
      if (el.getBoundingClientRect().top > vh * 0.95) {
        el.classList.add('reveal-pending');
        io.observe(el);
      }
    });
  }

  /* ============ scroll loop ============ */
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      onScrollHeader();
      updateSteps();
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScrollHeader();
  updateSteps();
})();
