// رِفْق — صفحة الولي: يرى بيانات ابنه فقط، عبر رمزه
(function () {
  const R = window.Rifq, { esc, icon, REC, BEH, REC_ICON } = R;
  const app = document.getElementById('app');
  document.getElementById('mark').innerHTML = R.mark();
  document.getElementById('themeSlot').appendChild(R.themeButton());

  const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const params = new URLSearchParams(location.search);

  function renderGate(msg, prefill) {
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
    const go = () => { const c = cleanCode(input.value); if (c) load(c); else input.focus(); };
    document.getElementById('go').onclick = go;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  }

  function bar(pts, goal) {
    const pct = Math.max(0, Math.min(100, Math.round(100 * pts / Math.max(1, goal))));
    return `<div class="bar" role="progressbar" aria-valuenow="${pts}" aria-valuemin="0" aria-valuemax="${goal}"><i class="${pts >= goal ? 'done' : ''}" style="width:${pct}%"></i></div>`;
  }

  function renderReport(d, code) {
    const month = R.fmtDate(R.todayLocal(), { month: 'long' });
    const reached = d.month_points >= d.monthly_goal;
    const c = d.month_conduct || {};
    const conduct = [['good', 'جيد'], ['fine', 'حسن'], ['average', 'متوسط']].filter(([k]) => c[k] > 0)
      .map(([k, l]) => `${l} ×${c[k]}`).join(' · ');
    const hist = (d.history || []).map(h => `
      <article class="item ${esc(h.recitation || '')}">
        <div class="d">${esc(R.fmtDate(h.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</div>
        <div class="tags">
          ${h.recitation ? `<span class="tag ${esc(h.recitation)}">${icon(REC_ICON[h.recitation])}${esc(REC[h.recitation] || '')}</span>` : ''}
          ${h.points != null ? `<span class="tag pts">+${esc(h.points)}</span>` : ''}
          ${h.behavior ? `<span class="tag beh">السلوك: ${esc(BEH[h.behavior] || '')}</span>` : ''}
        </div>
        ${h.note ? `<div class="n">${esc(h.note)}</div>` : ''}
      </article>`).join('');

    app.innerHTML = `
      <section class="hero">
        <div class="kicker">ملف المتابعة</div>
        <h2>${esc(d.name)}</h2>
        <div class="goal"><span>هدف شهر ${esc(month)}</span><b>${esc(d.month_points)} <small>من ${esc(d.monthly_goal)} نقطة</small></b></div>
        ${bar(d.month_points, d.monthly_goal)}
        ${reached ? `<div class="achieved">${icon('star')}<span>ما شاء الله! حقق هدف هذا الشهر</span></div>` : ''}
        <div class="stats">
          <div class="stat"><b>${esc(d.total_points)}</b><small>مجموع النقاط</small></div>
          ${conduct ? `<div class="stat"><b style="font-size:.95rem">${esc(conduct)}</b><small>السلوك هذا الشهر</small></div>` : ''}
        </div>
      </section>
      <h3 class="sec">سجل الحصص</h3>
      ${hist || '<div class="empty">لا توجد حصص مسجلة بعد. سيظهر هنا تقدّمه بعد أول حصة بإذن الله.</div>'}
      <div class="foot">
        <button class="btn quiet sm" id="refresh">${icon('refresh')} تحديث</button><br>
        آخر تحديث: ${esc(new Date().toLocaleTimeString('ar-DZ-u-nu-latn', { hour: '2-digit', minute: '2-digit' }))}<br>
        وفقنا الله وإياكم لتربية أبنائنا على القرآن
        <br><a href="#" id="other" style="color:var(--muted)">استعمال رمز آخر</a>
      </div>`;
    document.getElementById('refresh').onclick = () => load(code, true);
    document.getElementById('other').onclick = e => { e.preventDefault(); R.store.del('rifq_code'); history.replaceState(null, '', location.pathname); renderGate(); };
  }

  async function load(code, quiet) {
    if (!quiet) app.innerHTML = '<div class="spinner"></div>';
    try {
      const d = await R.rpc('parent_get_history', { p_code: code });
      R.store.set('rifq_code', code);
      renderReport(d, code);
    } catch (e) {
      R.store.del('rifq_code');
      if (quiet) R.toast(e.message, 'err'); else renderGate(e.message, code);
    }
  }

  const start = cleanCode(params.get('code')) || cleanCode(R.store.get('rifq_code'));
  if (start) load(start); else renderGate();
})();
