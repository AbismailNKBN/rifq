// رِفْق — دوال مشتركة بين صفحة الولي وصفحة الأستاذ
(function () {
  const C = window.RIFQ || {};

  // تخزين محلي لا ينكسر إن كان معطّلاً
  const mem = {};
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return mem[k] ?? null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { mem[k] = v; } },
    del(k) { try { localStorage.removeItem(k); } catch (_) { delete mem[k]; } },
  };

  // تهريب HTML: كل نص قادم من قاعدة البيانات يمرّ من هنا قبل عرضه
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- الأيقونات (SVG مضمّنة، بدل الإيموجي) ----------
  const P = {
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    minus: '<path d="M6 12h12"/>',
    star: '<path class="fill" d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.7 6.7 19.7l1.1-6L3.4 9.5l6-.8z"/>',
    chevR: '<path d="M9 5l7 7-7 7"/>',
    chevL: '<path d="M15 5l-7 7 7 7"/>',
    note: '<path d="M4 5.5A2.5 2.5 0 016.5 3h11A2.5 2.5 0 0120 5.5v8a2.5 2.5 0 01-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 014 13.5z"/>',
    send: '<path d="M21 3L10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 017.5 4H15"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 008.5 21h7a1.5 1.5 0 001.5-1.5L18 7M9 7V4.5h6V7"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 119.5 4a7 7 0 0010.5 10.5z"/>',
    logout: '<path d="M10 4H6.5A2.5 2.5 0 004 6.5v11A2.5 2.5 0 006.5 20H10M15 8l4 4-4 4M19 12H9"/>',
    download: '<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14"/>',
    refresh: '<path d="M20 5v5h-5M4 19v-5h5M18.5 10A7 7 0 007 7.5M5.5 14A7 7 0 0017 16.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    key: '<circle cx="8" cy="15" r="3.5"/><path d="M10.5 12.5L19 4M16 7l2.5 2.5M13.5 9.5L15 11"/>',
  };
  function icon(name, cls) {
    const p = P[name] || '';
    const fill = p.indexOf('class="fill"') >= 0;
    return `<svg class="i${fill ? ' fill' : ''}${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  }
  // علامة رِفْق: نجمة ثمانية
  function mark() {
    return '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="16" y="16" width="32" height="32" rx="2"/><rect x="16" y="16" width="32" height="32" rx="2" transform="rotate(45 32 32)"/>' +
      '<circle cx="32" cy="32" r="4.5" fill="currentColor" stroke="none"/></svg>';
  }

  // ---------- الوضع الليلي/النهاري ----------
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    const m = document.querySelector('meta[name=theme-color]');
    if (m) m.content = t === 'light' ? '#fbfaf4' : '#07140f';
  }
  function themeButton() {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'iconbtn theme-btn'; b.title = 'تبديل المظهر'; b.setAttribute('aria-label', 'تبديل المظهر');
    b.innerHTML = icon('moon', 'moon') + icon('sun', 'sun');
    b.onclick = () => {
      const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      store.set('rifq_theme', t); setTheme(t);
    };
    return b;
  }
  setTheme(document.documentElement.dataset.theme || 'dark');

  // ---------- إشعار مؤقت ----------
  let tt;
  function toast(msg, kind) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.className = 'show ' + (kind || '');
    clearTimeout(tt); tt = setTimeout(() => (t.className = ''), 3400);
  }

  // ---------- التاريخ (محلي، لا UTC) ----------
  const pad = n => String(n).padStart(2, '0');
  function isoOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayLocal() { return isoOf(new Date()); }
  function addDays(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d); }
  function fmtDate(iso, opts) {
    try { return new Date(iso + 'T12:00:00').toLocaleDateString('ar-DZ-u-nu-latn', opts || { weekday: 'long', day: 'numeric', month: 'long' }); }
    catch (_) { return iso; }
  }

  // ---------- التسميات ----------
  const REC = { excellent: 'استظهر بحفظ ممتاز', recited: 'استظهر', not_recited: 'لم يستظهر', absent: 'غائب' };
  const BEH = { good: 'جيد', fine: 'حسن', average: 'متوسط' };
  const REC_ICON = { excellent: 'star', recited: 'check', not_recited: 'minus', absent: 'minus' };

  // ---------- استدعاء دالة عامة (بدون تسجيل دخول) — للولي ----------
  async function rpc(fn, args) {
    const headers = { 'Content-Type': 'application/json', apikey: C.SUPABASE_KEY };
    // المفتاح القديم (JWT) يُرسل أيضاً في Authorization؛ المفتاح الجديد sb_publishable لا
    if (String(C.SUPABASE_KEY).startsWith('eyJ')) headers.Authorization = 'Bearer ' + C.SUPABASE_KEY;
    let res;
    try {
      res = await fetch(String(C.SUPABASE_URL).replace(/\/$/, '') + '/rest/v1/rpc/' + fn, {
        method: 'POST', headers, body: JSON.stringify(args || {}),
      });
    } catch (_) { throw new Error('تعذّر الاتصال، تحقق من الإنترنت'); }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!res.ok) throw new Error((data && data.message) || 'حدث خطأ، أعد المحاولة');
    return data;
  }

  window.Rifq = { esc, store, icon, mark, setTheme, themeButton, toast, todayLocal, addDays, fmtDate, isoOf, REC, BEH, REC_ICON, rpc };
})();
