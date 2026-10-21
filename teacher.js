// رِفْق — لوحة الأستاذ: دخول ببريد وكلمة سر (Supabase Auth) + تسجيل سريع للحصة
(function () {
  const R = window.Rifq, C = window.RIFQ;
  const { esc, icon, toast, REC, BEH } = R;
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  const app = document.getElementById('app');

  const S = {
    students: [], ov: {}, scale: { excellent: 3, recited: 1, not_recited: 0 },
    day: R.todayLocal(), rows: {}, tab: 'day', busy: false, cfg: null,
  };

  // ---------------------------------------------------------------- أدوات
  const blank = () => ({ rec: null, beh: null, note: '', pnote: '', saved: null, open: false });
  const snap = r => JSON.stringify([r.rec || null, r.beh || null, (r.note || '').trim(), (r.pnote || '').trim()]);
  const savedSnap = s => JSON.stringify([s.rec || null, s.beh || null, (s.note || '').trim(), (s.pnote || '').trim()]);
  const isDirty = r => (r.saved ? snap(r) !== savedSnap(r.saved) : !!(r.rec || r.beh));
  const fmtPts = v => (v > 0 ? '+' + v : String(v));
  const fmtCode = c => String(c || '').replace(/(.{4})(?=.)/g, '$1-');
  const parentLink = code => new URL('./', location.href).href + '?code=' + code;
  const stu = id => S.students.find(s => s.id === id);

  // رقم واتساب بالصيغة الدولية (الجزائر 213)
  function waNumber(raw) {
    let d = String(raw || '').replace(/[^\d+]/g, '');
    if (!d) return '';
    if (d.startsWith('+')) d = d.slice(1);
    else if (d.startsWith('00')) d = d.slice(2);
    else if (d.startsWith('0')) d = '213' + d.slice(1);
    else if (d.length === 9) d = '213' + d;
    return d.replace(/\D/g, '');
  }
  function openWhatsapp(phone, text) {
    window.open('https://wa.me/' + waNumber(phone) + '?text=' + encodeURIComponent(text), '_blank');
  }
  function reportText(st, r) {
    const n = st.name, L = ['السلام عليكم ورحمة الله،'];
    if (r.rec === 'excellent') L.push(`استظهر ابنكم ${n} مقرر اليوم في حصة القرآن بحفظ ممتاز، بارك الله فيه.`);
    else if (r.rec === 'recited') L.push(`استظهر ابنكم ${n} مقرر اليوم في حصة القرآن. نوصي بمراجعة المقرر لتثبيت الحفظ.`);
    else if (r.rec === 'not_recited') L.push(`لم يتمكن ابنكم ${n} من استظهار مقرر اليوم. سنعمل على مساعدته في المراجعة والتثبيت في الحصص القادمة.`);
    else if (r.rec === 'absent') L.push(`سُجّل غياب ابنكم ${n} عن حصة اليوم.`);
    else L.push(`تقرير حصة اليوم للتلميذ ${n}:`);
    if (r.beh && r.rec !== 'absent') L.push(`السلوك العام: ${BEH[r.beh]}.`);
    if ((r.note || '').trim()) L.push(`ملاحظة الأستاذ: ${r.note.trim()}`);
    L.push('', 'متابعة سجله كاملاً: ' + parentLink(st.code), 'وفقنا الله وإياكم لتربية أبنائنا على القرآن.');
    return L.join('\n');
  }

  function isAuthErr(e) { return e && (e.status === 401 || /JWT|expired|not authenticated/i.test(e.message || '')); }
  async function fail(e) {
    if (isAuthErr(e)) { toast('انتهت الجلسة، سجّل الدخول من جديد', 'err'); await sb.auth.signOut(); renderLogin(); }
    else toast((e && e.message) || 'حدث خطأ، أعد المحاولة', 'err');
  }

  // ---------------------------------------------------------------- نافذة سفلية
  let modalEl = null, onCancel = null;
  function openSheet(html, mount, cancel) {
    closeSheet(true);
    modalEl = document.createElement('div'); modalEl.className = 'modal';
    modalEl.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
    onCancel = cancel || null;
    modalEl.addEventListener('click', e => { if (e.target === modalEl) closeSheet(); });
    document.body.appendChild(modalEl);
    if (mount) mount(modalEl.firstElementChild);
  }
  function closeSheet(silent) {
    if (!modalEl) return;
    modalEl.remove(); modalEl = null;
    const cb = onCancel; onCancel = null;
    if (!silent && cb) cb();
  }
  function confirmSheet(title, text, okLabel, danger) {
    return new Promise(resolve => {
      openSheet(`<h3>${esc(title)}</h3><p class="muted small">${esc(text)}</p>
        <div class="row2"><button class="btn ${danger ? 'danger' : ''}" data-s="ok">${esc(okLabel)}</button><button class="btn ghost" data-s="no">إلغاء</button></div>`,
        root => root.addEventListener('click', e => {
          const b = e.target.closest('[data-s]'); if (!b) return;
          closeSheet(true); resolve(b.dataset.s === 'ok');
        }), () => resolve(false));
    });
  }

  // ---------------------------------------------------------------- الدخول
  function topBar(actions) {
    return `<div class="top"><div class="brand"><span class="mark">${R.mark()}</span><h1>رِفْق<small>لوحة الأستاذ</small></h1></div>
      <span id="themeSlot"></span>${actions || ''}</div>`;
  }
  function mountTheme() { const s = document.getElementById('themeSlot'); if (s) s.appendChild(R.themeButton()); }

  function renderLogin(msg) {
    app.innerHTML = topBar() + `
      <form class="card" id="loginForm" autocomplete="on">
        <div class="center"><div class="logo-big">${R.mark()}</div><h2>دخول الأستاذ</h2></div>
        <label class="f"><span>البريد الإلكتروني</span><input type="email" id="em" class="ltr" dir="ltr" autocomplete="username" required></label>
        <label class="f"><span>كلمة السر</span><input type="password" id="pw" class="ltr" dir="ltr" autocomplete="current-password" required></label>
        <button class="btn block" id="loginBtn">دخول</button>
        <p class="small" id="lerr" style="color:var(--orange);margin-top:10px;font-weight:700" ${msg ? '' : 'hidden'}>${esc(msg || '')}</p>
      </form>`;
    mountTheme();
    document.getElementById('loginForm').addEventListener('submit', async ev => {
      ev.preventDefault();
      const btn = document.getElementById('loginBtn'); btn.disabled = true;
      const { error } = await sb.auth.signInWithPassword({
        email: document.getElementById('em').value.trim(), password: document.getElementById('pw').value,
      });
      btn.disabled = false;
      if (error) {
        const m = /invalid login/i.test(error.message) ? 'البريد أو كلمة السر غير صحيحة' : (error.message || 'تعذّر الدخول');
        const el = document.getElementById('lerr'); el.textContent = m; el.hidden = false; return;
      }
      enter();
    });
  }

  function renderNotTeacher() {
    app.innerHTML = topBar() + `<div class="card center"><h2>هذا الحساب ليس حساب الأستاذ</h2>
      <p class="muted small" style="margin:6px 0 14px">اربط حسابك بتشغيل سطر rifq_register_teacher في Supabase (انظر دليل التنصيب).</p>
      <button class="btn block" data-act="logout">خروج</button></div>`;
    mountTheme();
  }

  // ---------------------------------------------------------------- تحميل البيانات
  async function loadStudents() {
    const [st, ov, sc, cf] = await Promise.all([
      sb.from('rifq_students').select('id,name,phone,code,monthly_goal').order('name'),
      sb.rpc('teacher_overview'),
      sb.from('rifq_scale').select('recitation,points'),
      sb.from('rifq_config').select('key,value'),
    ]);
    for (const r of [st, ov, sc]) if (r.error) throw r.error;
    if (cf.error) S.cfg = null;           // قاعدة قديمة: شغّل schema.sql المحدّث
    else { S.cfg = {}; (cf.data || []).forEach(x => { S.cfg[x.key] = x.value; }); }
    S.students = st.data || [];
    S.ov = {}; (ov.data || []).forEach(o => { S.ov[o.student_id] = o; });
    (sc.data || []).forEach(x => { S.scale[x.recitation] = x.points; });
  }
  async function refreshOverview() {
    const { data, error } = await sb.rpc('teacher_overview');
    if (error) throw error;
    S.ov = {}; (data || []).forEach(o => { S.ov[o.student_id] = o; });
  }
  async function loadDay(day) {
    const { data, error } = await sb.from('rifq_sessions')
      .select('student_id,recitation,behavior,note,private_note').eq('session_date', day);
    if (error) throw error;
    const by = {}; (data || []).forEach(x => { by[x.student_id] = x; });
    S.day = day; S.rows = {};
    S.students.forEach(st => {
      const x = by[st.id];
      if (!x) { S.rows[st.id] = blank(); return; }
      const v = { rec: x.recitation, beh: x.behavior, note: x.note || '', pnote: x.private_note || '' };
      S.rows[st.id] = Object.assign({}, v, { saved: Object.assign({}, v), open: false });
    });
  }

  async function enter() {
    app.innerHTML = '<div class="spinner"></div>';
    try {
      const { data, error } = await sb.rpc('rifq_is_teacher');
      if (error) throw error;
      if (data !== true) return renderNotTeacher();
      await loadStudents(); await loadDay(S.day);
      renderShell();
    } catch (e) { await fail(e); if (!document.querySelector('#loginForm')) renderLogin(); }
  }

  // ---------------------------------------------------------------- الهيكل
  function renderShell() {
    app.innerHTML = topBar(`
      <button class="iconbtn" data-act="export" title="نسخة احتياطية (Excel)" aria-label="نسخة احتياطية">${icon('download')}</button>
      <button class="iconbtn" data-act="logout" title="خروج" aria-label="خروج">${icon('logout')}</button>`) + `
      <div class="tabs" role="tablist">
        <button data-act="tab" data-v="day" aria-selected="${S.tab === 'day'}">حصة اليوم</button>
        <button data-act="tab" data-v="students" aria-selected="${S.tab === 'students'}">التلاميذ</button>
      </div><div id="view"></div>`;
    mountTheme(); renderView();
  }
  function renderView() {
    document.querySelectorAll('[data-act=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.v === S.tab)));
    document.getElementById('view').innerHTML = S.tab === 'day' ? dayView() : studentsView();
    if (S.tab === 'day') updateBar();
  }

  // ---------------------------------------------------------------- حصة اليوم
  function stateHtml(r) {
    if (isDirty(r)) return `<span class="state un">غير محفوظ</span>`;
    if (r.saved) return `<span class="state ok">${icon('check')}محفوظ</span>`;
    return '';
  }
  function rowHtml(st) {
    const r = S.rows[st.id] || (S.rows[st.id] = blank());
    const o = S.ov[st.id] || {}, pts = Number(o.month_points) || 0, goal = st.monthly_goal || 20;
    const done = pts >= goal, pct = Math.min(100, Math.round(100 * pts / goal));
    const dirty = isDirty(r);
    const rec = [['excellent', 'ممتاز'], ['recited', 'استظهر'], ['not_recited', 'لم يستظهر'], ['absent', 'غائب']].map(([k, l]) =>
      `<button type="button" class="opt${r.rec === k ? ' on' : ''}" data-act="rec" data-id="${st.id}" data-v="${k}">${l}<small>${S.scale[k] != null ? fmtPts(S.scale[k]) : '—'}</small></button>`).join('');
    const beh = [['good', 'جيد'], ['fine', 'حسن'], ['average', 'متوسط']].map(([k, l]) =>
      `<button type="button" class="opt${r.beh === k ? ' on' : ''}" data-act="beh" data-id="${st.id}" data-v="${k}">${l}</button>`).join('');
    const hasNote = !!((r.note || '').trim() || (r.pnote || '').trim());
    return `<article class="srow${dirty ? ' dirty' : ''}" data-id="${st.id}">
      <div class="srow-top">
        <div class="sname"><span class="t">${esc(st.name)}</span><span class="stwrap">${stateHtml(r)}</span></div>
        <div class="mini"><span class="pts${done ? ' done' : ''}">${pts} / ${goal}</span><div class="bar"><i class="${done ? 'done' : ''}" style="width:${pct}%"></i></div></div>
      </div>
      <div class="opts rec">${rec}</div>
      <div class="opts beh"><span class="lbl">السلوك</span>${beh}
        <button type="button" class="notebtn${hasNote ? ' has' : ''}" data-act="note" data-id="${st.id}" aria-label="ملاحظات">${icon('note')}</button></div>
      <div class="notes" ${r.open ? '' : 'hidden'}>
        <label>ملاحظة تظهر للولي</label><input type="text" maxlength="300" data-f="note" data-id="${st.id}" value="${esc(r.note)}" placeholder="مثال: اجتهد في المراجعة">
        <label>ملاحظة خاصة بي (لا تظهر للولي)</label><input type="text" maxlength="500" data-f="pnote" data-id="${st.id}" value="${esc(r.pnote)}">
      </div>
      <div class="srow-foot" ${r.saved && !dirty ? '' : 'hidden'}>
        <button class="btn wa sm" data-act="wa" data-id="${st.id}">${icon('send')} إرسال التقرير للولي (واتساب)</button>
      </div>
    </article>`;
  }
  function dayView() {
    const list = S.students.map(rowHtml).join('') ||
      '<div class="empty">لا يوجد تلاميذ بعد. أضفهم من تبويب «التلاميذ».</div>';
    return `<div class="daybar">
        <button class="iconbtn" data-act="prev" aria-label="اليوم السابق">${icon('chevR')}</button>
        <input type="date" id="day" value="${esc(S.day)}">
        <button class="iconbtn" data-act="next" aria-label="اليوم التالي">${icon('chevL')}</button></div>
      <div class="summary"><span><b>${esc(R.fmtDate(S.day, { weekday: 'long', day: 'numeric', month: 'long' }))}</b></span>
        <button class="btn quiet sm" data-act="today">اليوم</button></div>
      <div id="rows">${list}</div>
      <div class="savebar"><div class="info" id="info"></div><button class="btn" id="saveBtn" data-act="save">حفظ</button></div>`;
  }
  function renderRows() {
    const el = document.getElementById('rows'); if (!el) return;
    el.innerHTML = S.students.map(rowHtml).join('') || '<div class="empty">لا يوجد تلاميذ بعد. أضفهم من تبويب «التلاميذ».</div>';
    updateBar();
  }
  function updateRow(id) {
    const el = document.querySelector(`.srow[data-id="${id}"]`), st = stu(id);
    if (el && st) el.outerHTML = rowHtml(st);
    updateBar();
  }
  function refreshRowState(id) {
    const el = document.querySelector(`.srow[data-id="${id}"]`), r = S.rows[id]; if (!el || !r) return;
    const d = isDirty(r);
    el.classList.toggle('dirty', d);
    el.querySelector('.stwrap').innerHTML = stateHtml(r);
    el.querySelector('.srow-foot').hidden = !(r.saved && !d);
    el.querySelector('.notebtn').classList.toggle('has', !!((r.note || '').trim() || (r.pnote || '').trim()));
    updateBar();
  }
  function counts() {
    let ev = 0, dirty = 0;
    S.students.forEach(st => { const r = S.rows[st.id]; if (!r) return; if (r.rec || r.beh) ev++; if (isDirty(r)) dirty++; });
    return { ev, dirty, n: S.students.length };
  }
  function updateBar() {
    const info = document.getElementById('info'), btn = document.getElementById('saveBtn'); if (!info || !btn) return;
    const c = counts();
    info.innerHTML = `تم تقييم <b>${c.ev}</b> من ${c.n}` + (c.dirty ? ` · <b>${c.dirty}</b> بانتظار الحفظ` : ' · كل شيء محفوظ');
    btn.disabled = c.dirty === 0 || S.busy;
    btn.innerHTML = S.busy ? 'جارٍ الحفظ…' : (c.dirty ? `${icon('check')} حفظ (${c.dirty})` : 'محفوظ');
  }

  async function changeDay(day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day === S.day) { const i = document.getElementById('day'); if (i) i.value = S.day; return; }
    if (counts().dirty > 0) {
      const ok = await confirmSheet('تغييرات غير محفوظة', 'ما لم تحفظه لهذا اليوم سيُتجاهل إن انتقلت الآن.', 'تجاهل وانتقل', true);
      if (!ok) { const i = document.getElementById('day'); if (i) i.value = S.day; return; }
    }
    try { await loadDay(day); renderView(); } catch (e) { await fail(e); }
  }

  async function saveDay() {
    const ups = [], dels = [];
    S.students.forEach(st => {
      const r = S.rows[st.id]; if (!r || !isDirty(r)) return;
      if (!r.rec && !r.beh) { if (r.saved) dels.push(st.id); return; }
      ups.push({ student_id: st.id, session_date: S.day, recitation: r.rec || null, behavior: r.beh || null,
        note: (r.note || '').trim().slice(0, 300), private_note: (r.pnote || '').trim().slice(0, 500) });
    });
    if (!ups.length && !dels.length) return;
    S.busy = true; updateBar();
    try {
      if (ups.length) { const { error } = await sb.from('rifq_sessions').upsert(ups, { onConflict: 'student_id,session_date' }); if (error) throw error; }
      if (dels.length) { const { error } = await sb.from('rifq_sessions').delete().eq('session_date', S.day).in('student_id', dels); if (error) throw error; }
      ups.forEach(u => {
        const r = S.rows[u.student_id];
        r.note = u.note; r.pnote = u.private_note;
        r.saved = { rec: u.recitation, beh: u.behavior, note: u.note, pnote: u.private_note };
      });
      dels.forEach(id => { S.rows[id].saved = null; });
      await refreshOverview();
      toast('تم الحفظ ✓', 'ok');
    } catch (e) { await fail(e); }
    finally { S.busy = false; renderRows(); }
  }

  // ---------------------------------------------------------------- إدارة التلاميذ
  function studentsView() {
    const items = S.students.map(st => {
      const o = S.ov[st.id] || {}, pts = Number(o.month_points) || 0;
      return `<article class="stu" data-id="${st.id}">
        <div class="h"><div class="nm">${esc(st.name)}</div><span class="code">${esc(fmtCode(st.code))}</span></div>
        <div class="meta">${st.phone ? '<span dir="ltr">' + esc(st.phone) + '</span>' : 'بلا هاتف'} · هدف الشهر ${esc(st.monthly_goal)} · هذا الشهر ${pts}</div>
        <div class="acts">
          <button class="btn quiet sm" data-act="copylink" data-id="${st.id}">${icon('copy')} نسخ الرابط</button>
          <button class="btn wa sm" data-act="walink" data-id="${st.id}">${icon('send')} إرسال</button>
          <button class="btn ghost sm" data-act="edit" data-id="${st.id}">${icon('edit')} تعديل</button>
        </div></article>`;
    }).join('') || '<div class="empty">لا يوجد تلاميذ بعد. اضغط «إضافة تلميذ».</div>';
    const lbOn = !!(S.cfg && S.cfg.leaderboard_enabled === 'on');
    const lbCard = S.cfg ? `<div class="card" style="padding:14px 16px"><label class="sw"><input type="checkbox" id="lbToggle" ${lbOn ? 'checked' : ''}>
        <span><b>لوحة الصدارة للأولياء</b><small>يرى كل ولي أسماء الأوائل (${esc(S.cfg.leaderboard_top || 5)}) ونقاطهم، وترتيب ابنه بين زملائه بأسماء مخفية.</small></span></label></div>`
      : '<div class="card small muted">لتفعيل لوحة الصدارة شغّل ملف schema.sql المحدّث في Supabase.</div>';
    return lbCard + `<button class="btn block" data-act="addsheet" style="margin-bottom:6px">${icon('plus')} إضافة تلميذ</button>
      <h3 class="sec">التلاميذ (${S.students.length})</h3>${items}`;
  }

  function openAdd() {
    openSheet(`<h3>إضافة تلميذ</h3>
      <label class="f"><span>الاسم</span><input type="text" id="n_name" maxlength="80" autocomplete="off"></label>
      <div class="addgrid">
        <label class="f"><span>هاتف الولي (واتساب)</span><input type="tel" id="n_phone" class="ltr" dir="ltr" placeholder="0555 12 34 56"></label>
        <label class="f"><span>هدف الشهر (نقاط)</span><input type="number" id="n_goal" value="20" min="1" max="500" inputmode="numeric"></label>
      </div>
      <div class="row2"><button class="btn" data-act="add">${icon('plus')} إضافة</button><button class="btn ghost" data-act="e_cancel">إلغاء</button></div>`,
      () => { const i = document.getElementById('n_name'); if (i) i.focus(); });
  }

  async function reloadAll() {
    await loadStudents();
    const keep = S.rows; await loadDay(S.day);
    // نحافظ على ما لم يُحفظ بعد لمن لم يتغيّر
    S.students.forEach(st => { const k = keep[st.id]; if (k && isDirty(k)) S.rows[st.id] = k; });
  }

  async function addStudent() {
    const name = document.getElementById('n_name').value.trim();
    const phone = document.getElementById('n_phone').value.trim();
    const goal = parseInt(document.getElementById('n_goal').value, 10) || 20;
    if (!name) return toast('اكتب اسم التلميذ', 'err');
    if (goal < 1 || goal > 500) return toast('هدف الشهر بين 1 و 500', 'err');
    const { error } = await sb.from('rifq_students').insert({ name, phone, monthly_goal: goal });
    if (error) return fail(error);
    closeSheet(true);
    try { await reloadAll(); renderView(); toast('تمت إضافة ' + name + ' ✓', 'ok'); } catch (e) { await fail(e); }
  }

  function openEdit(id) {
    const st = stu(id); if (!st) return;
    openSheet(`<h3>تعديل بيانات التلميذ</h3>
      <label class="f"><span>الاسم</span><input type="text" id="e_name" maxlength="80" value="${esc(st.name)}"></label>
      <label class="f"><span>هاتف الولي (واتساب)</span><input type="tel" id="e_phone" class="ltr" dir="ltr" value="${esc(st.phone)}"></label>
      <label class="f"><span>هدف الشهر (نقاط)</span><input type="number" id="e_goal" min="1" max="500" value="${esc(st.monthly_goal)}"></label>
      <p class="small muted">رمز الولي: <span class="code">${esc(fmtCode(st.code))}</span></p>
      <div class="row2"><button class="btn" data-act="e_save">حفظ</button><button class="btn ghost" data-act="e_cancel">إلغاء</button></div>
      <div class="sep"></div>
      <button class="btn quiet block" data-act="e_rotate">${icon('key')} تجديد رمز الولي</button>
      <button class="btn danger block" style="margin-top:8px" data-act="e_delete">${icon('trash')} حذف التلميذ نهائياً</button>`,
      root => { root.dataset.id = id; });
  }
  const sheetId = () => modalEl && modalEl.firstElementChild.dataset.id;

  async function editSave() {
    const id = sheetId(), name = document.getElementById('e_name').value.trim();
    const phone = document.getElementById('e_phone').value.trim();
    const goal = parseInt(document.getElementById('e_goal').value, 10);
    if (!name) return toast('الاسم لا يمكن أن يكون فارغاً', 'err');
    if (!(goal >= 1 && goal <= 500)) return toast('هدف الشهر بين 1 و 500', 'err');
    const { error } = await sb.from('rifq_students').update({ name, phone, monthly_goal: goal }).eq('id', id);
    if (error) return fail(error);
    closeSheet(true);
    try { await reloadAll(); renderView(); toast('تم الحفظ ✓', 'ok'); } catch (e) { await fail(e); }
  }
  async function editRotate() {
    const id = sheetId(), st = stu(id);
    closeSheet(true);
    const ok = await confirmSheet('تجديد رمز الولي', `سيتوقف رابط ${st.name} الحالي ويُنشأ رابط جديد. تذكّر أن ترسله لوليّه.`, 'تجديد الرمز', false);
    if (!ok) return;
    const g = await sb.rpc('rifq_gen_code'); if (g.error) return fail(g.error);
    const { error } = await sb.from('rifq_students').update({ code: g.data }).eq('id', id);
    if (error) return fail(error);
    try { await reloadAll(); renderView(); toast('تم تجديد الرمز ✓', 'ok'); } catch (e) { await fail(e); }
  }
  async function editDelete() {
    const id = sheetId(), st = stu(id);
    closeSheet(true);
    const ok = await confirmSheet('حذف التلميذ', `سيُحذف «${st.name}» وكل سجلاته نهائياً ولا يمكن التراجع. إن كنت تريد الاحتفاظ بنسخة فاضغط أيقونة التنزيل أولاً.`, 'حذف نهائي', true);
    if (!ok) return;
    const { error } = await sb.from('rifq_students').delete().eq('id', id);
    if (error) return fail(error);
    try { await reloadAll(); renderView(); toast('تم الحذف', 'ok'); } catch (e) { await fail(e); }
  }

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); toast('تم نسخ الرابط ✓', 'ok'); }
    catch (_) { window.prompt('انسخ الرابط:', t); }
  }

  // ---------------------------------------------------------------- تصدير Excel (نسخة احتياطية)
  async function exportCsv() {
    try {
      const rows = []; let from = 0;
      for (;;) {
        const { data, error } = await sb.from('rifq_sessions')
          .select('session_date,student_id,recitation,behavior,note,private_note').order('session_date', { ascending: false }).range(from, from + 999);
        if (error) throw error;
        rows.push(...data); if (data.length < 1000) break; from += 1000;
      }
      const name = {}; S.students.forEach(s => { name[s.id] = s.name; });
      const cell = v => { const s = String(v ?? ''); return /[",\n;\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const out = [['التاريخ', 'التلميذ', 'الاستظهار', 'النقاط', 'السلوك', 'ملاحظة للولي', 'ملاحظة خاصة']];
      rows.sort((a, b) => b.session_date.localeCompare(a.session_date) || (name[a.student_id] || '').localeCompare(name[b.student_id] || '', 'ar'))
        .forEach(x => out.push([x.session_date, name[x.student_id] || '(محذوف)', REC[x.recitation] || '',
          x.recitation && S.scale[x.recitation] != null ? S.scale[x.recitation] : '', BEH[x.behavior] || '', x.note, x.private_note]));
      const csv = '\uFEFF' + out.map(r => r.map(cell).join(',')).join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = 'rifq-backup-' + R.todayLocal() + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
      toast('تم تنزيل ' + rows.length + ' سجلاً ✓', 'ok');
    } catch (e) { await fail(e); }
  }

  // ---------------------------------------------------------------- الأحداث (تفويض واحد)
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act, id = b.dataset.id, v = b.dataset.v;
    if (a === 'tab') { S.tab = v; renderView(); }
    else if (a === 'rec' || a === 'beh') {
      const r = S.rows[id], k = a === 'rec' ? 'rec' : 'beh';
      r[k] = r[k] === v ? null : v; updateRow(id);
    }
    else if (a === 'note') {
      const r = S.rows[id]; r.open = !r.open; updateRow(id);
      if (r.open) { const i = document.querySelector(`.srow[data-id="${id}"] [data-f=note]`); if (i) i.focus(); }
    }
    else if (a === 'prev') changeDay(R.addDays(S.day, -1));
    else if (a === 'next') changeDay(R.addDays(S.day, 1));
    else if (a === 'today') changeDay(R.todayLocal());
    else if (a === 'save') saveDay();
    else if (a === 'wa') { const st = stu(id), r = S.rows[id]; openWhatsapp(st.phone, reportText(st, r)); }
    else if (a === 'addsheet') openAdd();
    else if (a === 'add') addStudent();
    else if (a === 'edit') openEdit(id);
    else if (a === 'e_save') editSave();
    else if (a === 'e_cancel') closeSheet(true);
    else if (a === 'e_rotate') editRotate();
    else if (a === 'e_delete') editDelete();
    else if (a === 'copylink') copyText(parentLink(stu(id).code));
    else if (a === 'walink') { const st = stu(id); openWhatsapp(st.phone, `السلام عليكم ورحمة الله، هذا رابط متابعة حفظ ابنكم ${st.name} في رِفْق:\n${parentLink(st.code)}`); }
    else if (a === 'export') exportCsv();
    else if (a === 'logout') {
      if (counts().dirty > 0 && !(await confirmSheet('تغييرات غير محفوظة', 'سيُتجاهل ما لم تحفظه إن خرجت الآن.', 'خروج', true))) return;
      await sb.auth.signOut(); S.tab = 'day'; renderLogin();
    }
  });
  document.addEventListener('input', e => {
    const t = e.target; if (!t.matches || !t.matches('[data-f]')) return;
    const r = S.rows[t.dataset.id]; if (!r) return;
    r[t.dataset.f] = t.value; refreshRowState(t.dataset.id);
  });
  document.addEventListener('change', async e => {
    const t = e.target; if (!t) return;
    if (t.id === 'day') return changeDay(t.value);
    if (t.id === 'lbToggle') {
      const want = t.checked;
      if (want) {
        const ok = await confirmSheet('إظهار لوحة الصدارة', `سيرى كل الأولياء أسماء الأوائل (${S.cfg.leaderboard_top || 5}) ونقاطهم. تأكد أن أسماء التلاميذ في التطبيق أسماء أولى فقط، وأنك أخبرت الأولياء والتلاميذ بالفكرة.`, 'إظهار اللوحة', false);
        if (!ok) { t.checked = false; return; }
      }
      const { error } = await sb.from('rifq_config').upsert({ key: 'leaderboard_enabled', value: want ? 'on' : 'off' }, { onConflict: 'key' });
      if (error) { t.checked = !want; return fail(error); }
      S.cfg.leaderboard_enabled = want ? 'on' : 'off';
      toast(want ? 'أصبحت لوحة الصدارة ظاهرة للأولياء' : 'أُخفيت لوحة الصدارة', 'ok');
    }
  });
  window.addEventListener('beforeunload', e => { if (document.getElementById('rows') && counts().dirty > 0) { e.preventDefault(); e.returnValue = ''; } });

  // ---------------------------------------------------------------- البدء
  (async function boot() {
    try {
      const { data } = await sb.auth.getSession();
      if (!data || !data.session) return renderLogin();
      enter();
    } catch (_) { renderLogin(); }
  })();
})();
