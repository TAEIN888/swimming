import { CONFIG } from './config.js';
import { DAYS, HEADERS, decode, encode, validate, dateCandidates, getTimeRanges, isWholeHour } from './waitlist-model.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const newId = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join('');
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
const hourOptions = '<option value="">시간 선택</option>' + Array.from({ length: 24 }, (_, hour) => `<option value="${String(hour).padStart(2, '0')}:00">${hour}시</option>`).join('');
export function initWaitlist(getCalendars) {
  const button = document.createElement('button');
  button.className = 'tab-btn'; button.id = 'tab-waitlist'; button.innerHTML = '<i class="fa-solid fa-user-clock" aria-hidden="true"></i> 수업 대기 관리';
  document.querySelector('.tab-menu').append(button);
  const panel = document.createElement('section');
  panel.id = 'waitlist-panel'; panel.className = 'glass-card waitlist-panel'; panel.hidden = true;
  document.getElementById('calendar-view-card').before(panel);
  panel.innerHTML = `<div class="waitlist-header"><h3><i class="fa-solid fa-user-clock" aria-hidden="true"></i> 수업 대기 관리</h3><button type="button" class="btn btn-primary" id="wl-new"><i class="fa-solid fa-plus" aria-hidden="true"></i> 대기 등록</button></div>
    <div class="waitlist-toolbar"><input class="form-control" id="wl-search" placeholder="이름 또는 연락처 입력 검색…" aria-label="대기 회원 검색"><select class="form-control" id="wl-filter" aria-label="대기 상태"><option>대기</option><option>연결완료</option><option>취소</option><option>전체</option></select><button type="button" class="btn btn-secondary" id="wl-refresh" title="새로고침"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i><span>새로고침</span></button></div>
    <p id="wl-message" role="status" aria-live="polite"></p><div id="wl-loading" class="waitlist-loading" hidden role="status" aria-label="대기 목록 조회 중"><div class="spinner-container"><div class="double-bounce1"></div><div class="double-bounce2"></div></div><div class="waitlist-loading-track"><span></span></div></div>
    <form id="wl-form" hidden><p class="waitlist-help">회원의 희망 조건과 수업이 가능한 시간을 등록해주세요.</p><p id="wl-form-message" role="status" aria-live="polite"></p>
      <fieldset class="waitlist-group"><legend><i class="fa-solid fa-user" aria-hidden="true"></i> 회원정보</legend><div class="waitlist-fields waitlist-member-fields">
        <label>등록 회원<select name="memberId" class="form-control"><option value="">직접 입력</option></select></label>
        <label><span>회원명 <span class="waitlist-required">필수</span></span><input name="name" class="form-control" required maxlength="100" placeholder="회원 이름"></label>
        <label>연락처<input name="phone" class="form-control" maxlength="50" placeholder="010-0000-0000"></label>
      </div></fieldset>
      <fieldset class="waitlist-group"><legend><i class="fa-solid fa-calendar-check" aria-hidden="true"></i> 대기정보</legend><div class="waitlist-fields">
        <label>대기 유형<select name="type" class="form-control"><option>단발</option><option>장기</option></select></label>
        <label>희망 강사<select name="coachId" class="form-control"></select></label>
        <label>상태<select name="status" class="form-control"><option>대기</option><option>연결완료</option><option>취소</option></select></label>
      </div><div class="waitlist-fields waitlist-period-fields">
        <label><span id="wl-from-label">단발 날짜</span><input name="from" type="date" class="form-control" required></label>
        <div id="wl-until-group"><div class="waitlist-end-heading"><label for="wl-until">종료일</label><label class="waitlist-check"><input type="checkbox" id="wl-unlimited" name="unlimited"> 무기한</label></div><input id="wl-until" name="until" type="date" class="form-control"><p class="waitlist-help" id="wl-until-help">대기를 유지할 마지막 날짜를 선택해주세요.</p></div>
      </div><div id="wl-days"><span class="form-label">희망 요일</span><div class="waitlist-day-options">${DAYS.map((d,i) => `<label><input type="checkbox" name="day" value="${i}"><span>${d}</span></label>`).join('')}</div></div></fieldset>
      <fieldset class="waitlist-group"><legend><i class="fa-regular fa-clock" aria-hidden="true"></i> 희망 시간</legend><div class="waitlist-time-mode"><label><input type="radio" name="timeMode" value="start" checked> 시작시간만 입력</label><label><input type="radio" name="timeMode" value="range">가능 시간 범위 입력</label></div><p class="waitlist-help" id="wl-time-help">희망하는 수업 시작시간만 입력하세요. 종료시간은 입력하지 않아도 됩니다.</p><div id="wl-time-ranges"></div><button class="btn btn-secondary" type="button" id="wl-add-time"><i class="fa-solid fa-plus" aria-hidden="true"></i> 시간 추가</button></fieldset>
      <fieldset class="waitlist-group"><legend><i class="fa-regular fa-note-sticky" aria-hidden="true"></i> 메모</legend><label class="waitlist-note-label">특이사항<textarea name="memo" class="form-control" rows="2" maxlength="2000" placeholder="연락 시 참고할 내용이나 수업 관련 요청"></textarea></label></fieldset>
      <div class="waitlist-form-actions"><button class="btn btn-secondary" type="button" id="wl-cancel">닫기</button><button class="btn btn-primary" type="submit"><i class="fa-solid fa-check" aria-hidden="true"></i> 저장</button></div>
    </form>
    <section class="waitlist-match"><h3><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> 빈 수업에 맞는 대기 회원 찾기</h3><form id="wl-match-form" class="waitlist-fields"><label>조회 날짜<input name="date" type="date" class="form-control" required></label><label>시작시간<select name="start" class="form-control" required>${hourOptions}</select></label><button class="btn btn-primary" type="submit"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> 후보 조회</button></form><p class="waitlist-help">선택한 날짜와 정각 시작시간에 맞는 단발·장기 대기를 모든 강사에 걸쳐 조회합니다. 단발은 지정 날짜, 장기는 기간과 요일을 확인합니다. 시간 범위로 등록한 대기는 조회 시작시간이 범위 안에 있으면 표시합니다.</p><div id="wl-candidates" aria-live="polite"></div></section>
    <div class="waitlist-list-heading"><h3><i class="fa-solid fa-list" aria-hidden="true"></i> 대기 목록</h3><span id="wl-count"></span></div><div id="wl-list"></div>`;
  const backdrop = document.createElement('div');
  backdrop.id = 'wl-backdrop'; backdrop.className = 'modal-backdrop'; backdrop.hidden = true;
  backdrop.innerHTML = `<div class="modal waitlist-dialog" role="dialog" aria-modal="true" aria-labelledby="wl-title"><div class="modal-header"><h3 class="modal-title"><i class="fa-solid fa-user-clock" aria-hidden="true"></i> <span id="wl-title">대기 등록</span></h3><button type="button" class="close-btn" id="wl-close" aria-label="대기 등록 닫기">&times;</button></div></div>`;
  backdrop.querySelector('.modal').append(panel.querySelector('#wl-form')); document.body.append(backdrop);
  const $ = id => panel.querySelector(`#${id}`) || backdrop.querySelector(`#${id}`);
  const form = $('wl-form'), matchForm = $('wl-match-form');
  const field = name => form.elements.namedItem(name);
  let records = [], members = [], editing = null, ready = false, busy = false, loading = false, returnFocus = null;
  const message = text => { $('wl-message').textContent = text; $('wl-form-message').textContent = text; };
  function closeEditor() {
    if (busy) return;
    backdrop.classList.remove('active'); backdrop.hidden = true; form.hidden = true;
    returnFocus?.focus();
  }
  function setLoading(value) {
    $('wl-loading').hidden = !value; panel.setAttribute('aria-busy', String(value));
    $('wl-list').hidden = value;
    $('wl-new').disabled = value; $('wl-refresh').disabled = value;
  }
  const api = () => { if (!window.gapi?.client?.sheets || !gapi.client.getToken()?.access_token) throw new Error('Google 로그인을 먼저 완료해주세요.'); return gapi.client.sheets.spreadsheets; };
  async function read() {
    const response = await api().values.get({ spreadsheetId: CONFIG.getSpreadsheetId(), range: "'수업대기'!A2:Q" });
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
    const header = await client.values.get({ spreadsheetId, range: "'수업대기'!A1:Q1" });
    if (!header.result.values?.length) await client.values.update({ spreadsheetId, range: "'수업대기'!A1:Q1", valueInputOption: 'RAW', resource: { values: [HEADERS] } });
    else if (JSON.stringify(header.result.values[0]) === JSON.stringify(HEADERS.slice(0, 16))) {
      // 기존 16열 데이터는 유지하고 새 시간대 열만 추가합니다.
      await client.values.update({ spreadsheetId, range: "'수업대기'!Q1", valueInputOption: 'RAW', resource: { values: [[HEADERS[16]]] } });
    } else if (JSON.stringify(header.result.values[0]) !== JSON.stringify(HEADERS)) throw new Error('수업대기 시트의 열 구성이 다릅니다. 시트 이름과 헤더를 확인해주세요.');
  }
  function coaches() { return getCalendars().filter(c => (c.summary || '').startsWith('**헤엄하다_') && !/reminder/i.test(c.summary)); }
  function fillCoaches(select, any) {
    select.innerHTML = any ? '<option value="">강사 무관</option>' : '<option value="">강사 선택</option>';
    coaches().forEach(c => select.add(new Option(c.summary.replace('**헤엄하다_', ''), c.id)));
  }
  async function load() {
    if (busy || loading) return;
    loading = true; ready = false; message(''); setLoading(true);
    try {
      await ensureSheet(); records = await read();
      if (!matchForm.elements.date.value) matchForm.elements.date.value = today();

      render(); message('대기 목록을 불러왔습니다.');
      try {
        const response = await api().values.get({ spreadsheetId: CONFIG.getSpreadsheetId(), range: "'회원목록'!A2:I" });
        members = (response.result.values || []).filter(r => r[0]).map(r => ({ id: r[0], name: r[1], phone: r[5] || '' }));
      } catch { members = []; message('대기 목록을 불러왔습니다. 회원 목록은 조회할 수 없어 직접 입력으로 등록해주세요.'); }
      ready = true;
    } catch (error) { $('wl-list').textContent = ''; message(error.message || '조회 실패: 스프레드시트 접근 권한을 확인해주세요.'); }
    finally { loading = false; setLoading(false); }
  }
  function summary(r) { return `${r.coachName || '강사 무관'} · ${r.type === '단발' ? r.from : `${r.from} ~ ${r.until || '무기한'} / ${r.days.split(',').map(d => DAYS[d]).join('·')}`} · ${getTimeRangesSafe(r).map(t => t.mode === 'start' ? `${t.start} 시작` : `${t.start} ~ ${t.end}`).join(' / ')}`; }
  function getTimeRangesSafe(record) {
    try { return getTimeRanges(record).filter(r => r && typeof r.start === 'string' && (r.mode === 'start' || typeof r.end === 'string')); } catch { return []; }
  }
  function render() {
    const query = $('wl-search').value.trim(), status = $('wl-filter').value;
    const list = records.filter(r => (status === '전체' || r.status === status) && `${r.name} ${r.phone}`.includes(query));
    $('wl-count').textContent = `${list.length}건`;
    $('wl-list').innerHTML = list.length ? list.map(r => `<article class="waitlist-row"><div><strong>${escape(r.name)}</strong> ${escape(r.phone)} <span class="waitlist-status">${escape(r.status)}${r.until && r.until < today() ? ' · 기간 만료' : ''}</span><p>${escape(summary(r))}</p><p>${escape(r.memo)}</p></div><button type="button" class="btn btn-secondary" data-edit="${escape(r.id)}"><i class="fa-solid fa-pen" aria-hidden="true"></i> 수정</button></article>`).join('') : '<p>해당하는 대기 회원이 없습니다.</p>';
  }
  let finiteUntil = '';
  function syncType() {
    const single = field('type').value === '단발';
    $('wl-from-label').textContent = single ? '단발 날짜' : '시작일';
    $('wl-days').hidden = single; $('wl-until-group').hidden = single;
    field('unlimited').disabled = single;
    field('until').disabled = single || field('unlimited').checked;
    field('until').required = !single && !field('unlimited').checked;
    field('until').min = field('from').value;
    $('wl-until-help').textContent = field('unlimited').checked ? '종료일 없이 대기를 유지합니다.' : '대기를 유지할 마지막 날짜를 선택해주세요.';
  }
  function syncTimeMode() {
    const startOnly = field('timeMode').value === 'start';
    $('wl-time-help').textContent = startOnly ? '선택한 정각과 정확히 같은 시각에 시작하는 수업을 추천합니다. 종료시간은 지정하지 않습니다.' : '수업 전체가 가능한 시간 범위를 입력해주세요. 선택한 날짜 또는 요일에 적용됩니다.';
    $('wl-time-ranges').classList.toggle('start-only', startOnly);
    $('wl-time-ranges').querySelectorAll('.waitlist-range-end, .waitlist-time-separator').forEach(el => { el.hidden = startOnly; });
    $('wl-time-ranges').querySelectorAll('[name=rangeEnd]').forEach(el => { el.disabled = startOnly; el.required = !startOnly; });
  }
  function addTimeRange(range = { start: '', end: '' }) {
    const row = document.createElement('div'); row.className = 'waitlist-time-row';
    row.innerHTML = `<span class="waitlist-time-number"></span><label>시작시간<select name="rangeStart" class="form-control" required>${hourOptions}</select></label><span class="waitlist-time-separator" aria-hidden="true">~</span><label class="waitlist-range-end">종료시간<select name="rangeEnd" class="form-control" required>${hourOptions}</select></label><button type="button" class="btn btn-secondary" data-remove-time title="시간대 삭제" aria-label="시간대 삭제"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>`;
    row.querySelector('[name=rangeStart]').value = isWholeHour(range.start) ? range.start : '';
    row.querySelector('[name=rangeEnd]').value = isWholeHour(range.end) ? range.end : '';
    if ((range.start && !isWholeHour(range.start)) || (range.mode !== 'start' && range.end && !isWholeHour(range.end))) {
      row.insertAdjacentHTML('beforeend', `<p class="waitlist-time-note">기존 시간: ${escape(range.start)}${range.end ? ` ~ ${escape(range.end)}` : ''}. 저장하려면 정각을 다시 선택해주세요.</p>`);
    }
    $('wl-time-ranges').append(row); numberTimeRanges(); syncTimeMode(); return row;
  }
  function numberTimeRanges() {
    const rows = [...$('wl-time-ranges').children];
    rows.forEach((row, index) => {
      row.querySelector('.waitlist-time-number').textContent = `시간대 ${index + 1}`;
      const remove = row.querySelector('[data-remove-time]'); remove.disabled = rows.length === 1;
      remove.setAttribute('aria-label', `시간대 ${index + 1} 삭제`);
    });
  }
  $('wl-add-time').onclick = () => addTimeRange().querySelector('select').focus();
  $('wl-time-ranges').onclick = event => {
    const remove = event.target.closest('[data-remove-time]');
    if (remove && !remove.disabled) { remove.closest('.waitlist-time-row').remove(); numberTimeRanges(); }
  };
  function edit(record = null) {
    if (!ready || busy) { message('대기 목록을 먼저 새로고침해주세요.'); return; }
    editing = record; returnFocus = document.activeElement; form.reset(); message('');
    field('timeMode').value = record && getTimeRangesSafe(record).some(t => t.mode !== 'start') ? 'range' : 'start';
    fillCoaches(field('coachId'), true);
    field('memberId').innerHTML = '<option value="">직접 입력</option>';
    members.forEach(m => field('memberId').add(new Option(`${m.name} ${m.phone}`, m.id)));
    field('from').value = today(); field('until').value = today();
    $('wl-time-ranges').replaceChildren();
    (record ? getTimeRangesSafe(record) : [{ start: '09:00', end: '' }]).forEach(addTimeRange);
    if (!$('wl-time-ranges').children.length) addTimeRange();
    if (record) {
      for (const key of ['memberId','name','phone','type','coachId','from','until','status','memo']) {
        if (key === 'memberId' && record[key] && ![...field(key).options].some(o => o.value === record[key])) field(key).add(new Option(`${record.name} (기존 회원)`, record[key]));
        if (key === 'coachId' && record[key] && ![...field(key).options].some(o => o.value === record[key])) field(key).add(new Option(`${record.coachName} (현재 목록에 없음)`, record[key]));
        field(key).value = record[key];
      }
      form.querySelectorAll('[name=day]').forEach(el => { el.checked = record.days.split(',').includes(el.value); });
    }
    field('unlimited').checked = record?.type === '장기' && !record.until;
    finiteUntil = record?.until || today();
    $('wl-title').textContent = record ? '대기 수정' : '대기 등록'; form.hidden = false; backdrop.hidden = false; backdrop.classList.add('active'); syncType(); syncTimeMode(); form.scrollTop = 0; field('name').focus();
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !ready) return;
    const data = new FormData(form), now = new Date().toISOString();
    const record = { id: editing?.id || newId(), created: editing?.created || now, updated: now };
    for (const key of ['memberId','name','phone','type','coachId','from','until','status','memo']) record[key] = String(data.get(key) || '').trim();
    record.until = record.type === '단발' ? record.from : field('unlimited').checked ? '' : record.until;
    const mode = field('timeMode').value;
    const ranges = [...$('wl-time-ranges').children].map(row => ({ mode, start: row.querySelector('[name=rangeStart]').value, end: mode === 'start' ? '' : row.querySelector('[name=rangeEnd]').value }));
    record.timeRanges = JSON.stringify(ranges);
    record.start = ranges[0]?.start || ''; record.end = ranges[0]?.end || '';
    record.days = data.getAll('day').join(','); record.coachName = record.coachId ? field('coachId').selectedOptions[0].textContent : '';
    try { validate(record); } catch (error) { message(error.message); return; }
    busy = true; form.querySelector('[type=submit]').disabled = true;
    try {
      const latest = await read();
      if (editing && latest.find(r => r.id === editing.id)?.updated !== editing.updated) throw new Error('다른 사용자가 수정했습니다. 새로고침 후 다시 수정해주세요.');
      await api().values.append({ spreadsheetId: CONFIG.getSpreadsheetId(), range: "'수업대기'!A:Q", valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', resource: { values: [encode(record)] } });
      records = latest.filter(r => r.id !== record.id).concat(record); backdrop.classList.remove('active'); backdrop.hidden = true; form.hidden = true; returnFocus?.focus(); render(); $('wl-candidates').textContent = ''; message('저장되었습니다.');
    } catch (error) { message(error.message || '저장에 실패했습니다. 권한과 연결 상태를 확인하고 새로고침해주세요.'); }
    finally { busy = false; form.querySelector('[type=submit]').disabled = false; }
  });
  form.querySelectorAll('[name=timeMode]').forEach(el => el.addEventListener('change', syncTimeMode));
  field('type').addEventListener('change', syncType); field('from').addEventListener('change', syncType);
  field('unlimited').addEventListener('change', () => {
    if (field('unlimited').checked) { finiteUntil = field('until').value; field('until').value = ''; }
    else field('until').value = finiteUntil >= field('from').value ? finiteUntil : field('from').value;
    syncType();
  });
  field('memberId').addEventListener('change', () => { const m = members.find(m => m.id === field('memberId').value); if (m) { field('name').value = m.name; field('phone').value = m.phone; } });
  $('wl-new').onclick = () => edit(); $('wl-cancel').onclick = closeEditor; $('wl-close').onclick = closeEditor;
  backdrop.addEventListener('click', event => { if (event.target === backdrop) closeEditor(); });
  backdrop.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeEditor(); }
    if (event.key === 'Tab') {
      const elements = [...backdrop.querySelectorAll('button, input, select, textarea')].filter(el => !el.disabled && el.getClientRects().length);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }); $('wl-refresh').onclick = load;
  $('wl-search').oninput = render; $('wl-filter').onchange = render;
  $('wl-list').onclick = event => { const target = event.target.closest('[data-edit]'); if (target) edit(records.find(r => r.id === target.dataset.edit)); };
  matchForm.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !ready) return;
    const slot = Object.fromEntries(new FormData(matchForm));
    busy = true; matchForm.querySelector('button').disabled = true;
    try {
      records = await read(); render(); const found = dateCandidates(records, slot);
      $('wl-candidates').innerHTML = found.length ? found.map((r,i) => `<article class="waitlist-row"><div><strong>${i + 1}. ${escape(r.name)}</strong> ${escape(r.phone)}<p>${escape(summary(r))}</p><p>${escape(r.type)} 대기 · 조회 날짜: ${escape(slot.date)}</p><p>${escape(r.memo)}</p></div></article>`).join('') : '<p>조건에 맞는 대기 회원이 없습니다.</p>';
      message(`${found.length}명의 후보를 찾았습니다. 등록 순서 기준이며 자동 예약되지 않습니다.`);
    } catch (error) { $('wl-candidates').textContent = ''; message(error.message || '후보 조회에 실패했습니다.'); }
    finally { busy = false; matchForm.querySelector('button').disabled = false; }
  });
  function show() {
    if (busy) return;
    document.querySelectorAll('.tab-menu .tab-btn').forEach(el => el.classList.remove('active')); button.classList.add('active');
    ['calendar-view-card','coaches-view-card','retention-view-card','member-search-view-card','members-view-card'].forEach(id => { document.getElementById(id).style.display = 'none'; });
    document.body.classList.remove('lessons-calendar-mode'); panel.hidden = false; closeEditor(); $('wl-candidates').textContent = ''; return load();
  }
  button.onclick = show;
  document.querySelector('.tab-menu').addEventListener('click', event => { const tab = event.target.closest('.tab-btn'); if (tab && tab !== button && tab.id !== 'btn-sidebar-desktop-toggle') { panel.hidden = true; button.classList.remove('active'); } });
  const recommend = document.createElement('button'); recommend.type = 'button'; recommend.className = 'btn btn-secondary'; recommend.innerHTML = '<i class="fa-solid fa-user-clock" aria-hidden="true"></i> 이 날짜·시간의 대기 회원 찾기';
  document.getElementById('event-form').append(recommend);
  recommend.onclick = async () => {
    const slot = { date: document.getElementById('event-start-date').value, start: document.getElementById('event-start-time').value };
    if (!slot.date || !slot.start) { alert('수업 시작 날짜와 시간을 먼저 입력해주세요.'); return; }
    document.getElementById('event-backdrop').classList.remove('active'); await show();
    for (const [key,value] of Object.entries(slot)) matchForm.elements.namedItem(key).value = value;
    if (ready && isWholeHour(slot.start)) matchForm.requestSubmit();
    else if (ready) message('이 수업은 분 단위로 시작합니다. 조회할 정각을 선택해주세요.');
  };
}
