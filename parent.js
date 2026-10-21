// رِفْق — تطبيق الولي: ثلاث صفحات بشريط تنقل سفلي (الرئيسية · الصدارة · السجل)
// كل البيانات تأتي من دالة واحدة (parent_get_app) وتُحسب في الخادم؛ هنا عرض فقط.
(function () {
  const R = window.Rifq, { esc, icon, REC, BEH, REC_ICON } = R;
  const app = document.getElementById('app');
  const nav = document.getElementById('nav'), navIn = document.getElementById('navIn');
  const refreshBtn = document.getElementById('refreshBtn');
  document.getElementById('mark').innerHTML = R.mark();
  refreshBtn.innerHTML = icon('refresh');
  document.getElementById('themeSlot').appendChild(R.themeButton());

  const ST = { code: '', data: null, tab: 'home', at: 0, loading: false };
  const CACHE_KEY = 'rifq_cache_v2';
  const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  function readCache(code) {
    try { const c = JSON.parse(R.store.get(CACHE_KEY) || 'null'); return c && c.code === code && c.data ? c : null; } catch (_) { return null; }
  }
  function writeCache(code, data) { R.store.set(CACHE_KEY, JSON.stringify({ code, at: Date.now(), data })); }

  // ---------------------------------------------------------------- عبارات مساعدة
  const ORD = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر',
    'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر'];
  const ord = n => ORD[n] || ('رقم ' + n);
  const ptsWord = n => (n === 1 ? 'نقطة واحدة' : n === 2 ? 'نقطتان' : n <= 10 ? n + ' نقاط' : n + ' نقطة');

  // رتب التكريم الشهرية حسب نسبة بلوغ الهدف (تُعدَّل هنا)
  const TIERS = [
    { min: 100, key: 'gold',   icon: 'crown',  name: 'تاج الإتقان الذهبي' },
    { min: 75,  key: 'silver', icon: 'shield', name: 'فارس الحفظ الفضي' },
    { min: 50,  key: 'bronze', icon: 'star',   name: 'نجم المثابرة البرونزي' },
    { min: 0,   key: 'seed',   icon: 'sprout', name: 'بذرة الحفظ' },
  ];
  const tierOf = pct => TIERS.find(t => pct >= t.min);
  function motive(pct, left) {
    if (pct >= 100) return 'ما شاء الله! حقق هدف هذا الشهر، بارك الله فيه';
    if (pct >= 75) return `اقترب كثيراً! بقيت ${ptsWord(left)} فقط على الهدف`;
    if (pct >= 50) return 'تجاوز نصف الطريق، واصل يا بطل';
    if (pct >= 25) return 'تقدّم طيب، كل نجمة خطوة نحو الهدف';
    return 'بداية الشهر فرصة جميلة، فلنجمع النجوم معاً';
  }

  // ---------------------------------------------------------------- بوابة الرمز
  function hideChrome() { nav.hidden = true; refreshBtn.hidden = true; document.body.classList.remove('has-nav'); }
  function renderGate(msg, prefill) {
    hideChrome();
    app.innerHTML = `
      <div class="card center">
        <div class="logo-big">${R.mark()}</div>
        <h2>متابعة ابنك</h2>
        <p class="muted small" style="margin-bottom:14px">أدخل رمز المتابعة الذي أرسله لك الأستاذ، أو افتح الرابط الذي وصلك مباشرة.</p>
        <label class="f"><input type="text" id="code" class="ltr" dir="ltr" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX" value="${esc(prefill || '')}"></label>
        <button class="btn block" id="go">عرض السجل</button>
        <p class="small" id="err" style="color:var(--orange);margin-top:10px;font-weight:700" ${msg ? '' : 'hidden'}>${esc(msg || '')}</p>
      </div>`;
    const input = document.getElementById('code');
    const go = () => { const c = cleanCode(input.value); if (c) { app.innerHTML = '<div class="spinner"></div>'; load(c); } else input.focus(); };
    document.getElementById('go').onclick = go;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  }

  // ---------------------------------------------------------------- الرئيسية
  function homeView(d) {
    const s = d.student, goal = s.monthly_goal || 20, mp = s.month_points || 0;
    const pct = Math.round(100 * mp / goal), tier = tierOf(pct);
    const month = R.fmtDate(s.month_start, { month: 'long' });
    const c = s.conduct || {};
    const conduct = [['good', 'جيد'], ['fine', 'حسن'], ['average', 'متوسط']].filter(([k]) => c[k] > 0)
      .map(([k, l]) => `<span class="tag beh">${l} ×${esc(c[k])}</span>`).join('');
    const pctTxt = v => (v == null ? '—' : esc(v) + '%');
    const note = d.last_note;
    return `
      <section class="hero">
        <div class="kicker">ملف المتابعة</div>
        <h2>${esc(s.name)}</h2>
        <div class="codeline">الرمز الدائم: <bdi class="code-hint">••••-••••-${esc(s.code_hint)}</bdi></div>
        <div class="tier t-${tier.key}"><span class="ic">${icon(tier.icon)}</span><span><b>${esc(tier.name)}</b><small>رتبة التكريم · شهر ${esc(month)}</small></span></div>
        <div class="goalrow"><div><div class="lbl">هدف شهر ${esc(month)}</div><div class="big">${esc(mp)} <small>/ ${esc(goal)}</small></div></div><div class="pct">${pct}%</div></div>
        <div class="bar" role="progressbar" aria-valuenow="${esc(mp)}" aria-valuemin="0" aria-valuemax="${esc(goal)}"><i class="${pct >= 100 ? 'done' : ''}" style="width:${Math.min(100, pct)}%"></i></div>
        <div class="motive">${esc(motive(pct, goal - mp))}</div>
      </section>
      <div class="kpis">
        <div class="kpi" style="--kc:var(--gold)"><span class="ic">${icon('star')}</span><b>${esc(s.total_points)}</b><small>مجموع النقاط</small></div>
        <div class="kpi" style="--kc:var(--sky)"><span class="ic">${icon('calendar')}</span><b>${esc(s.month_points)}</b><small>نقاط الشهر</small></div>
        <div class="kpi" style="--kc:var(--emerald)"><span class="ic">${icon('target')}</span><b>${pctTxt(s.mastery_pct)}</b><small>نسبة الإتقان</small></div>
        <div class="kpi" style="--kc:var(--orange)"><span class="ic">${icon('check')}</span><b>${pctTxt(s.attendance_pct)}</b><small>نسبة المواظبة</small></div>
      </div>
      ${conduct ? `<div class="conduct">السلوك هذا الشهر: ${conduct}</div>` : ''}
      <section class="notecard">
        <div class="h">${icon('note')}<span>آخر ملاحظة من الأستاذ</span>${note ? `<time>${esc(R.fmtDate(note.date, { day: 'numeric', month: 'long' }))}</time>` : ''}</div>
        ${note ? `<p>${esc(note.text)}</p>` : '<p class="none">لا توجد ملاحظات بعد، وسيظهر هنا ما يكتبه الأستاذ لابنك.</p>'}
      </section>
      <div class="foot">
        آخر تحديث: ${esc(new Date(ST.at || Date.now()).toLocaleTimeString('ar-DZ-u-nu-latn', { hour: '2-digit', minute: '2-digit' }))}<br>
        وفقنا الله وإياكم لتربية أبنائنا على القرآن<br>
        <a href="#" data-act="other" style="color:var(--muted)">استعمال رمز آخر</a>
      </div>`;
  }

  // ---------------------------------------------------------------- لوحة الصدارة
  const medal = (rank, name, pts, me) =>
    `<div class="lbrow r${rank <= 3 ? rank : 0}${me ? ' me' : ''}"><span class="rk">${esc(rank)}</span>
       <span class="nm">${esc(name)}</span>${me ? `<span class="mine" title="ابنك">${icon('target')}</span>` : ''}
       <span class="pt">${esc(pts)}<small>نقطة</small></span></div>`;
  const masked = g =>
    `<div class="lbrow mask" aria-label="زميل"><span class="rk">${esc(g.rank)}</span>
       <span class="nm" aria-hidden="true">██████</span>${g.count > 1 ? `<span class="cnt">×${esc(g.count)}</span>` : ''}
       <span class="pt">${esc(g.points)}<small>نقطة</small></span></div>`;

  function boardMsg(lb) {
    const me = lb.me;
    if (!me) return 'ابدأ بجمع النجوم لتظهر في لوحة الصدارة';
    if (me.rank === 1) return 'أنت في الصدارة! حافظ على إتقانك، بارك الله فيك';
    if (lb.above) {
      const gap = lb.above.points - me.points, rk = ord(lb.above.rank);
      if (gap === 1) return `نقطة واحدة فقط تفصلك عن المركز ${rk}!`;
      if (gap === 2) return `نقطتان فقط تفصلانك عن المركز ${rk}!`;
      return `${ptsWord(gap)} فقط تفصلك عن المركز ${rk}!`;
    }
    return '';
  }

  function boardView(d) {
    const lb = d.leaderboard, month = R.fmtDate(d.student.month_start, { month: 'long' });
    const top = lb.top || [], me = lb.me;
    let rows = '';
    if (!top.length) {
      rows = '<div class="empty">ستظهر اللوحة بعد أول حصص هذا الشهر بإذن الله.</div>';
    } else {
      const parts = top.map(r => medal(r.rank, r.name, r.points, r.is_me));
      if (me && me.rank > lb.top_n) {
        const lastTop = Math.max(...top.map(r => r.rank));
        const showAbove = lb.above && lb.above.rank > lb.top_n;
        const firstShown = showAbove ? lb.above.rank : me.rank;
        if (firstShown > lastTop + 1) parts.push('<div class="lbsep" aria-hidden="true">···</div>');
        if (showAbove) parts.push(masked(lb.above));
        parts.push(medal(me.rank, d.student.name, me.points, true));
        if (lb.below) parts.push(masked(lb.below));
      }
      rows = `<div class="lb">${parts.join('')}</div>`;
    }
    const msg = boardMsg(lb);
    return `
      <div class="lbhead"><h2>لوحة الصدارة</h2><p>ترتيب شهر ${esc(month)} بحسب نقاط الشهر</p></div>
      ${rows}
      ${msg ? `<div class="lbmsg">${esc(msg)}</div>` : ''}
      <div class="lbnote">الترتيب يبدأ من جديد كل شهر. أسماء الزملاء خارج الأوائل محفوظة الخصوصية.</div>`;
  }

  // ---------------------------------------------------------------- سجل الحصص
  function recordsView(d) {
    const hist = d.history || [];
    if (!hist.length) return '<div class="empty">لا توجد حصص مسجلة بعد. سيظهر هنا تقدّمه بعد أول حصة بإذن الله.</div>';
    let html = '', cur = '';
    hist.forEach(h => {
      const m = String(h.date).slice(0, 7);
      if (m !== cur) {
        if (cur) html += '</div>';
        cur = m;
        html += `<h3 class="sec">${esc(R.fmtDate(h.date, { month: 'long', year: 'numeric' }))}</h3><div class="tl">`;
      }
      html += `<article class="tli ${esc(h.recitation || '')}"><div class="item">
        <div class="d">${esc(R.fmtDate(h.date, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
        <div class="tags">
          ${h.recitation ? `<span class="tag ${esc(h.recitation)}">${icon(REC_ICON[h.recitation])}${esc(REC[h.recitation] || '')}</span>` : ''}
          ${h.points != null ? `<span class="tag pts">+${esc(h.points)}</span>` : ''}
          ${h.behavior ? `<span class="tag beh">السلوك: ${esc(BEH[h.behavior] || '')}</span>` : ''}
        </div>
        ${h.note ? `<div class="n">${esc(h.note)}</div>` : ''}
      </div></article>`;
    });
    return html + '</div>';
  }

  // ---------------------------------------------------------------- الهيكل والتنقل
  function tabsFor(d) {
    const t = [{ k: 'home', i: 'home', l: 'الرئيسية' }];
    if (d.leaderboard && d.leaderboard.enabled) t.push({ k: 'board', i: 'trophy', l: 'الصدارة' });
    t.push({ k: 'records', i: 'list', l: 'السجل' });
    return t;
  }
  function render() {
    const d = ST.data; if (!d) return;
    const tabs = tabsFor(d);
    if (!tabs.some(t => t.k === ST.tab)) ST.tab = 'home';
    const body = ST.tab === 'home' ? homeView(d) : ST.tab === 'board' ? boardView(d) : recordsView(d);
    app.innerHTML = `<div class="view">${body}</div>`;
    navIn.innerHTML = tabs.map(t =>
      `<button type="button" data-tab="${t.k}" aria-current="${ST.tab === t.k ? 'page' : 'false'}">${icon(t.i)}<span>${t.l}</span></button>`).join('');
    nav.hidden = false; refreshBtn.hidden = false; document.body.classList.add('has-nav');
  }
  navIn.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]'); if (!b || b.dataset.tab === ST.tab) return;
    ST.tab = b.dataset.tab; render(); window.scrollTo({ top: 0 });
  });
  app.addEventListener('click', e => {
    const a = e.target.closest('[data-act=other]'); if (!a) return;
    e.preventDefault();
    R.store.del('rifq_code'); R.store.del(CACHE_KEY); ST.data = null; ST.code = '';
    history.replaceState(null, '', location.pathname); renderGate();
  });
  refreshBtn.addEventListener('click', () => { if (ST.code && !ST.loading) load(ST.code, { quiet: true, toast: true }); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ST.code && ST.data && !ST.loading && Date.now() - ST.at > 120000) load(ST.code, { quiet: true });
  });

  // ---------------------------------------------------------------- التحميل
  async function load(code, o) {
    o = o || {};
    ST.loading = true; refreshBtn.classList.add('spin');
    try {
      const d = await R.rpc('parent_get_app', { p_code: code });
      ST.code = code; ST.data = d; ST.at = Date.now();
      R.store.set('rifq_code', code); writeCache(code, d);
      render();
      if (o.toast) R.toast('تم التحديث ✓', 'ok');
    } catch (e) {
      const known = /غير صحيح|الاتصال/.test(e.message);
      const msg = known ? e.message : 'الخدمة غير متاحة مؤقتاً، حاول بعد قليل';
      if (!known && window.console) console.error(e);
      if (/غير صحيح/.test(e.message)) {
        R.store.del('rifq_code'); R.store.del(CACHE_KEY); ST.data = null; renderGate(msg, code);
      } else if (ST.data) {
        R.toast(msg, 'err');
      } else {
        renderGate(msg, code);
      }
    } finally { ST.loading = false; refreshBtn.classList.remove('spin'); }
  }

  // ---------------------------------------------------------------- البدء: من الذاكرة أولاً ثم تحديث
  const params = new URLSearchParams(location.search);
  const start = cleanCode(params.get('code')) || cleanCode(R.store.get('rifq_code'));
  if (!start) renderGate();
  else {
    const c = readCache(start);
    if (c) { ST.code = start; ST.data = c.data; ST.at = c.at; render(); load(start, { quiet: true }); }
    else load(start);
  }
})();
