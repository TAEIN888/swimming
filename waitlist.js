import { CONFIG } from './config.js';
import { DAYS, HEADERS, decode, encode, validate, candidates } from './waitlist-model.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const newId = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join('');
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
export function initWaitlist(getCalendars) {
  const button = document.createElement('button');
  button.className = 'tab-btn'; button.id = 'tab-waitlist'; button.textContent = '수업 대기 관리';
  document.querySelector('.tab-menu').append(button);
  const panel = document.createElement('section');
  panel.id = 'waitlist-panel'; panel.className = 'glass-card waitlist-panel'; panel.hidden = true;
  document.getElementById('calendar-view-card').before(panel);
  panel.innerHTML = `<h2>수업 대기 관리</h2><p>희망 조건은 회원 DB의 ‘수업대기’ 시트에 저장됩니다. 시간대는 수업 전체가 가능한 범위로 지정해주세요. 모든 날짜·시간은 한국 시간 기준입니다.</p>
    <div class="waitlist-toolbar"><button type="button" class="btn btn-primary" id="wl-new">대기 등록</button><button type="button" class="btn btn-secondary" id="wl-refresh">새로고침</button><input class="form-control" id="wl-search" placeholder="회원명 또는 연락처 검색" aria-label="대기 회원 검색"><select class="form-control" id="wl-filter" aria-label="대기 상태"><option>대기</option><option>연결완료</option><option>취소</option><option>전체</option></select></div>
    <p id="wl-message" role="status" aria-live="polite"></p>
    <form id="wl-form" hidden><h3 id="wl-title">대기 등록</h3><div class="waitlist-fields">
      <label>등록 회원<select name="memberId" class="form-control"><option value="">직접 입력</option></select></label>
      <label>회원명<input name="name" class="form-control" required maxlength="100"></label><label>연락처<input name="phone" class="form-control" maxlength="50"></label>
      <label>대기 유형<select name="type" class="form-control"><option>단발</option><option>장기</option></select></label>
      <label>희망 강사<select name="coachId" class="form-control"></select></label>
      <label>시작일 / 단발 날짜<input name="from" type="date" class="form-control" required></label><label>종료일 (장기는 비워두면 무기한)<input name="until" type="date" class="form-control"></label>
      <label>가능 시작시간<input name="start" type="time" class="form-control" required></label><label>가능 종료시간<input name="end" type="time" class="form-control" required></label>
      <label>상태<select name="status" class="form-control"><option>대기</option><option>연결완료</option><option>취소</option></select></label>
    </div><fieldset id="wl-days"><legend>희망 요일 (장기 대기)</legend>${DAYS.map((d,i) => `<label><input type="checkbox" name="day" value="${i}"> ${d}</label>`).join(' ')}</fieldset>
    <label>메모<textarea name="memo" class="form-control" rows="2" maxlength="2000"></textarea></label><div class="waitlist-toolbar"><button class="btn btn-primary" type="submit">저장</button><button class="btn btn-secondary" type="button" id="wl-cancel">닫기</button></div></form>
    <section class="waitlist-match"><h3>빈 수업에 맞는 대기 회원 찾기</h3><form id="wl-match-form" class="waitlist-fields"><label>강사<select name="coachId" class="form-control" required></select></label><label>수업 날짜<input name="date" type="date" class="form-control" required></label><label>시작시간<input name="start" type="time" class="form-control" required></label><label>종료시간<input name="end" type="time" class="form-control" required></label><button class="btn btn-primary" type="submit">후보 조회</button></form><p>강사·요일·기간·수업 전체 시간대가 맞는 회원을 등록 순서로 표시합니다. 실제 참석 가능 여부와 기존 수업 중복은 연락 전 확인해주세요.</p><div id="wl-candidates" aria-live="polite"></div></section>
    <h3>대기 목록</h3><div id="wl-list"></div>`;
  const $ = id => panel.querySelector(`#${id}`);
  const form = $('wl-form'), matchForm = $('wl-match-form');
  const field = name => form.elements.namedItem(name);
  let records = [], members = [], editing = null, ready = false, busy = false;
  const message = text => { $('wl-message').textContent = text; };
  const api = () => { if (!window.gapi?.client?.sheets || !gapi.client.getToken()?.access_token) throw new Error('Google 로그인을 먼저 완료해주세요.'); return gapi.client.sheets.spreadsheets; };
  async function read() {
    const response = await api().values.get({ spreadsheetId: CONFIG.getSpreadsheetId(), range: "'수업대기'!A2:P" });
    return decode(response.result.values || []);
  }
  async function ensureSheet() {
    const client = api(), spreadsheetId = CONFIG.getSpreadsheetId();
    const response = await client.get({ spreadsheetId, fields: 'sheets.properties.title' });
    if (!response.result.sheets.some(s => s.properties.title === '수업대기')) {
      try { await client.batchUpdate({ spreadsheetId, resource: { requests: [{ addSheet: { properties: { title: '수업대기' } } }] } }); }
      catch (error) {
        const retry = await client.get({ spreadsheetId, fields: 'sheets.properties.title' });
        if (!retry.result.sheets.some(s => s.properties.title === '수업대기')) throw error;
      }
    }
    const header = await client.values.get({ spreadsheetId, range: "'수업대기'!A1:P1" });
    if (!header.result.values?.length) await client.values.update({ spreadsheetId, range: "'수업대기'!A1:P1", valueInputOption: 'RAW', resource: { values: [HEADERS] } });
    else if (JSON.stringify(header.result.values[0]) !== JSON.stringify(HEADERS)) throw new Error('수업대기 시트의 열 구성이 다릅니다. 시트 이름과 헤더를 확인해주세요.');
  }
  function coaches() { return getCalendars().filter(c => (c.summary || '').startsWith('**헤엄하다_') && !/reminder/i.test(c.summary)); }
  function fillCoaches(select, any) {
    select.innerHTML = any ? '<option value="">강사 무관</option>' : '<option value="">강사 선택</option>';
    coaches().forEach(c => select.add(new Option(c.summary.replace('**헤엄하다_', ''), c.id)));
  }
  async function load() {
    if (busy) return;
    ready = false; message('대기 목록을 불러오는 중입니다…');
    try {
      await ensureSheet(); records = await read(); ready = true;
      fillCoaches(matchForm.elements.coachId, false);
      if (!matchForm.elements.date.value) matchForm.elements.date.value = today();
      render(); message('대기 목록을 불러왔습니다.');
      try {
        const response = await api().values.get({ spreadsheetId: CONFIG.getSpreadsheetId(), range: "'회원목록'!A2:I" });
        members = (response.result.values || []).filter(r => r[0]).map(r => ({ id: r[0], name: r[1], phone: r[5] || '' }));
      } catch { members = []; message('대기 목록을 불러왔습니다. 회원 목록은 조회할 수 없어 직접 입력으로 등록해주세요.'); }
    } catch (error) { $('wl-list').textContent = ''; message(error.message || '조회 실패: 스프레드시트 접근 권한을 확인해주세요.'); }
  }
  function summary(r) { return `${r.coachName || '강사 무관'} · ${r.type === '단발' ? r.from : `${r.from} ~ ${r.until || '무기한'} / ${r.days.split(',').map(d => DAYS[d]).join('·')}`} · ${r.start} ~ ${r.end}`; }
  function render() {
    const query = $('wl-search').value.trim(), status = $('wl-filter').value;
    const list = records.filter(r => (status === '전체' || r.status === status) && `${r.name} ${r.phone}`.includes(query));
    $('wl-list').innerHTML = list.length ? list.map(r => `<article class="waitlist-row"><div><strong>${escape(r.name)}</strong> ${escape(r.phone)} <span>${escape(r.status)}${r.until && r.until < today() ? ' · 기간 만료' : ''}</span><p>${escape(summary(r))}</p><p>${escape(r.memo)}</p></div><button type="button" class="btn btn-secondary" data-edit="${escape(r.id)}">수정</button></article>`).join('') : '<p>해당하는 대기 회원이 없습니다.</p>';
  }
  function syncType() {
    const single = field('type').value === '단발'; $('wl-days').hidden = single; field('until').disabled = single;
    if (single) field('until').value = field('from').value;
  }
  function edit(record = null) {
    if (!ready || busy) { message('대기 목록을 먼저 새로고침해주세요.'); return; }
    editing = record; form.reset(); fillCoaches(field('coachId'), true);
    field('memberId').innerHTML = '<option value="">직접 입력</option>';
    members.forEach(m => field('memberId').add(new Option(`${m.name} ${m.phone}`, m.id)));
    field('from').value = today(); field('start').value = '09:00'; field('end').value = '10:00';
    if (record) {
      for (const key of ['memberId','name','phone','type','coachId','from','until','start','end','status','memo']) {
        if (key === 'memberId' && record[key] && ![...field(key).options].some(o => o.value === record[key])) field(key).add(new Option(`${record.name} (기존 회원)`, record[key]));
        if (key === 'coachId' && record[key] && ![...field(key).options].some(o => o.value === record[key])) field(key).add(new Option(`${record.coachName} (현재 목록에 없음)`, record[key]));
        field(key).value = record[key];
      }
      form.querySelectorAll('[name=day]').forEach(el => { el.checked = record.days.split(',').includes(el.value); });
    }
    $('wl-title').textContent = record ? '대기 수정' : '대기 등록'; form.hidden = false; syncType(); field('name').focus();
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !ready) return;
    const data = new FormData(form), now = new Date().toISOString();
    const record = { id: editing?.id || newId(), created: editing?.created || now, updated: now };
    for (const key of ['memberId','name','phone','type','coachId','from','until','start','end','status','memo']) record[key] = String(data.get(key) || '').trim();
    record.until = record.type === '단발' ? record.from : record.until;
    record.days = data.getAll('day').join(','); record.coachName = record.coachId ? field('coachId').selectedOptions[0].textContent : '';
    try { validate(record); } catch (error) { message(error.message); return; }
    busy = true; form.querySelector('[type=submit]').disabled = true;
    try {
      const latest = await read();
      if (editing && latest.find(r => r.id === editing.id)?.updated !== editing.updated) throw new Error('다른 사용자가 수정했습니다. 새로고침 후 다시 수정해주세요.');
      await api().values.append({ spreadsheetId: CONFIG.getSpreadsheetId(), range: "'수업대기'!A:P", valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', resource: { values: [encode(record)] } });
      records = latest.filter(r => r.id !== record.id).concat(record); form.hidden = true; render(); $('wl-candidates').textContent = ''; message('저장되었습니다.');
    } catch (error) { message(error.message || '저장에 실패했습니다. 권한과 연결 상태를 확인하고 새로고침해주세요.'); }
    finally { busy = false; form.querySelector('[type=submit]').disabled = false; }
  });
  field('type').addEventListener('change', syncType); field('from').addEventListener('change', syncType);
  field('memberId').addEventListener('change', () => { const m = members.find(m => m.id === field('memberId').value); if (m) { field('name').value = m.name; field('phone').value = m.phone; } });
  $('wl-new').onclick = () => edit(); $('wl-cancel').onclick = () => { form.hidden = true; }; $('wl-refresh').onclick = load;
  $('wl-search').oninput = render; $('wl-filter').onchange = render;
  $('wl-list').onclick = event => { const target = event.target.closest('[data-edit]'); if (target) edit(records.find(r => r.id === target.dataset.edit)); };
  matchForm.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !ready) return;
    const slot = Object.fromEntries(new FormData(matchForm));
    if (slot.end <= slot.start) { message('수업 종료시간은 시작시간보다 늦어야 합니다. 당일 수업을 조회해주세요.'); return; }
    busy = true; matchForm.querySelector('button').disabled = true;
    try {
      records = await read(); render(); const found = candidates(records, slot);
      $('wl-candidates').innerHTML = found.length ? found.map((r,i) => `<article class="waitlist-row"><div><strong>${i + 1}. ${escape(r.name)}</strong> ${escape(r.phone)}<p>${escape(summary(r))}</p><p>${escape(r.memo)}</p></div></article>`).join('') : '<p>조건에 맞는 대기 회원이 없습니다.</p>';
      message(`${found.length}명의 후보를 찾았습니다. 등록 순서 기준이며 자동 예약되지 않습니다.`);
    } catch (error) { $('wl-candidates').textContent = ''; message(error.message || '후보 조회에 실패했습니다.'); }
    finally { busy = false; matchForm.querySelector('button').disabled = false; }
  });
  function show() {
    if (busy) return;
    document.querySelectorAll('.tab-menu .tab-btn').forEach(el => el.classList.remove('active')); button.classList.add('active');
    ['calendar-view-card','coaches-view-card','retention-view-card','member-search-view-card','members-view-card'].forEach(id => { document.getElementById(id).style.display = 'none'; });
    document.body.classList.remove('lessons-calendar-mode'); panel.hidden = false; form.hidden = true; $('wl-candidates').textContent = ''; return load();
  }
  button.onclick = show;
  document.querySelector('.tab-menu').addEventListener('click', event => { const tab = event.target.closest('.tab-btn'); if (tab && tab !== button && tab.id !== 'btn-sidebar-desktop-toggle') { panel.hidden = true; button.classList.remove('active'); } });
  const recommend = document.createElement('button'); recommend.type = 'button'; recommend.className = 'btn btn-secondary'; recommend.textContent = '이 시간의 대기 회원 찾기';
  document.getElementById('event-form').append(recommend);
  recommend.onclick = async () => {
    const date = document.getElementById('event-start-date').value, endDate = document.getElementById('event-end-date').value;
    if (date !== endDate) { alert('대기 추천은 당일 수업에 대해 조회할 수 있습니다.'); return; }
    const slot = { coachId: document.getElementById('event-calendar-id').value, date, start: document.getElementById('event-start-time').value, end: document.getElementById('event-end-time').value };
    document.getElementById('event-backdrop').classList.remove('active'); await show();
    for (const [key,value] of Object.entries(slot)) matchForm.elements.namedItem(key).value = value;
    if (ready) matchForm.requestSubmit();
  };
}
