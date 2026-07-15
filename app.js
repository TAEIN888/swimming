import { CONFIG, saveConfig, loadSecrets, secrets } from './config.js';

// 애플리케이션 상태 관리
let tokenClient;
let gapiInited = false;
let gisInited = false;
let accessToken = null;
let calendar = null;
let currentUser = null;

// 다중 캘린더 관리 상태
let allCalendars = [];
let selectedCalendarIds = new Set();
let lastViewType = null;
const googleEventsCache = new Map();
let dashboardEventsCache = null;
let deletedEventsCache = []; // 삭제된 일정 보관용 전역 캐시
let deletedEventsMap = {};   // 날짜별 빠른 조회를 위한 해시맵 캐시

// 캘린더 새로고침 및 캐시 초기화 헬퍼 함수
function refetchCalendarEvents(clearCache = false) {
  if (clearCache) {
    googleEventsCache.clear();
    dashboardEventsCache = null;
  }
  if (calendar) {
    calendar.refetchEvents();
  }
}

// DOM 요소 참조
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const googleLoginBtn = document.getElementById('google-login-btn');
const tempSetupBtn = document.getElementById('temp-setup-btn');
const apiWarningBanner = document.getElementById('api-warning-banner');
const btnSetupNow = document.getElementById('btn-setup-now');
const authErrorBanner = document.getElementById('auth-error-banner');
const authErrorMsg = document.getElementById('auth-error-msg');

// 사이드바 및 프로필 관련
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const userEmail = document.getElementById('user-email');
const btnAddEvent = document.getElementById('btn-add-event');
const btnOpenSettings = document.getElementById('btn-open-settings');
const btnLogout = document.getElementById('btn-logout');
const calendarListContainer = document.getElementById('calendar-list-container');

// 설정 모달 관련
const settingsBackdrop = document.getElementById('settings-backdrop');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const btnCancelSettings = document.getElementById('btn-cancel-settings');
const settingsForm = document.getElementById('settings-form');
const setClientId = document.getElementById('setting-client-id');
const setApiKey = document.getElementById('setting-api-key');
const setCalendarId = document.getElementById('setting-calendar-id');
const setSpreadsheetId = document.getElementById('setting-spreadsheet-id');
const setWhitelist = document.getElementById('setting-whitelist');

// 회원 목록 관리 DOM 관련
const tabMembers = document.getElementById('tab-members');
const membersViewCard = document.getElementById('members-view-card');
const memberBackdrop = document.getElementById('member-backdrop');
const closeMemberBtn = document.getElementById('close-member-btn');
const btnCancelMember = document.getElementById('btn-cancel-member');
const memberForm = document.getElementById('member-form');
const memberModalTitle = document.getElementById('member-modal-title');
const inpMemberId = document.getElementById('member-id');
const inpMemberName = document.getElementById('member-name');
const inpMemberPhone = document.getElementById('member-phone');
const inpMemberJoined = document.getElementById('member-joined');
const inpMemberGender = document.getElementById('member-gender');
const inpMemberAge = document.getElementById('member-age');
const inpMemberIsAdult = document.getElementById('member-is-adult');
const inpMemberStatus = document.getElementById('member-status');
const inpMemberMemo = document.getElementById('member-memo');
const btnAddMember = document.getElementById('btn-add-member');
const memberFilterInput = document.getElementById('member-filter-input');
const btnMemberFilter = document.getElementById('btn-member-filter');
const btnMemberRefresh = document.getElementById('btn-member-refresh');
const membersLoading = document.getElementById('members-loading');
const membersListContainer = document.getElementById('members-list-container');
const membersCountSummary = document.getElementById('members-count-summary');
const membersTbody = document.getElementById('members-tbody');

// 모바일 반응형 사이드바 토글 관련
const btnSidebarToggle = document.getElementById('btn-sidebar-toggle');
const btnSidebarClose = document.getElementById('btn-sidebar-close');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const appSidebar = document.getElementById('app-sidebar');

// 알림 메시지 생성기 DOM 관련
const btnOpenNotifier = document.getElementById('btn-open-notifier');
const notifierBackdrop = document.getElementById('notifier-backdrop');
const closeNotifierBtn = document.getElementById('close-notifier-btn');
const btnCloseNotifier = document.getElementById('btn-close-notifier');
const notifierTargetDate = document.getElementById('notifier-target-date');
const notifierTemplateSelect = document.getElementById('notifier-template-select');
const notifierTemplateText = document.getElementById('notifier-template-text');
const btnNotifierRefresh = document.getElementById('btn-notifier-refresh');
const notifierLoading = document.getElementById('notifier-loading');
const notifierEmptyMsg = document.getElementById('notifier-empty-msg');
const notifierResultsContainer = document.getElementById('notifier-results-container');
const notifierListCount = document.getElementById('notifier-list-count');


// 일정 모달 관련
const eventBackdrop = document.getElementById('event-backdrop');
const closeEventBtn = document.getElementById('close-event-btn');
const btnCancelEvent = document.getElementById('btn-cancel-event');
const btnDeleteEvent = document.getElementById('btn-delete-event');
const eventForm = document.getElementById('event-form');
const eventModalTitle = document.getElementById('event-modal-title');

// 일정 입력 폼 필드
const inpEventId = document.getElementById('event-id');
const inpEventCalendarId = document.getElementById('event-calendar-id');
const inpEventTitle = document.getElementById('event-title');
const inpEventMemberName = document.getElementById('event-member-name');
const inpEventStartDate = document.getElementById('event-start-date');
const inpEventStartTime = document.getElementById('event-start-time');
const inpEventEndDate = document.getElementById('event-end-date');
const inpEventEndTime = document.getElementById('event-end-time');
const inpEventColor = document.getElementById('event-color');

// 초기 실행 및 스크립트 로드 대기
window.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  await loadSecrets();
  setupEventListeners();
  loadSavedSettingsToForm();
  checkApiSetup();
  
  // Google SDK 로드 대기 후 초기화 실행
  const checkGoogleSDKs = setInterval(() => {
    if (typeof gapi !== 'undefined' && typeof google !== 'undefined') {
      clearInterval(checkGoogleSDKs);
      initializeGapiClient();
      initializeGisClient();
      
      // 저장된 세션 복원 시도
      attemptSessionRestore();
    }
  }, 100);
}

// 저장된 구글 로그인 세션 자동 복원
let sessionRefreshInterval = null;

// 세션 주기 갱신 타이머 가동 (background silent refresh)
function startSessionRefreshTimer() {
  if (sessionRefreshInterval) {
    clearInterval(sessionRefreshInterval);
  }
  
  sessionRefreshInterval = setInterval(() => {
    const acquiredAt = localStorage.getItem('G_TOKEN_ACQUIRED_AT');
    if (accessToken && acquiredAt) {
      const elapsed = Date.now() - parseInt(acquiredAt, 10);
      // 토큰 획득 후 50분 경과 시 백그라운드 무인 갱신(prompt: none) 진행
      if (elapsed > 50 * 60 * 1000) {
        console.log('세션 유효 시간이 10분 이하로 남아 백그라운드 무인 갱신을 진행합니다. (prompt: none)');
        if (tokenClient) {
          try {
            tokenClient.requestAccessToken({ prompt: 'none' });
          } catch (err) {
            console.error('백그라운드 세션 갱신 요청 에러:', err);
          }
        }
      }
    }
  }, 60 * 1000); // 1분마다 유효 여부 점검
  console.log('세션 자동 갱신 모니터링 타이머 가동 완료');
}

// 저장된 구글 로그인 세션 자동 복원
async function attemptSessionRestore() {
  const savedToken = localStorage.getItem('G_ACCESS_TOKEN');
  const savedUser = localStorage.getItem('G_USER_INFO');
  const savedTokenResponse = localStorage.getItem('G_TOKEN_RESPONSE');
  const acquiredAt = localStorage.getItem('G_TOKEN_ACQUIRED_AT');
  
  if (savedToken && savedUser && savedTokenResponse) {
    console.log('기존 로그인 세션 복원 시도 중...');
    const checkGapi = setInterval(async () => {
      if (gapiInited) {
        clearInterval(checkGapi);
        
        const elapsed = acquiredAt ? (Date.now() - parseInt(acquiredAt, 10)) : Infinity;
        
        // 토큰 발급 후 50분이 지나지 않았다면 기존 토큰 그대로 즉시 활용
        if (elapsed < 50 * 60 * 1000) {
          try {
            console.log('GAPI 초기화 완료 확인. 세션 복원 적용 시작.');
            accessToken = savedToken;
            currentUser = JSON.parse(savedUser);
            
            // GAPI의 공식 사양에 맞게 { access_token: accessToken } 객체 형태로 토큰 직접 전달
            gapi.client.setToken({ access_token: savedToken });
            console.log('GAPI setToken 적용 완료 (access_token 매핑)');
            
            console.log('캘린더 목록 로드 시도...');
            await fetchCalendarList();
            
            console.log('캘린더 커스텀 색상 로드 시도...');
            await loadCalendarColorsFromSheet();
            
            console.log('삭제된 일정 목록 로드 시도...');
            await fetchDeletedEvents();
            
            console.log('달력 인스턴스 초기화 시도...');
            initCalendar();
            
            hideAuthError();
            updateProfileUI();
            showDashboard();
            
            startSessionRefreshTimer(); // 백그라운드 갱신 타이머 가동
            console.log('로그인 세션 복원 완료!');
          } catch (err) {
            console.error('세션 복원 프로세스 중 심각한 예외 발생:', err);
            clearSession();
            showLoginScreen();
          }
        } else {
          // 토큰이 이미 만료되었거나 임박했다면 백그라운드 무인 로그인(prompt: none) 시도
          console.log('보관된 세션이 만료됨. 백그라운드 무인 갱신(prompt: none)을 시도합니다.');
          if (tokenClient) {
            try {
              tokenClient.requestAccessToken({ prompt: 'none' });
            } catch (err) {
              console.error('백그라운드 무인 갱신 요청 에러:', err);
              clearSession();
              showLoginScreen();
            }
          } else {
            console.warn('tokenClient가 아직 준비되지 않아 복원을 스킵합니다.');
            clearSession();
            showLoginScreen();
          }
        }
      }
    }, 100);
  } else {
    console.log('복원할 기존 세션 정보가 로컬 스토리지에 없습니다.');
  }
}

// 세션 스토리지 데이터 삭제
function clearSession() {
  localStorage.removeItem('G_ACCESS_TOKEN');
  localStorage.removeItem('G_USER_INFO');
  localStorage.removeItem('G_TOKEN_RESPONSE');
  localStorage.removeItem('G_TOKEN_ACQUIRED_AT');
  accessToken = null;
  currentUser = null;
  if (sessionRefreshInterval) {
    clearInterval(sessionRefreshInterval);
    sessionRefreshInterval = null;
  }
}

// 1. API 설정 여부 확인
function checkApiSetup() {
  const clientId = CONFIG.getClientId();
  const apiKey = CONFIG.getApiKey();
  
  if (!clientId || !apiKey) {
    apiWarningBanner.style.display = 'flex';
    googleLoginBtn.disabled = true;
    googleLoginBtn.innerHTML = `<i class="fa-solid fa-lock"></i> API 설정을 완료해 주세요`;
  } else {
    apiWarningBanner.style.display = 'none';
    googleLoginBtn.disabled = false;
    googleLoginBtn.innerHTML = `<i class="fa-brands fa-google"></i> 구글 계정으로 로그인`;
  }
}

// 2. GAPI 클라이언트 초기화 (캘린더 API 로드)
function initializeGapiClient() {
  gapi.load('client', async () => {
    try {
      const apiKey = CONFIG.getApiKey();
      if (apiKey) {
        await gapi.client.init({
          apiKey: apiKey,
          discoveryDocs: CONFIG.DISCOVERY_DOCS,
        });
        try {
          await gapi.client.load('calendar', 'v3');
        } catch (loadErr) {
          console.warn('gapi.client.load calendar v3 failed, relying on discoveryDocs:', loadErr);
        }
        try {
          await gapi.client.load('sheets', 'v4');
        } catch (loadErr) {
          console.warn('gapi.client.load sheets v4 failed, relying on discoveryDocs:', loadErr);
        }
        gapiInited = true;
        console.log('GAPI Client Initialized');
      }
    } catch (err) {
      console.error('Error initializing GAPI client:', err);
    }
  });
}

// 3. GIS (Google Identity Services) 초기화
function initializeGisClient() {
  try {
    const clientId = CONFIG.getClientId();
    if (clientId) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: CONFIG.SCOPES,
        callback: handleAuthCallback,
      });
      gisInited = true;
      console.log('GIS Client Initialized');
    }
  } catch (err) {
    console.error('Error initializing GIS client:', err);
  }
}

// 4. 인증 콜백 핸들러
async function handleAuthCallback(tokenResponse) {
  if (tokenResponse.error !== undefined) {
    console.warn('Google Auth Callback Error:', tokenResponse.error);
    clearSession();
    showLoginScreen();
    // 백그라운드 무인 갱신 실패(prompt: none)인 경우 조용히 로그인 화면으로 복귀 처리
    if (tokenResponse.error !== 'immediate_failed' && tokenResponse.error !== 'interaction_required') {
      showAuthError(`로그인 오류: ${tokenResponse.error}`);
    }
    return;
  }
  
  accessToken = tokenResponse.access_token;
  gapi.client.setToken(tokenResponse);
  
  // 로그인 유저 정보 요청
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!response.ok) throw new Error('사용자 정보를 가져올 수 없습니다.');
    
    currentUser = await response.json();
    
    // 이메일 권한 필터링 (화이트리스트 검사)
    const whitelist = CONFIG.getWhitelist();
    const userEmailAddr = currentUser.email.toLowerCase();
    
    if (whitelist.length > 0 && !whitelist.includes(userEmailAddr)) {
      showAuthError(`허가되지 않은 계정(${userEmailAddr})입니다. 관리자에게 문의하세요.`);
      // 토큰 파기
      google.accounts.oauth2.revokeToken(accessToken, () => {});
      accessToken = null;
      return;
    }
    
    // 정상 로그인 성공 처리
    hideAuthError();
    updateProfileUI();
    showDashboard();
    
    // 세션 유지용 스토리지 저장 (새로고침 및 탭 닫기에도 보존되도록 localStorage 적용)
    localStorage.setItem('G_ACCESS_TOKEN', accessToken);
    localStorage.setItem('G_USER_INFO', JSON.stringify(currentUser));
    localStorage.setItem('G_TOKEN_RESPONSE', JSON.stringify(tokenResponse));
    localStorage.setItem('G_TOKEN_ACQUIRED_AT', Date.now().toString());
    
    startSessionRefreshTimer(); // 백그라운드 갱신 모니터링 시작
    
    // 다중 캘린더 목록 조회 및 필터 구성
    await fetchCalendarList();
    
    // 캘린더 커스텀 색상 로드
    await loadCalendarColorsFromSheet();
    
    // 삭제된 일정 목록 로드
    await fetchDeletedEvents();
    
    initCalendar();
    
  } catch (err) {
    showAuthError(err.message);
  }
}

// 5. 다중 캘린더 목록 가져오기 및 UI 렌더링
async function fetchCalendarList() {
  calendarListContainer.innerHTML = '<div style="font-size: 0.75rem; color: var(--text-muted); padding: 4px 8px;">목록을 불러오는 중...</div>';
  inpEventCalendarId.innerHTML = '';
  selectedCalendarIds.clear();
  
  try {
    // GAPI 라이브러리 탑재 여부 검증
    if (typeof gapi === 'undefined' || !gapi.client) {
      throw new Error('Google API 클라이언트 라이브러리가 로드되지 않았습니다. 페이지를 새로고침해 주세요.');
    }
    
    // GAPI 클라이언트 초기화 대기 및 캘린더 로딩 재시도
    if (!gapiInited) {
      console.log('GAPI가 아직 초기화되지 않아 캘린더 API 로딩을 시도합니다.');
      try {
        const apiKey = CONFIG.getApiKey();
        await gapi.client.init({
          apiKey: apiKey,
          discoveryDocs: CONFIG.DISCOVERY_DOCS,
        });
        await gapi.client.load('calendar', 'v3');
        gapiInited = true;
      } catch (initErr) {
        throw new Error(`Google API 초기화 실패: ${initErr.message || JSON.stringify(initErr)}`);
      }
    }

    if (!gapi.client.calendar) {
      console.log('gapi.client.calendar가 누락되어 명시적으로 다시 로드합니다.');
      await gapi.client.load('calendar', 'v3');
    }
    
    const response = await gapi.client.calendar.calendarList.list();
    allCalendars = response.result.items || [];
    

    calendarListContainer.innerHTML = '';
    
    // 두 그룹을 보관할 엘리먼트 생성
    const myGroupTitle = document.createElement('div');
    myGroupTitle.className = 'calendar-group-title is-my';
    myGroupTitle.style.cssText = 'font-size: 0.78rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; padding: 0 4px;';
    myGroupTitle.textContent = '내 캘린더';
    
    const myGroupList = document.createElement('div');
    myGroupList.className = 'calendar-group-list is-my';
    myGroupList.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    
    const otherGroupTitle = document.createElement('div');
    otherGroupTitle.className = 'calendar-group-title is-other';
    otherGroupTitle.style.cssText = 'font-size: 0.78rem; font-weight: 700; color: var(--text-muted); margin-top: 14px; margin-bottom: 6px; padding: 0 4px;';
    otherGroupTitle.textContent = '다른 캘린더';
    
    const otherGroupList = document.createElement('div');
    otherGroupList.className = 'calendar-group-list is-other';
    otherGroupList.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    
    // 캘린더 정렬 (기본 기본형 캘린더 우선)
    allCalendars.sort((a, b) => {
      if (a.primary) return -1;
      if (b.primary) return 1;
      const nameA = a.summary || '';
      const nameB = b.summary || '';
      return nameA.localeCompare(nameB);
    });
    
    allCalendars.forEach(cal => {
      // 쓰기 권한 여부로 '내 캘린더'와 '다른 캘린더' 구분
      const isMyCal = cal.accessRole === 'owner' || cal.accessRole === 'writer';
      
      const isInstructorCal = cal.summary && cal.summary.startsWith('**헤엄하다_');
      const item = document.createElement('label');
      item.className = `calendar-checkbox-item ${isInstructorCal ? 'is-instructor' : 'is-other'}`;
      
      const color = resolveCalendarColor(cal);
      
      // 내 캘린더는 기본 선택(checked), 다른 캘린더는 선택 해제(unchecked)
      const isChecked = isMyCal;
      if (isChecked) {
        selectedCalendarIds.add(cal.id);
      }
      
      item.innerHTML = `
        <input type="checkbox" id="cal-check-${cal.id}" data-id="${cal.id}" data-is-my-cal="${isMyCal}" ${isChecked ? 'checked' : ''} style="cursor: pointer;">
        <div class="calendar-color-picker-wrapper" style="position: relative; display: inline-block; cursor: pointer; width: 12px; height: 12px; border-radius: 50%; margin: 0 8px; flex-shrink: 0; background-color: ${color}; border: 1px solid var(--border-color);">
          <input type="color" class="calendar-color-input" data-id="${cal.id}" value="${color}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; padding: 0; border: none;">
        </div>
        <span class="calendar-checkbox-label" title="${cal.summary}" style="cursor: pointer;">${cal.summary}</span>
      `;
      
      const checkbox = item.querySelector('input[type="checkbox"]');
      checkbox.addEventListener('change', (e) => {
        const calId = e.target.getAttribute('data-id');
        if (e.target.checked) {
          selectedCalendarIds.add(calId);
        } else {
          selectedCalendarIds.delete(calId);
        }
        refetchCalendarEvents(true);
      });
      
      const colorInput = item.querySelector('.calendar-color-input');
      if (colorInput) {
        colorInput.addEventListener('change', (e) => {
          const calId = e.target.getAttribute('data-id');
          const newColor = e.target.value;
          
          try {
            const localColorsStr = localStorage.getItem('G_CALENDAR_COLORS') || '{}';
            const localColors = JSON.parse(localColorsStr);
            localColors[calId] = newColor;
            localStorage.setItem('G_CALENDAR_COLORS', JSON.stringify(localColors));
          } catch (err) {
            console.error('Failed to save calendar colors to localStorage:', err);
          }
          
          const wrapper = colorInput.closest('.calendar-color-picker-wrapper');
          if (wrapper) {
            wrapper.style.backgroundColor = newColor;
          }
          
          refetchCalendarEvents(true);
        });
      }
      
      if (isMyCal) {
        myGroupList.appendChild(item);
        
        // 글쓰기 권한이 있고 '**헤엄하다_' 로 시작하는 강사 캘린더인 경우 드롭다운 목록에 추가
        if (cal.summary && cal.summary.startsWith('**헤엄하다_')) {
          const option = document.createElement('option');
          option.value = cal.id;
          option.textContent = cal.summary.replace('**헤엄하다_', '');
          inpEventCalendarId.appendChild(option);
        }
      } else {
        otherGroupList.appendChild(item);
      }
    });
    
    // 각각 리스트가 있을 때만 화면에 렌더링
    if (myGroupList.children.length > 0) {
      calendarListContainer.appendChild(myGroupTitle);
      calendarListContainer.appendChild(myGroupList);
    }
    
    if (otherGroupList.children.length > 0) {
      calendarListContainer.appendChild(otherGroupTitle);
      calendarListContainer.appendChild(otherGroupList);
    }
    
    if (inpEventCalendarId.options.length === 0) {
      const option = document.createElement('option');
      option.value = 'primary';
      option.textContent = '기본 캘린더 (쓰기 권한 없음)';
      inpEventCalendarId.appendChild(option);
    }
    
    updateSidebarVisibility();
    
  } catch (err) {
    console.error('Error fetching calendar list:', err);
    let errMsg = err.message || '';
    if (err.result && err.result.error) {
      errMsg = err.result.error.message;
    } else if (typeof err === 'object') {
      errMsg = JSON.stringify(err);
    }
    calendarListContainer.innerHTML = `<div style="font-size: 0.75rem; color: #ef4444; padding: 4px 8px; line-height: 1.4;">로딩 실패:<br>${errMsg}</div>`;
    throw err; // 세션 복원 흐름 등에서 에러를 인지할 수 있도록 예외 재발생
  }
}

// 사이드바의 캘린더 그룹 가시성을 관리하는 함수
function updateSidebarVisibility() {
  const isLessonsOnly = document.body.classList.contains('lessons-calendar-mode');
  
  const myTitle = calendarListContainer.querySelector('.calendar-group-title.is-my');
  const myList = calendarListContainer.querySelector('.calendar-group-list.is-my');
  const otherTitle = calendarListContainer.querySelector('.calendar-group-title.is-other');
  const otherList = calendarListContainer.querySelector('.calendar-group-list.is-other');
  
  const groups = [
    { title: myTitle, list: myList },
    { title: otherTitle, list: otherList }
  ];
  
  groups.forEach(group => {
    if (!group.title || !group.list) return;
    
    if (isLessonsOnly) {
      // 수업 일정 모드일 때는 강사 캘린더가 1개 이상 있는 그룹만 표시
      const hasInstructor = Array.from(group.list.querySelectorAll('.calendar-checkbox-item'))
        .some(item => item.classList.contains('is-instructor'));
      
      if (hasInstructor) {
        group.title.style.display = 'block';
        group.list.style.display = 'flex';
      } else {
        group.title.style.display = 'none';
        group.list.style.display = 'none';
      }
    } else {
      // 일반 모드일 때는 그룹 리스트에 자식이 있으면 무조건 표시
      if (group.list.children.length > 0) {
        group.title.style.display = 'block';
        group.list.style.display = 'flex';
      } else {
        group.title.style.display = 'none';
        group.list.style.display = 'none';
      }
    }
  });
}

// UI 갱신 관련 함수들
function showAuthError(msg) {
  authErrorMsg.textContent = msg;
  authErrorBanner.style.display = 'flex';
}

function hideAuthError() {
  authErrorBanner.style.display = 'none';
}

function updateProfileUI() {
  if (currentUser) {
    userAvatar.src = currentUser.picture || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100';
    userName.textContent = currentUser.name || '관리자';
    userEmail.textContent = currentUser.email;
  }
}

function showDashboard() {
  loginScreen.style.display = 'none';
  appScreen.style.display = 'flex';
}

function showLoginScreen() {
  appScreen.style.display = 'none';
  loginScreen.style.display = 'flex';
}

// 6. 달력 초기화
function initCalendar() {
  const calendarEl = document.getElementById('calendar-container');
  
  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'timeGridWeek',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
    },
    locale: 'ko',
    firstDay: 1, // 한주의 시작은 월요일
    timeZone: 'local',
    editable: true,
    selectable: true,
    eventDisplay: 'block',   // 모든 일정을 꽉 찬 색상 블록(바 형태)으로 강제 적용
    dayMaxEvents: 6,         // 하루에 보여줄 최대 일정 수 (넘어가면 '+더보기' 버튼 제공)
    allDayText: '종일',
    eventMinHeight: 20,
    slotEventOverlap: false, // 일정이 많아지더라도 열의 너비를 균등하게 나눠쓰도록 설정 (중첩 방지 및 균등 분할)
    events: fetchGoogleEvents,
    eventContent: renderEventContent,
    eventClick: handleEventClick,
    select: handleDateSelect,
    eventDrop: handleEventDropOrResize,
    eventResize: handleEventDropOrResize,
    datesSet: function(info) {
      const currentViewType = info.view.type;
      if (lastViewType && lastViewType !== currentViewType) {
        lastViewType = currentViewType;
        refetchCalendarEvents(false); // 뷰 타입 변경 시 네트워크 요청 없이 로컬 캐시 재사용하여 병합/비병합 처리
      } else {
        lastViewType = currentViewType;
      }
    },
    eventDidMount: function(info) {
      // 커스텀 렌더링 카드 스타일이 정상적으로 채워지도록 부모 껍데기 래퍼는 투명화 처리
      info.el.style.backgroundColor = 'transparent';
      info.el.style.border = 'none';
      info.el.style.boxShadow = 'none';
    },
    dayCellDidMount: function(info) {
      if (info.view.type !== 'dayGridMonth') return; // 월간 뷰에서만 일자별 배지 표시
      
      const date = info.date;
      // 로컬 시간 기준 YYYY-MM-DD 형식으로 포맷팅
      const pad = (num) => String(num).padStart(2, '0');
      const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      
      // 해당 날짜의 원래 시작일정이 삭제된 내역 필터링 (O(1) 해시맵 조회)
      const deletedCount = (deletedEventsMap[dateStr] || []).length;
      
      if (deletedCount > 0) {
        // 이미 생성된 배지가 있다면 중복 추가 방지
        const existingBadge = info.el.querySelector('.deleted-event-badge');
        if (existingBadge) existingBadge.remove();
        
        const badge = document.createElement('div');
        badge.className = 'deleted-event-badge';
        badge.innerHTML = `<i class="fa-solid fa-trash-can"></i> ${deletedCount}건`;
        badge.style.cssText = 'font-size: 0.65rem; color: #ef4444; background: #fee2e2; border-radius: 4px; padding: 2px 5px; margin-top: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; font-weight: bold; width: fit-content; position: relative; z-index: 99 !important; pointer-events: auto !important;';
        
        // FullCalendar의 포인터 캡처 및 드래그 방지용 다중 이벤트 리스너 통합 (중복 트리거 300ms 디바운스 적용)
        let isTriggered = false;
        const triggerPopup = (e) => {
          console.log(`[Badge Debug] Day cell badge triggered via event: ${e.type} for date: ${dateStr}`);
          e.preventDefault();
          e.stopPropagation();
          if (isTriggered) {
            console.log('[Badge Debug] Day cell badge trigger ignored due to debounce lock');
            return;
          }
          isTriggered = true;
          showDeletedEventsPopup(dateStr);
          setTimeout(() => { isTriggered = false; }, 300);
        };
        
        badge.addEventListener('pointerdown', triggerPopup);
        badge.addEventListener('mousedown', triggerPopup);
        badge.addEventListener('click', triggerPopup);
        
        const frame = info.el.querySelector('.fc-daygrid-day-frame');
        if (frame) {
          frame.appendChild(badge);
        }
      }
    },
    dayHeaderDidMount: function(info) {
      if (info.view.type === 'dayGridMonth') return; // 월간 뷰 헤더는 요일(월/화)만 나오므로 제외
      if (!info.date) return;
      
      const date = info.date;
      const pad = (num) => String(num).padStart(2, '0');
      const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      
      // O(1) 해시맵 조회
      const deletedCount = (deletedEventsMap[dateStr] || []).length;
      
      if (deletedCount > 0) {
        const existingBadge = info.el.querySelector('.deleted-header-badge');
        if (existingBadge) existingBadge.remove();
        
        const badge = document.createElement('span');
        badge.className = 'deleted-header-badge';
        badge.innerHTML = `<i class="fa-solid fa-trash-can"></i> ${deletedCount}`;
        badge.style.cssText = 'font-size: 0.65rem; color: #ef4444; background: #fee2e2; border-radius: 4px; padding: 1px 4px; margin-left: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 2px; font-weight: bold; vertical-align: middle; position: relative; z-index: 99 !important; pointer-events: auto !important;';
        
        // FullCalendar의 포인터 캡처 및 드래그 방지용 다중 이벤트 리스너 통합 (중복 트리거 300ms 디바운스 적용)
        let isTriggered = false;
        const triggerPopup = (e) => {
          console.log(`[Badge Debug] Day header badge triggered via event: ${e.type} for date: ${dateStr}`);
          e.preventDefault();
          e.stopPropagation();
          if (isTriggered) {
            console.log('[Badge Debug] Day header badge trigger ignored due to debounce lock');
            return;
          }
          isTriggered = true;
          showDeletedEventsPopup(dateStr);
          setTimeout(() => { isTriggered = false; }, 300);
        };
        
        badge.addEventListener('pointerdown', triggerPopup);
        badge.addEventListener('mousedown', triggerPopup);
        badge.addEventListener('click', triggerPopup);
        
        const textEl = info.el.querySelector('.fc-col-header-cell-cushion');
        if (textEl) {
          textEl.appendChild(badge);
        }
      }
    },
    loading: function(isLoading) {
      const spinner = document.getElementById('loading-spinner');
      if (spinner) {
        spinner.style.display = isLoading ? 'flex' : 'none';
      }
    }
  });
  
  calendar.render();
}

// 7. 다중 캘린더로부터 병렬적으로 이벤트 로드 및 병합
async function fetchGoogleEvents(fetchInfo, successCallback, failureCallback) {
  const isLessonsOnly = document.body.classList.contains('lessons-calendar-mode');
  
  let targetIds = Array.from(selectedCalendarIds);
  if (isLessonsOnly) {
    targetIds = targetIds.filter(calendarId => {
      const calMeta = allCalendars.find(c => c.id === calendarId);
      const calName = calMeta ? calMeta.summary || '' : '';
      return calName.startsWith('**헤엄하다_');
    });
  }
  
  if (targetIds.length === 0) {
    successCallback([]);
    return;
  }
  
  try {
    const fetchPromises = targetIds.map(async (calendarId) => {
      // 캘린더 고유 컬러 찾기
      const calMeta = allCalendars.find(c => c.id === calendarId);
      const calColor = resolveCalendarColor(calMeta);
      
      const cacheKey = `${calendarId}_${fetchInfo.startStr}_${fetchInfo.endStr}`;
      if (googleEventsCache.has(cacheKey)) {
        return googleEventsCache.get(cacheKey);
      }
      
      try {
        const response = await gapi.client.calendar.events.list({
          calendarId: calendarId,
          timeMin: fetchInfo.start.toISOString(),
          timeMax: fetchInfo.end.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        
        const items = response.result.items || [];
        
        const parsed = items.map(gEvent => {
          const start = gEvent.start.dateTime || gEvent.start.date;
          const end = gEvent.end.dateTime || gEvent.end.date;
          
          let memberName = '';
          let coachName = '';
          if (gEvent.description) {
            const memberMatch = gEvent.description.match(/회원:\s*(.*)/);
            const coachMatch = gEvent.description.match(/강사:\s*(.*)/);
            if (memberMatch) memberName = memberMatch[1];
            if (coachMatch) coachName = coachMatch[1];
            
            // 호환성 처리: 기존에 저장된 '담당/회원: [value]' 포맷 파싱
            if (!memberMatch && !coachMatch) {
              const oldMatch = gEvent.description.match(/담당\/회원:\s*(.*)/);
              if (oldMatch) {
                const oldVal = oldMatch[1];
                if (oldVal.includes('/')) {
                  const parts = oldVal.split('/');
                  memberName = parts[0].trim();
                  coachName = parts[1].trim();
                } else {
                  memberName = oldVal.trim();
                }
              }
            }
          }
          
          // 개별 이벤트 커스텀 색상(colorId)이 설정되어 있으면 적용하고, 없으면 캘린더 자체 대표색 사용
          let eventColor = calColor;
          if (gEvent.colorId) {
            // 구글 캘린더 11개 색상의 선명한 솔리드 컬러 매핑 (흰색 글씨 가독성 확보)
            const googleEventColors = {
              '1': '#7986cb',  // 라벤더 (Lavender)
              '2': '#33b679',  // 세이지 (Sage/Green)
              '3': '#8e24aa',  // 포도 (Grape/Purple)
              '4': '#e67c73',  // 플라밍고 (Flamingo/Pink)
              '5': '#7986cb',  // 바나나 (Banana/Yellow) -> 노란색 제외 위해 라벤더로 매핑
              '6': '#f57c00',  // 귤 (Mandarin/Orange)
              '7': '#039be5',  // 피콕 (Peacock/Cyan)
              '8': '#616161',  // 흑연 (Graphite/Gray)
              '9': '#3f51b5',  // 블루베리 (Blueberry/Blue)
              '10': '#0b8043', // 바질 (Basil/Green)
              '11': '#d50000'  // 토마토 (Tomato/Red)
            };
            eventColor = googleEventColors[gEvent.colorId] || eventColor;
          }
          
          // 노란색 계열 방어 코드 (캘린더 색상이 노란색 계열인 경우)
          if (isYellowish(eventColor)) {
            eventColor = '#54b4e9'; // 소프트 블루로 대체
          }
          
          // 취소 일정 회색 표시 강제화
          if (gEvent.summary && gEvent.summary.startsWith('*헤엄하다_취소')) {
            eventColor = '#a0aec0'; // 소프트 회색
          }
          
          return {
            id: gEvent.id,
            title: gEvent.summary,
            start: start,
            end: end,
            backgroundColor: eventColor,
            borderColor: eventColor,
            extendedProps: {
              memberName: memberName,
              coachName: coachName,
              colorVal: eventColor,
              googleColorId: gEvent.colorId || '',
              calendarId: calendarId // 삭제/수정/드래그앤드롭 시 정확한 대상을 지목하기 위해 보관
            }
          };
        });
        
        googleEventsCache.set(cacheKey, parsed);
        return parsed;
      } catch (err) {
        console.warn(`캘린더 ${calendarId}의 일정을 불러오지 못했습니다. (권한 부족 등)`, err);
        return [];
      }
    });
    
    const results = await Promise.all(fetchPromises);
    const mergedEvents = results.flat();
    
    // 대시보드 실시간 통계 업데이트 (독립적 백그라운드 갱신)
    fetchAndRefreshDashboardStats(false);
    
    successCallback(mergedEvents);
  } catch (err) {
    console.error('Error fetching google events:', err);
    
    // 임시 디버깅용: 화면에 캘린더 로딩 에러 배너 강제 주입
    const debugBannerId = 'calendar-debug-err-banner';
    let errBanner = document.getElementById(debugBannerId);
    if (!errBanner) {
      errBanner = document.createElement('div');
      errBanner.id = debugBannerId;
      errBanner.style.cssText = 'position:fixed; top:40px; left:0; width:100%; background:#f97316; color:white; padding:12px 18px; z-index:999999; font-family:monospace; font-size:13px; font-weight:bold; box-shadow:0 2px 8px rgba(0,0,0,0.2);';
      document.body.appendChild(errBanner);
    }
    errBanner.innerHTML = '[Calendar Load Failed] ' + (err.stack || err.message || err.toString());
    
    failureCallback(err);
  }
}

// 대시보드 전용 오늘/이번주 일정 백그라운드 로드 및 통계 갱신 함수
async function fetchAndRefreshDashboardStats(forceRefresh = false) {
  if (!forceRefresh && dashboardEventsCache) {
    updateDashboardStats(dashboardEventsCache);
    return;
  }
  
  // 강사 캘린더 추출 ('**헤엄하다_' 로 시작하는 목록)
  const coachCalendars = allCalendars.filter(c => (c.summary || '').startsWith('**헤엄하다_'));
  if (coachCalendars.length === 0) {
    updateDashboardStats([]);
    return;
  }
  
  // 이번주 일요일 00:00:00 ~ 이번주 토요일 23:59:59 범위 산출 (로컬 시간 기준)
  const curr = new Date();
  const first = curr.getDate() - curr.getDay(); // 이번주 일요일
  const last = first + 6; // 이번주 토요일
  
  const startOfWeek = new Date(new Date(curr).setDate(first));
  const endOfWeek = new Date(new Date(curr).setDate(last));
  startOfWeek.setHours(0, 0, 0, 0);
  endOfWeek.setHours(23, 59, 59, 999);
  
  try {
    const fetchPromises = coachCalendars.map(async (cal) => {
      try {
        const response = await gapi.client.calendar.events.list({
          calendarId: cal.id,
          timeMin: startOfWeek.toISOString(),
          timeMax: endOfWeek.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        
        const items = response.result.items || [];
        return items.map(gEvent => {
          const start = gEvent.start.dateTime || gEvent.start.date;
          const end = gEvent.end.dateTime || gEvent.end.date;
          
          let memberName = '';
          let coachName = '';
          if (gEvent.description) {
            const memberMatch = gEvent.description.match(/회원:\s*(.*)/);
            const coachMatch = gEvent.description.match(/강사:\s*(.*)/);
            if (memberMatch) memberName = memberMatch[1];
            if (coachMatch) coachName = coachMatch[1];
            
            if (!memberMatch && !coachMatch) {
              const oldMatch = gEvent.description.match(/담당\/회원:\s*(.*)/);
              if (oldMatch) {
                const oldVal = oldMatch[1];
                if (oldVal.includes('/')) {
                  const parts = oldVal.split('/');
                  memberName = parts[0].trim();
                  coachName = parts[1].trim();
                } else {
                  memberName = oldVal.trim();
                }
              }
            }
          }
          
          let eventColor = resolveCalendarColor(cal);
          if (gEvent.colorId) {
            // 구글 캘린더 11개 색상의 선명한 솔리드 컬러 매핑 (흰색 글씨 가독성 확보)
            const googleEventColors = {
              '1': '#7986cb',  // 라벤더 (Lavender)
              '2': '#33b679',  // 세이지 (Sage/Green)
              '3': '#8e24aa',  // 포도 (Grape/Purple)
              '4': '#e67c73',  // 플라밍고 (Flamingo/Pink)
              '5': '#7986cb',  // 바나나 (Banana/Yellow) -> 노란색 제외 위해 라벤더로 매핑
              '6': '#f57c00',  // 귤 (Mandarin/Orange)
              '7': '#039be5',  // 피콕 (Peacock/Cyan)
              '8': '#616161',  // 흑연 (Graphite/Gray)
              '9': '#3f51b5',  // 블루베리 (Blueberry/Blue)
              '10': '#0b8043', // 바질 (Basil/Green)
              '11': '#d50000'  // 토마토 (Tomato/Red)
            };
            eventColor = googleEventColors[gEvent.colorId] || eventColor;
          }
          
          // 노란색 계열 방어 코드 (캘린더 색상이 노란색 계열인 경우)
          if (isYellowish(eventColor)) {
            eventColor = '#54b4e9'; // 소프트 블루로 대체
          }
          
          // 취소 일정 회색 표시 강제화
          if (gEvent.summary && gEvent.summary.startsWith('*헤엄하다_취소')) {
            eventColor = '#a0aec0';
          }
          
          return {
            id: gEvent.id,
            title: gEvent.summary,
            start: start,
            end: end,
            backgroundColor: eventColor,
            borderColor: eventColor,
            extendedProps: {
              memberName: memberName,
              coachName: coachName,
              colorVal: eventColor,
              googleColorId: gEvent.colorId || '',
              calendarId: cal.id
            }
          };
        });
      } catch (err) {
        console.warn(`대시보드용 캘린더 ${cal.id} 로드 실패`, err);
        return [];
      }
    });
    
    const results = await Promise.all(fetchPromises);
    const mergedEvents = results.flat();
    
    dashboardEventsCache = mergedEvents;
    updateDashboardStats(mergedEvents);
  } catch (err) {
    console.error('Error fetching dashboard events:', err);
  }
}

// 대시보드 통계 카드 계산 및 UI 갱신 함수
function updateDashboardStats(events) {
  const today = new Date();
  const pad = (num) => String(num).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  
  // 캘린더명이 '**헤엄하다_' 로 시작하는 일정만 골라냅니다.
  const filteredEvents = events.filter(e => {
    const calMeta = allCalendars.find(c => c.id === e.extendedProps.calendarId);
    const calName = calMeta ? calMeta.summary || '' : '';
    return calName.startsWith('**헤엄하다_');
  });
  
  // 1. 오늘의 수업 건수 계산
  const todayClasses = filteredEvents.filter(e => {
    const eventDate = new Date(e.start);
    const startLocalDate = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`;
    return startLocalDate === todayStr;
  });
  
  // 2. 이번주 수업 건수 계산 (일요일 ~ 토요일 기준)
  const curr = new Date();
  const first = curr.getDate() - curr.getDay(); // 이번주 일요일
  const last = first + 6; // 이번주 토요일
  
  const firstday = new Date(new Date(curr).setDate(first));
  const lastday = new Date(new Date(curr).setDate(last));
  firstday.setHours(0, 0, 0, 0);
  lastday.setHours(23, 59, 59, 999);
  
  const weeklyClasses = filteredEvents.filter(e => {
    const eventDate = new Date(e.start);
    return eventDate >= firstday && eventDate <= lastday;
  });
  
  // 3. 실제 관리하는 회원 캘린더 수 계산 ('**헤엄하다_' 로 시작하는 것만)
  const actualMemberCalendars = allCalendars.filter(c => (c.summary || '').startsWith('**헤엄하다_'));
  
  // UI 요소 반영
  const statTodayEl = document.getElementById('stat-today-classes');
  const statWeeklyEl = document.getElementById('stat-weekly-classes');
  const statMemberEl = document.getElementById('stat-member-count');
  
  if (statTodayEl) statTodayEl.textContent = `${todayClasses.length} 건`;
  if (statWeeklyEl) statWeeklyEl.textContent = `${weeklyClasses.length} 건`;
  if (statMemberEl) statMemberEl.textContent = `${actualMemberCalendars.length} 개`;

  // 강사별 현황 뷰 갱신
  renderCoachStatusView(filteredEvents);
}

// 강사별 현황 대시보드 카드 생성 및 렌더링 함수
function renderCoachStatusView(events) {
  const coachesGrid = document.getElementById('coaches-grid');
  const coachStatusDate = document.getElementById('coach-status-date');
  if (!coachesGrid || !coachStatusDate) return;
  
  const today = new Date();
  coachStatusDate.textContent = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일 기준`;
  
  coachesGrid.innerHTML = '';
  
  // 강사 캘린더 추출 ('**헤엄하다_' 로 시작하는 목록)
  const coachCalendars = allCalendars.filter(c => (c.summary || '').startsWith('**헤엄하다_'));
  
  if (coachCalendars.length === 0) {
    coachesGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 3rem; font-weight: 500;">연동된 강사 캘린더 목록이 없습니다.</div>';
    return;
  }
  
  // 이번주 날짜 범위 산출
  const curr = new Date();
  const first = curr.getDate() - curr.getDay(); // 이번주 일요일
  const last = first + 6; // 이번주 토요일
  const startOfWeek = new Date(new Date(curr).setDate(first));
  const endOfWeek = new Date(new Date(curr).setDate(last));
  startOfWeek.setHours(0, 0, 0, 0);
  endOfWeek.setHours(23, 59, 59, 999);
  
  coachCalendars.forEach(cal => {
    const coachName = cal.summary.replace('**헤엄하다_', '');
    const calColor = cal.backgroundColor || '#3b82f6';
    
    // 해당 강사의 전체 일정 필터링
    const coachEvents = events.filter(e => e.extendedProps.calendarId === cal.id);
    
    // 1. 오늘의 수업 건수 계산
    const todayEvents = coachEvents.filter(e => {
      const eventDate = new Date(e.start);
      return eventDate.getFullYear() === today.getFullYear() &&
             eventDate.getMonth() === today.getMonth() &&
             eventDate.getDate() === today.getDate();
    });
    
    // 2. 이번주 수업 건수 계산
    const weeklyEvents = coachEvents.filter(e => {
      const eventDate = new Date(e.start);
      return eventDate >= startOfWeek && eventDate <= endOfWeek;
    });
    
    // 오늘 일정을 시간순으로 정렬
    todayEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
    
    // 오늘 일정 목록 HTML 생성
    let eventsListHtml = '';
    if (todayEvents.length > 0) {
      todayEvents.forEach(e => {
        const startDate = new Date(e.start);
        const pad = (num) => String(num).padStart(2, '0');
        const timeStr = `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}`;
        
        eventsListHtml += `
          <div class="coach-status-event-item" style="border-left-color: ${calColor}; cursor: pointer;" data-event-id="${e.id}">
            <span class="coach-status-event-time" style="color: ${calColor};">${timeStr}</span>
            <span class="coach-status-event-title" title="${e.title}">${e.title}</span>
          </div>
        `;
      });
    } else {
      eventsListHtml = `<div class="coach-status-no-events">오늘 예정된 강습이 없습니다.</div>`;
    }
    
    // 카드 카드 노드 생성
    const card = document.createElement('div');
    card.className = 'coach-status-card';
    card.innerHTML = `
      <div class="coach-status-header">
        <span class="coach-status-color" style="background-color: ${calColor};"></span>
        <h4 class="coach-status-name">${coachName}</h4>
      </div>
      <div class="coach-status-stats">
        <div class="coach-status-pill">오늘 <span>${todayEvents.length}건</span></div>
        <div class="coach-status-pill">이번주 <span>${weeklyEvents.length}건</span></div>
      </div>
      <div class="coach-status-events">
        ${eventsListHtml}
      </div>
    `;
    
    coachesGrid.appendChild(card);
  });
  
  // 강사별 오늘 일정 클릭 시 수정 팝업 노출 연동
  coachesGrid.querySelectorAll('.coach-status-event-item').forEach(item => {
    item.addEventListener('click', () => {
      const eventId = item.getAttribute('data-event-id');
      if (eventId) {
        const originalEvent = events.find(e => e.id === eventId);
        if (originalEvent) {
          showEventEditModal(originalEvent);
        }
      }
    });
  });
}

// 8. 일정 상세/수정 클릭 dispatcher
function handleEventClick(info) {
  const event = info.event;
  if (event.extendedProps.isMerged) {
    const itemEl = info.jsEvent.target.closest('.merged-event-item');
    const idx = itemEl ? parseInt(itemEl.getAttribute('data-idx'), 10) : 0;
    const subEvent = event.extendedProps.subEvents[idx];
    showEventEditModal(subEvent);
  } else {
    showEventEditModal({
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      extendedProps: event.extendedProps
    });
  }
}

// 8-1. 실제 일정 수정 모달 활성화 및 바인딩
function showEventEditModal(eventData) {
  const calId = eventData.extendedProps.calendarId;
  
  eventModalTitle.textContent = '수업 일정 수정';
  inpEventId.value = eventData.id;
  // 원래 캘린더 ID 저장
  eventBackdrop.dataset.originalCalendarId = calId;
  inpEventTitle.value = eventData.title;
  inpEventMemberName.value = eventData.extendedProps.memberName || '';
  
  // 드롭다운에 해당 캘린더 ID가 있는지 확인
  let optionExists = false;
  for (let i = 0; i < inpEventCalendarId.options.length; i++) {
    if (inpEventCalendarId.options[i].value === calId) {
      optionExists = true;
      break;
    }
  }
  
  // 없다면 임시로 옵션을 추가하여 표시
  if (!optionExists) {
    const calMeta = allCalendars.find(c => c.id === calId);
    let calName = calMeta ? calMeta.summary : '알 수 없는 캘린더';
    if (calName.startsWith('**헤엄하다_')) {
      calName = calName.replace('**헤엄하다_', '');
    }
    const tempOption = document.createElement('option');
    tempOption.value = calId;
    
    const isWriteAccess = calMeta && (calMeta.accessRole === 'owner' || calMeta.accessRole === 'writer');
    if (!isWriteAccess) {
      tempOption.textContent = `[읽기 전용] ${calName}`;
    } else {
      tempOption.textContent = `${calName} (강사 외)`;
    }
    tempOption.disabled = true;
    tempOption.id = 'temp-read-only-option'; // 나중에 제거하기 위한 ID
    inpEventCalendarId.appendChild(tempOption);
  }
  
  inpEventCalendarId.value = calId;
  
  // 시간 로드 및 포맷팅 (YYYY-MM-DD, HH:MM)
  const pad = (num) => String(num).padStart(2, '0');
  const formatDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const formatTime = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  
  const startDate = new Date(eventData.start);
  inpEventStartDate.value = formatDate(startDate);
  inpEventStartTime.value = formatTime(startDate);
  
  if (eventData.end) {
    const endDate = new Date(eventData.end);
    inpEventEndDate.value = formatDate(endDate);
    inpEventEndTime.value = formatTime(endDate);
  } else {
    const defaultEnd = new Date(startDate.getTime() + 60*60*1000);
    inpEventEndDate.value = formatDate(defaultEnd);
    inpEventEndTime.value = formatTime(defaultEnd);
  }
  
  let loadedColor = eventData.extendedProps.colorVal || '#6b8ed6';
  // 이전 쨍한 색상들과의 호환성 매핑
  if (loadedColor === '#06b6d4') loadedColor = '#56b4b4';
  if (loadedColor === '#3b82f6') loadedColor = '#6b8ed6';
  if (loadedColor === '#8b5cf6') loadedColor = '#9b8ae6';
  if (loadedColor === '#ec4899') loadedColor = '#df6084';
  if (loadedColor === '#f59e0b') loadedColor = '#e1973a';
  inpEventColor.value = loadedColor;
  
  // 쓰기 권한 검사하여 버튼 및 캘린더 드롭다운 제어
  const calMeta = allCalendars.find(c => c.id === calId);
  const canWrite = calMeta && (calMeta.accessRole === 'owner' || calMeta.accessRole === 'writer');
  const btnSaveEvent = document.getElementById('btn-save-event');
  
  if (!canWrite) {
    btnSaveEvent.disabled = true;
    btnSaveEvent.textContent = '수정 불가 (읽기 전용)';
    btnDeleteEvent.style.display = 'none';
    inpEventCalendarId.disabled = true;
  } else {
    btnSaveEvent.disabled = false;
    btnSaveEvent.textContent = '저장';
    btnDeleteEvent.style.display = 'inline-flex';
    inpEventCalendarId.disabled = false; // 수정 가능하면 강사 선택 열어두기
  }
  openModal(eventBackdrop);
}

// 색상 문자열에서 R, G, B 숫자 추출하는 헬퍼
function parseRgb(color) {
  let r = 99, g = 102, b = 241;
  if (!color) return { r, g, b };
  
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }
  } else if (color.startsWith('rgb')) {
    const rgbVals = color.match(/\d+/g);
    if (rgbVals && rgbVals.length >= 3) {
      r = parseInt(rgbVals[0], 10);
      g = parseInt(rgbVals[1], 10);
      b = parseInt(rgbVals[2], 10);
    }
  }
  return { r, g, b };
}

// 노란색 계열 색상 판별 함수 (R > 200, G > 170, B < 120)
function isYellowish(color) {
  const { r, g, b } = parseRgb(color);
  return r > 200 && g > 170 && b < 120;
}

// 캘린더의 구글 표준 색상을 해상도 높게 분석해 리턴하는 함수
function resolveCalendarColor(cal) {
  if (!cal) return '#54b4e9';
  
  // 1. localStorage 커스텀 컬러 체크
  try {
    const localColorsStr = localStorage.getItem('G_CALENDAR_COLORS');
    if (localColorsStr) {
      const localColors = JSON.parse(localColorsStr);
      if (localColors[cal.id]) {
        return localColors[cal.id];
      }
    }
  } catch (e) {
    console.error('Failed to parse G_CALENDAR_COLORS from localStorage:', e);
  }
  
  // 2. secrets.json 커스텀 컬러 체크 (개발/운영 초기 기본값 지원)
  if (secrets && secrets.calendarColors && secrets.calendarColors[cal.id]) {
    return secrets.calendarColors[cal.id];
  }
  
  // 3. 구글 표준 색상 사용
  const color = cal.backgroundColor || '#54b4e9';
  
  // 노란색 계열 방어 코드 (단, 사용자가 수동 지정한 색상은 방어 코드를 타지 않게 분리!)
  if (isYellowish(color)) {
    return '#54b4e9'; // 소프트 블루로 대체
  }
  return color;
}

// 8-2. FullCalendar 커스텀 일정 렌더링 함수
function renderEventContent(arg) {
  const event = arg.event;
  const isTimeGrid = arg.view.type.startsWith('timeGrid');
  
  if (!isTimeGrid) {
    // 월별 뷰(dayGridMonth) 등에서는 콤팩트하고 이쁜 카드 형태로 렌더링
    const color = event.extendedProps.colorVal || '#6366f1';
    const { r, g, b } = parseRgb(color);
    
    return {
      html: `
        <div class="month-event-item" style="border: 1.5px solid ${color} !important; border-left: 4px solid ${color} !important; background-color: rgba(${r}, ${g}, ${b}, 0.08) !important;">
          ${arg.timeText ? `<span class="month-event-time" style="color: ${color} !important; font-weight: 700;">${arg.timeText}</span>` : ''}
          <span class="month-event-title" style="color: #1e293b; font-weight: 600;" title="${event.title}">${event.title}</span>
        </div>
      `
    };
  }
  
  if (event.extendedProps.isMerged) {
    let html = `
      <div class="merged-events-container" style="background: #ffffff !important; border: 1px solid rgba(15, 23, 42, 0.1) !important; padding: 4px !important; display: flex; flex-direction: column; gap: 4px !important; height: auto !important; min-height: 100%; box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important;">
        <div class="merged-events-list" style="display: flex; flex-direction: column; gap: 4px !important;">
    `;
    event.extendedProps.subEvents.forEach((sub, idx) => {
      const color = sub.extendedProps.colorVal || '#6366f1';
      
      // 병합된 내부 일정의 경우, FullCalendar가 subEvent 별로 timeText를 따로 주지 않으므로 직접 계산
      const formatSubTime = (startVal, endVal) => {
        if (!startVal) return '';
        const start = new Date(startVal);
        const end = endVal ? new Date(endVal) : null;
        const pad = (n) => String(n).padStart(2, '0');
        const startStr = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
        if (!end) return startStr;
        const endStr = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
        return `${startStr}-${endStr}`;
      };
      
      const timeRange = formatSubTime(sub.start, sub.end);
      html += `
        <div class="merged-event-item" data-idx="${idx}" style="background: ${color} !important; border: none !important; display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-start; gap: 1px; padding: 2px 3px !important; border-radius: 4px !important; width: 100%; box-sizing: border-box; overflow: hidden;" title="${sub.title} (${timeRange})">
          <span class="merged-event-title" style="font-weight: 600; font-size: 0.72rem; line-height: 1.2; color: #ffffff !important; display: block; text-align: left; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 1px;">${sub.title}</span>
          <span class="merged-event-time" style="font-size: 0.62rem; font-weight: 500; color: rgba(255, 255, 255, 0.8) !important; line-height: 1.0; text-align: left; display: block; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${timeRange}</span>
        </div>
      `;
    });
    html += `
        </div>
      </div>
    `;
    return { html: html };
  }
  
  const color = event.extendedProps.colorVal || '#6366f1';
  // FullCalendar가 로컬 타임존 및 설정(eventTimeFormat)에 맞게 파싱한 공식 timeText를 사용합니다.
  const displayTime = arg.timeText ? arg.timeText.replace(' - ', '-') : '';
  return {
    html: `
      <div class="single-event-container" style="background: ${color} !important; border: none !important; border-radius: 4px !important; display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-start; gap: 1px; padding: 2px 3px !important; height: 100%; box-sizing: border-box; overflow: hidden;" title="${event.title} (${displayTime})">
        <span class="single-event-title" style="font-weight: 600; font-size: 0.72rem; line-height: 1.2; color: #ffffff !important; display: block; text-align: left; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 1px;">${event.title}</span>
        <span class="single-event-time" style="font-size: 0.62rem; font-weight: 500; color: rgba(255, 255, 255, 0.8) !important; line-height: 1.0; text-align: left; display: block; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${displayTime}</span>
      </div>
    `
  };
}

// 읽기 전용 임시 옵션 삭제 헬퍼 함수
function clearTempOptions() {
  const tempOpt = document.getElementById('temp-read-only-option');
  if (tempOpt) {
    tempOpt.remove();
  }
}

// 9. 날짜 드래그 선택 시 자동 생성 다이얼로그
function handleDateSelect(info) {
  eventModalTitle.textContent = '새 수업 일정 등록';
  eventForm.reset();
  
  inpEventId.value = '';
  
  // 신규 등록이므로 캘린더 선택 열어주기
  inpEventCalendarId.disabled = false;
  
  const pad = (num) => String(num).padStart(2, '0');
  const formatDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const formatTime = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  
  inpEventStartDate.value = formatDate(info.start);
  inpEventStartTime.value = formatTime(info.start);
  
  const end = info.end ? new Date(info.end) : new Date(info.start.getTime() + 60*60*1000);
  if (info.allDay) {
    end.setHours(info.start.getHours() + 1);
  }
  
  inpEventEndDate.value = formatDate(end);
  inpEventEndTime.value = formatTime(end);
  
  btnDeleteEvent.style.display = 'none';
  openModal(eventBackdrop);
}

// 10. 드래그앤드롭 및 리사이징 시 구글 연동
async function handleEventDropOrResize(info) {
  const event = info.event;
  const calendarId = event.extendedProps.calendarId; // 각 일정에 매핑된 정확한 캘린더 ID 획득
  
  try {
    const gEvent = await gapi.client.calendar.events.get({
      calendarId: calendarId,
      eventId: event.id
    });
    
    gEvent.result.start = { dateTime: event.start.toISOString() };
    gEvent.result.end = { dateTime: event.end ? event.end.toISOString() : new Date(event.start.getTime() + 60*60*1000).toISOString() };
    
    await gapi.client.calendar.events.update({
      calendarId: calendarId,
      eventId: event.id,
      resource: gEvent.result
    });
    
    console.log('Event schedule updated in Google Calendar');
    googleEventsCache.clear(); // 드래그/리사이즈로 수정 시 캐시 비우기
  } catch (err) {
    console.error('Error updating event drag/resize:', err);
    info.revert();
  }
}

// 11. 일정 폼 제출 (저장/생성)
eventForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = inpEventId.value;
  const calendarId = inpEventCalendarId.value; // 선택 혹은 고정된 타겟 캘린더 ID
  const title = inpEventTitle.value;
  const memberName = inpEventMemberName.value;
  
  // 선택된 강사 이름 가져오기
  const selectedOption = inpEventCalendarId.options[inpEventCalendarId.selectedIndex];
  let coachName = '';
  if (selectedOption) {
    coachName = selectedOption.textContent.replace('[읽기 전용] ', '').replace(' (강사 외)', '').trim();
  }
  
  const startStr = `${inpEventStartDate.value}T${inpEventStartTime.value}:00`;
  const endStr = `${inpEventEndDate.value}T${inpEventEndTime.value}:00`;
  const color = inpEventColor.value;
  
  let googleColorId = '1';
  if (color === '#56b4b4') googleColorId = '7'; // 1번 레인
  if (color === '#9b8ae6') googleColorId = '4'; // 3번 레인
  if (color === '#df6084') googleColorId = '11'; // 4번 레인
  if (color === '#e1973a') googleColorId = '5'; // 개인 교습
  if (color === '#6b8ed6') googleColorId = '9'; // 2번 레인 (Blueberry)
  
  const eventResource = {
    summary: title,
    description: `회원: ${memberName}\n강사: ${coachName}`,
    start: {
      dateTime: new Date(startStr).toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    end: {
      dateTime: new Date(endStr).toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    colorId: googleColorId
  };
  
  try {
    if (id) {
      // 수정 (Update)
      const originalCalendarId = eventBackdrop.dataset.originalCalendarId;
      if (originalCalendarId && originalCalendarId !== calendarId) {
        // 강사(캘린더)가 변경되었을 경우 이벤트 이동(move) 수행
        await gapi.client.calendar.events.move({
          calendarId: originalCalendarId,
          eventId: id,
          destination: calendarId
        });
      }
      
      await gapi.client.calendar.events.patch({
        calendarId: calendarId,
        eventId: id,
        resource: eventResource
      });
      console.log('Event updated');
    } else {
      // 신규 생성 (Insert)
      await gapi.client.calendar.events.insert({
        calendarId: calendarId,
        resource: eventResource
      });
      console.log('Event created');
    }
    
    closeModal(eventBackdrop);
    refetchCalendarEvents(true);
  } catch (err) {
    console.error('Error saving event:', err);
    alert('구글 캘린더에 일정을 저장하는 데 실패했습니다.');
  }
});

// 12. 일정 삭제
btnDeleteEvent.addEventListener('click', async () => {
  const id = inpEventId.value;
  const calendarId = inpEventCalendarId.value; // 고정된 타겟 캘린더 ID
  if (!id || !calendarId) return;
  
  if (confirm('이 일정(수업)을 삭제하시겠습니까?')) {
    try {
      // 삭제 기록 저장을 위한 정보 취합
      const calMeta = allCalendars.find(c => c.id === calendarId);
      const calendarName = calMeta ? calMeta.summary : '기본 캘린더';
      const coachName = calMeta && calMeta.summary.startsWith('**헤엄하다_') 
        ? calMeta.summary.replace('**헤엄하다_', '') 
        : '';
        
      const deletedAt = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
      const eventTitle = inpEventTitle.value;
      const originalStart = `${inpEventStartDate.value} ${inpEventStartTime.value}`;
      const originalEnd = `${inpEventEndDate.value} ${inpEventEndTime.value}`;
      const memberName = inpEventMemberName.value;

      // 1. 스프레드시트에 삭제 내역 저장 요청
      await logDeletedEventToSpreadsheet({
        deletedAt,
        calendarId,
        calendarName,
        eventId: id,
        eventTitle,
        originalStart,
        originalEnd,
        memberName,
        coachName
      });

      // 2. 구글 캘린더에서 일정 삭제
      await gapi.client.calendar.events.delete({
        calendarId: calendarId,
        eventId: id
      });
      console.log('Event deleted');
      
      closeModal(eventBackdrop);
      refetchCalendarEvents(true);
      
      // 3. 삭제 캐시 목록 다시 로드하여 즉시 배지 반영
      await fetchDeletedEvents();
      if (calendar) {
        calendar.refetchEvents(); // 달력 다시 렌더링 강제
      }
    } catch (err) {
      console.error('Error deleting event:', err);
      alert('일정을 삭제하는 데 실패했습니다.');
    }
  }
});

// 13. 설정 로드 및 저장 관리
function loadSavedSettingsToForm() {
  setClientId.value = CONFIG.getClientId();
  setApiKey.value = CONFIG.getApiKey();
  setCalendarId.value = CONFIG.getCalendarId();
  if (setSpreadsheetId) {
    setSpreadsheetId.value = CONFIG.getSpreadsheetId();
  }
  setWhitelist.value = CONFIG.getWhitelist().join(', ');
}

settingsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  saveConfig({
    clientId: setClientId.value,
    apiKey: setApiKey.value,
    calendarId: setCalendarId.value,
    spreadsheetId: setSpreadsheetId ? setSpreadsheetId.value : undefined,
    whitelistEmails: setWhitelist.value
  });
  
  closeModal(settingsBackdrop);
  checkApiSetup();
  
  const clientId = CONFIG.getClientId();
  const apiKey = CONFIG.getApiKey();
  
  if (clientId && apiKey) {
    initializeGapiClient();
    initializeGisClient();
    alert('설정이 저장되었습니다. 페이지를 새로고침하여 적용해 주세요!');
    window.location.reload();
  }
});

// 공통 모달 열기/닫기
function openModal(modalBackdrop) {
  console.log('[Modal Debug] openModal called with element ID:', modalBackdrop ? modalBackdrop.id : 'null');
  if (modalBackdrop) {
    modalBackdrop.classList.add('active');
    console.log('[Modal Debug] Added active class to:', modalBackdrop.id, 'classList is now:', modalBackdrop.className);
  }
}

function closeModal(modalBackdrop) {
  console.log('[Modal Debug] closeModal called with element ID:', modalBackdrop ? modalBackdrop.id : 'null');
  if (modalBackdrop) {
    modalBackdrop.classList.remove('active');
    if (modalBackdrop === eventBackdrop) {
      clearTempOptions();
    }
  }
}

// 이벤트 리스너 설정
function setupEventListeners() {
  googleLoginBtn.addEventListener('click', () => {
    if (tokenClient) {
      tokenClient.callback = handleAuthCallback;
      tokenClient.requestAccessToken({ prompt: 'select_account' });
    } else {
      alert('구글 API 설정이 부족합니다. 설정을 완료해 주세요.');
    }
  });
  
  tempSetupBtn.addEventListener('click', () => openModal(settingsBackdrop));
  btnOpenSettings.addEventListener('click', () => openModal(settingsBackdrop));
  btnSetupNow.addEventListener('click', () => openModal(settingsBackdrop));
  
  if (btnOpenNotifier) {
    btnOpenNotifier.addEventListener('click', openNotifierModal);
  }
  if (closeNotifierBtn) {
    closeNotifierBtn.addEventListener('click', () => closeModal(notifierBackdrop));
  }
  if (btnCloseNotifier) {
    btnCloseNotifier.addEventListener('click', () => closeModal(notifierBackdrop));
  }
  if (notifierTargetDate) {
    notifierTargetDate.addEventListener('change', () => generateNotifications());
  }
  if (notifierTemplateSelect) {
    notifierTemplateSelect.addEventListener('change', handleTemplateSelectChange);
  }
  if (notifierTemplateText) {
    notifierTemplateText.addEventListener('input', () => renderNotifierMessages());
  }
  if (btnNotifierRefresh) {
    btnNotifierRefresh.addEventListener('click', () => generateNotifications());
  }
  
  closeSettingsBtn.addEventListener('click', () => closeModal(settingsBackdrop));
  btnCancelSettings.addEventListener('click', () => closeModal(settingsBackdrop));
  
  btnAddEvent.addEventListener('click', () => {
    eventModalTitle.textContent = '새 수업 일정 등록';
    eventForm.reset();
    inpEventId.value = '';
    inpEventCalendarId.disabled = false; // 신규는 언제나 캘린더 지정 가능
    
    const now = new Date();
    const pad = (num) => String(num).padStart(2, '0');
    inpEventStartDate.value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
    inpEventStartTime.value = `${pad(now.getHours())}:00`;
    
    const oneHourLater = new Date(now.getTime() + 60*60*1000);
    inpEventEndDate.value = `${oneHourLater.getFullYear()}-${pad(oneHourLater.getMonth()+1)}-${pad(oneHourLater.getDate())}`;
    inpEventEndTime.value = `${pad(oneHourLater.getHours())}:00`;
    
    btnDeleteEvent.style.display = 'none';
    openModal(eventBackdrop);
  });
  
  closeEventBtn.addEventListener('click', () => closeModal(eventBackdrop));
  btnCancelEvent.addEventListener('click', () => closeModal(eventBackdrop));
  
  btnLogout.addEventListener('click', () => {
    if (confirm('로그아웃 하시겠습니까?')) {
      try {
        if (accessToken && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
          google.accounts.oauth2.revokeToken(accessToken, () => {});
        }
      } catch (revokeErr) {
        console.warn('OAuth 토큰 폐기(revoke) 중 예외 무시:', revokeErr);
      }
      clearSession();
      showLoginScreen();
    }
  });

  // 캘린더 전체 선택 및 해제 이벤트 리스너 추가
  document.getElementById('btn-cal-select-all').addEventListener('click', () => {
    const isLessonsOnly = document.body.classList.contains('lessons-calendar-mode');
    const checkboxes = calendarListContainer.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
      if (isLessonsOnly) {
        const item = cb.closest('.calendar-checkbox-item');
        if (item && item.classList.contains('is-instructor')) {
          cb.checked = true;
          selectedCalendarIds.add(cb.getAttribute('data-id'));
        }
      } else {
        const isMyCal = cb.getAttribute('data-is-my-cal') === 'true';
        if (isMyCal) {
          cb.checked = true;
          selectedCalendarIds.add(cb.getAttribute('data-id'));
        }
      }
    });
    refetchCalendarEvents(true);
  });

  document.getElementById('btn-cal-deselect-all').addEventListener('click', () => {
    const isLessonsOnly = document.body.classList.contains('lessons-calendar-mode');
    const checkboxes = calendarListContainer.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
      if (isLessonsOnly) {
        const item = cb.closest('.calendar-checkbox-item');
        if (item && item.classList.contains('is-instructor')) {
          cb.checked = false;
          selectedCalendarIds.delete(cb.getAttribute('data-id'));
        }
      } else {
        cb.checked = false;
        selectedCalendarIds.delete(cb.getAttribute('data-id'));
      }
    });
    refetchCalendarEvents(true);
  });

  // 상단 탭 메뉴 전환 이벤트 리스너 추가
  const tabCalendar = document.getElementById('tab-calendar');
  const tabLessonsCalendar = document.getElementById('tab-lessons-calendar');
  const tabCoaches = document.getElementById('tab-coaches');
  const tabRetention = document.getElementById('tab-retention');
  const tabMemberSearch = document.getElementById('tab-member-search');
  const calendarViewCard = document.getElementById('calendar-view-card');
  const coachesViewCard = document.getElementById('coaches-view-card');
  const retentionViewCard = document.getElementById('retention-view-card');
  const memberSearchViewCard = document.getElementById('member-search-view-card');
  
  if (tabCalendar && tabLessonsCalendar && tabCoaches && tabRetention && tabMemberSearch && tabMembers &&
      calendarViewCard && coachesViewCard && retentionViewCard && memberSearchViewCard && membersViewCard) {
    tabCalendar.addEventListener('click', () => {
      tabCalendar.classList.add('active');
      tabLessonsCalendar.classList.remove('active');
      tabCoaches.classList.remove('active');
      tabRetention.classList.remove('active');
      tabMemberSearch.classList.remove('active');
      tabMembers.classList.remove('active');
      document.body.classList.remove('lessons-calendar-mode');
      calendarViewCard.style.display = 'block';
      coachesViewCard.style.display = 'none';
      retentionViewCard.style.display = 'none';
      memberSearchViewCard.style.display = 'none';
      membersViewCard.style.display = 'none';
      updateSidebarVisibility();
      refetchCalendarEvents(false);
    });
    
    tabLessonsCalendar.addEventListener('click', () => {
      tabCalendar.classList.remove('active');
      tabLessonsCalendar.classList.add('active');
      tabCoaches.classList.remove('active');
      tabRetention.classList.remove('active');
      tabMemberSearch.classList.remove('active');
      tabMembers.classList.remove('active');
      document.body.classList.add('lessons-calendar-mode');
      calendarViewCard.style.display = 'block';
      coachesViewCard.style.display = 'none';
      retentionViewCard.style.display = 'none';
      memberSearchViewCard.style.display = 'none';
      membersViewCard.style.display = 'none';
      updateSidebarVisibility();
      refetchCalendarEvents(false);
    });
    
    tabCoaches.addEventListener('click', () => {
      tabCoaches.classList.add('active');
      tabCalendar.classList.remove('active');
      tabLessonsCalendar.classList.remove('active');
      tabRetention.classList.remove('active');
      tabMemberSearch.classList.remove('active');
      tabMembers.classList.remove('active');
      document.body.classList.remove('lessons-calendar-mode');
      calendarViewCard.style.display = 'none';
      coachesViewCard.style.display = 'flex';
      retentionViewCard.style.display = 'none';
      memberSearchViewCard.style.display = 'none';
      membersViewCard.style.display = 'none';
      updateSidebarVisibility();
    });
    
    tabRetention.addEventListener('click', () => {
      tabRetention.classList.add('active');
      tabCalendar.classList.remove('active');
      tabLessonsCalendar.classList.remove('active');
      tabCoaches.classList.remove('active');
      tabMemberSearch.classList.remove('active');
      tabMembers.classList.remove('active');
      document.body.classList.remove('lessons-calendar-mode');
      calendarViewCard.style.display = 'none';
      coachesViewCard.style.display = 'none';
      retentionViewCard.style.display = 'flex';
      memberSearchViewCard.style.display = 'none';
      membersViewCard.style.display = 'none';
      updateSidebarVisibility();
      loadRetentionData();
    });

    tabMemberSearch.addEventListener('click', () => {
      tabMemberSearch.classList.add('active');
      tabCalendar.classList.remove('active');
      tabLessonsCalendar.classList.remove('active');
      tabCoaches.classList.remove('active');
      tabRetention.classList.remove('active');
      tabMembers.classList.remove('active');
      document.body.classList.remove('lessons-calendar-mode');
      calendarViewCard.style.display = 'none';
      coachesViewCard.style.display = 'none';
      retentionViewCard.style.display = 'none';
      memberSearchViewCard.style.display = 'flex';
      membersViewCard.style.display = 'none';
      updateSidebarVisibility();
      
      // 시작일, 종료일 기본 날짜값 세팅 (오늘 기준 과거 3개월 ~ 미래 3개월)
      const startDateInput = document.getElementById('member-search-start-date');
      const endDateInput = document.getElementById('member-search-end-date');
      if (startDateInput && endDateInput && !startDateInput.value && !endDateInput.value) {
        const today = new Date();
        const startVal = new Date();
        startVal.setMonth(today.getMonth() - 3);
        const endVal = new Date();
        endVal.setMonth(today.getMonth() + 3);
        
        const formatDate = (date) => {
          const pad = (n) => String(n).padStart(2, '0');
          return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
        };
        
        startDateInput.value = formatDate(startVal);
        endDateInput.value = formatDate(endVal);
      }
      
      const searchInput = document.getElementById('member-search-input');
      if (searchInput) searchInput.focus();
    });

    tabMembers.addEventListener('click', () => {
      tabMembers.classList.add('active');
      tabCalendar.classList.remove('active');
      tabLessonsCalendar.classList.remove('active');
      tabCoaches.classList.remove('active');
      tabRetention.classList.remove('active');
      tabMemberSearch.classList.remove('active');
      document.body.classList.remove('lessons-calendar-mode');
      calendarViewCard.style.display = 'none';
      coachesViewCard.style.display = 'none';
      retentionViewCard.style.display = 'none';
      memberSearchViewCard.style.display = 'none';
      membersViewCard.style.display = 'flex';
      updateSidebarVisibility();
      loadMemberList();
    });
  }

  // ESC 키를 눌렀을 때 활성화된 모달을 닫는 리스너 추가 (이벤트 전파 방지 적용)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      let isModalClosed = false;
      
      if (eventBackdrop.classList.contains('active')) {
        closeModal(eventBackdrop);
        isModalClosed = true;
      }
      if (settingsBackdrop.classList.contains('active')) {
        closeModal(settingsBackdrop);
        isModalClosed = true;
      }
      if (memberBackdrop && memberBackdrop.classList.contains('active')) {
        closeModal(memberBackdrop);
        isModalClosed = true;
      }
      if (notifierBackdrop && notifierBackdrop.classList.contains('active')) {
        closeModal(notifierBackdrop);
        isModalClosed = true;
      }
      
      const delBackdrop = document.getElementById('deleted-events-backdrop');
      if (delBackdrop && delBackdrop.classList.contains('active')) {
        closeModal(delBackdrop);
        isModalClosed = true;
      }
      
      // 모달이 열려 있어서 닫았다면, Escape 키 이벤트가 전파되어 FullCalendar 더보기 팝업까지 한꺼번에 닫히는 것을 방지
      if (isModalClosed) {
        e.stopPropagation();
        e.preventDefault();
      }
    }
  }, true);

  // 모바일 사이드바 토글 및 백드롭 이벤트
  if (btnSidebarToggle && appSidebar && sidebarBackdrop) {
    btnSidebarToggle.addEventListener('click', () => {
      appSidebar.classList.add('active');
      sidebarBackdrop.classList.add('active');
    });
  }
  
  const closeMobileSidebar = () => {
    if (appSidebar && sidebarBackdrop) {
      appSidebar.classList.remove('active');
      sidebarBackdrop.classList.remove('active');
    }
  };
  
  if (btnSidebarClose) {
    btnSidebarClose.addEventListener('click', closeMobileSidebar);
  }
  
  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', closeMobileSidebar);
  }

  // 사이드바 내부 메뉴/설정/로그아웃 클릭 시 모바일 환경이면 사이드바 자동으로 닫기
  const sidebarButtons = document.querySelectorAll('.sidebar-menu button, .sidebar-menu a, #btn-logout');
  sidebarButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        closeMobileSidebar();
      }
    });
  });

  // 데스크톱 사이드바 접기/펴기 토글 리스너
  const btnSidebarDesktopToggle = document.getElementById('btn-sidebar-desktop-toggle');
  if (btnSidebarDesktopToggle && appSidebar) {
    btnSidebarDesktopToggle.addEventListener('click', () => {
      appSidebar.classList.toggle('collapsed');
      // 사이드바 트랜지션 완료 후에 FullCalendar 크기 동적으로 조율
      setTimeout(() => {
        if (calendar) {
          calendar.updateSize();
        }
      }, 310);
    });
  }
}

// 14. 강사별 재등록율 데이터 로드 및 계산
async function loadRetentionData() {
  const loadingEl = document.getElementById('retention-loading');
  const contentEl = document.getElementById('retention-content');
  const gridEl = document.getElementById('retention-grid');
  
  if (!loadingEl || !contentEl || !gridEl) return;
  
  loadingEl.style.display = 'block';
  contentEl.style.display = 'none';
  gridEl.innerHTML = '';
  
  try {
    // 강사 캘린더 추출 ('**헤엄하다_' 로 시작하는 목록)
    const coachCalendars = allCalendars.filter(c => (c.summary || '').startsWith('**헤엄하다_'));
    if (coachCalendars.length === 0) {
      gridEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 3rem; font-weight: 500;">분석할 수 있는 강사 캘린더 목록이 없습니다.</div>';
      loadingEl.style.display = 'none';
      contentEl.style.display = 'block';
      return;
    }
    
    // 분석할 범위 설정 (과거 6개월 ~ 미래 6개월)
    const now = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(now.getMonth() - 6);
    const sixMonthsAhead = new Date();
    sixMonthsAhead.setMonth(now.getMonth() + 6);
    
    // 각 강사 캘린더로부터 과거 6개월 ~ 미래 6개월치의 일정을 병렬로 로드
    const fetchPromises = coachCalendars.map(async (cal) => {
      try {
        const response = await gapi.client.calendar.events.list({
          calendarId: cal.id,
          timeMin: sixMonthsAgo.toISOString(),
          timeMax: sixMonthsAhead.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 2500
        });
        
        return {
          cal: cal,
          events: response.result.items || []
        };
      } catch (err) {
        console.warn(`강사 캘린더 ${cal.summary} 일정 로드 실패:`, err);
        return { cal: cal, events: [] };
      }
    });
    
    const results = await Promise.all(fetchPromises);
    
    // 강사별 재등록율 계산 및 렌더링
    results.forEach(res => {
      const coachName = res.cal.summary.replace('**헤엄하다_', '');
      const calColor = res.cal.backgroundColor || '#3b82f6';
      const eventsList = res.events;
      
      // 회원별 데이터 그룹화
      const members = {};
      
      eventsList.forEach(gEvent => {
        let memberName = '';
        if (gEvent.description) {
          const memberMatch = gEvent.description.match(/회원:\s*(.*)/);
          if (memberMatch) {
            memberName = memberMatch[1].trim();
          } else {
            const oldMatch = gEvent.description.match(/담당\/회원:\s*(.*)/);
            if (oldMatch) {
              const oldVal = oldMatch[1];
              memberName = oldVal.includes('/') ? oldVal.split('/')[0].trim() : oldVal.trim();
            }
          }
        }
        
        // 타이틀에서도 시도
        if (!memberName && gEvent.summary) {
          const titleMatch = gEvent.summary.match(/\]\s*([^\(]+)/);
          if (titleMatch) {
            memberName = titleMatch[1].trim();
          }
        }
        
        if (!memberName) return; // 회원명이 없으면 제외
        
        let current = null;
        let total = null;
        if (gEvent.summary) {
          const sessionMatch = gEvent.summary.match(/(\d+)\/(\d+)\s*회차/);
          if (sessionMatch) {
            current = parseInt(sessionMatch[1], 10);
            total = parseInt(sessionMatch[2], 10);
          }
        }
        
        const date = new Date(gEvent.start.dateTime || gEvent.start.date);
        
        if (!members[memberName]) {
          members[memberName] = [];
        }
        members[memberName].push({
          date: date,
          current: current,
          total: total,
          summary: gEvent.summary
        });
      });
      
      // 각 회원의 등록 회차 수 계산
      const memberRetentionStats = [];
      let totalMembers = 0;
      let reRegisteredCount = 0;
      
      Object.keys(members).forEach(mName => {
        const lessons = members[mName];
        lessons.sort((a, b) => a.date - b.date); // 시간 순 정렬
        
        let packageCount = 0;
        let lastCurrent = -1;
        let lastTotal = -1;
        let maxSessionInfo = '회차 정보 없음';
        
        lessons.forEach(l => {
          if (l.current !== null && l.total !== null) {
            // 리셋 감지 (이전 회차보다 번호가 내려갔거나, 총 회차가 바뀌었을 때)
            if (l.current < lastCurrent || l.total !== lastTotal) {
              packageCount++;
            } else if (packageCount === 0) {
              packageCount = 1;
            }
            lastCurrent = l.current;
            lastTotal = l.total;
          }
        });
        
        if (packageCount === 0) {
          packageCount = 1;
        }
        
        // 오늘 날짜 기준 현재 진행중인 수업 회차 계산
        let activeSessionInfo = '회차 정보 없음';
        const todayLimit = new Date();
        const pastOrTodayLessons = lessons.filter(l => l.date <= todayLimit && l.current !== null && l.total !== null);
        
        if (pastOrTodayLessons.length > 0) {
          const latestPast = pastOrTodayLessons[pastOrTodayLessons.length - 1];
          activeSessionInfo = `현재: ${latestPast.current}/${latestPast.total}회차`;
        } else {
          const futureLessons = lessons.filter(l => l.date > todayLimit && l.current !== null && l.total !== null);
          if (futureLessons.length > 0) {
            const earliestFuture = futureLessons[0];
            activeSessionInfo = `현재: ${earliestFuture.current}/${earliestFuture.total}회차 (예정)`;
          }
        }
        
        totalMembers++;
        if (packageCount >= 2) {
          reRegisteredCount++;
        }
        
        memberRetentionStats.push({
          name: mName,
          packageCount: packageCount,
          status: activeSessionInfo,
          totalLessonsCount: lessons.length,
          isReRegistered: packageCount >= 2
        });
      });
      
      const rate = totalMembers > 0 ? (reRegisteredCount / totalMembers) * 100 : 0;
      const singleCount = totalMembers - reRegisteredCount;
      
      // 회원 상세 보기 HTML 생성
      memberRetentionStats.sort((a, b) => b.packageCount - a.packageCount || a.name.localeCompare(b.name));
      let memberItemsHtml = '';
      if (memberRetentionStats.length > 0) {
        memberRetentionStats.forEach(mem => {
          memberItemsHtml += `
            <div class="retention-member-item" data-re-registered="${mem.isReRegistered}">
              <span class="retention-member-name">${mem.name}</span>
              <span class="retention-member-lessons">(총 수업 ${mem.totalLessonsCount}회)</span>
              <span class="retention-member-status">${mem.status}</span>
              <span class="retention-member-badge ${mem.isReRegistered ? 're-registered' : 'single'}">
                ${mem.packageCount}회 등록${mem.isReRegistered ? ' (재등록)' : ''}
              </span>
            </div>
          `;
        });
      } else {
        memberItemsHtml = '<div style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 1rem;">진행된 수업 기록이 없습니다.</div>';
      }
      
      // 카드 생성
      const card = document.createElement('div');
      card.className = 'retention-card';
      card.innerHTML = `
        <div class="retention-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="retention-color" style="background-color: ${calColor};"></span>
            <h4 class="retention-coach-name">${coachName}</h4>
          </div>
          <span class="retention-percentage" style="color: ${calColor}; background-color: ${calColor}10;">${rate.toFixed(1)}%</span>
        </div>
        
        <div class="retention-progress-bg">
          <div class="retention-progress-bar" style="width: ${rate}%; background-color: ${calColor};"></div>
        </div>
        
        <div class="retention-stats">
          <div class="retention-stat-item active" data-filter="all">전체 회원<span>${totalMembers}명</span></div>
          <div class="retention-stat-item" data-filter="re">재등록 회원<span>${reRegisteredCount}명</span></div>
          <div class="retention-stat-item" data-filter="single">신규/단건<span>${singleCount}명</span></div>
        </div>
        
        <div class="retention-members-toggle" data-cal-id="${res.cal.id}" style="color: ${calColor};">
          회원 상세 보기 <i class="fa-solid fa-chevron-down" style="margin-left: 4px;"></i>
        </div>
        
        <div id="retention-members-${res.cal.id}" class="retention-members-list" style="display: none;">
          ${memberItemsHtml}
        </div>
      `;
      
      gridEl.appendChild(card);
    });
    
    // 상세 토글 리스너 바인딩
    gridEl.querySelectorAll('.retention-members-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const calId = btn.getAttribute('data-cal-id');
        const listEl = document.getElementById(`retention-members-${calId}`);
        const iconEl = btn.querySelector('i');
        
        if (listEl && listEl.style.display === 'none') {
          listEl.style.display = 'flex';
          iconEl.className = 'fa-solid fa-chevron-up';
        } else if (listEl) {
          listEl.style.display = 'none';
          iconEl.className = 'fa-solid fa-chevron-down';
        }
      });
    });

    // 통계 항목 필터 및 라벨 활성화 리스너 바인딩
    gridEl.querySelectorAll('.retention-card').forEach(card => {
      const statItems = card.querySelectorAll('.retention-stat-item');
      const listEl = card.querySelector('.retention-members-list');
      const toggleBtn = card.querySelector('.retention-members-toggle');
      const iconEl = toggleBtn ? toggleBtn.querySelector('i') : null;
      
      statItems.forEach(item => {
        item.addEventListener('click', () => {
          const filter = item.getAttribute('data-filter');
          
          // active 클래스 리셋 및 부여
          statItems.forEach(si => si.classList.remove('active'));
          item.classList.add('active');
          
          // 회원 목록이 닫혀있다면 강제로 열어줌
          if (listEl) {
            listEl.style.display = 'flex';
            if (iconEl) iconEl.className = 'fa-solid fa-chevron-up';
          }
          
          // 회원 목록 조건부 필터링
          const memberItems = card.querySelectorAll('.retention-member-item');
          memberItems.forEach(mItem => {
            const isReRegistered = mItem.getAttribute('data-re-registered') === 'true';
            
            if (filter === 'all') {
              mItem.style.display = 'flex';
            } else if (filter === 're') {
              mItem.style.display = isReRegistered ? 'flex' : 'none';
            } else if (filter === 'single') {
              mItem.style.display = !isReRegistered ? 'flex' : 'none';
            }
          });
        });
      });
    });
    
    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';
  } catch (err) {
    console.error('재등록율 분석 실패:', err);
    gridEl.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #ef4444; padding: 3rem; font-weight: 500;">재등록율 데이터를 불러오는 중 오류가 발생했습니다.<br>${err.message || err}</div>`;
    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';
  }
}

// 15. 회원별 일정 검색 및 조회 함수
async function performMemberSearch() {
  const queryInput = document.getElementById('member-search-input');
  const loadingEl = document.getElementById('member-search-loading');
  const resultEl = document.getElementById('member-search-result');
  const tbodyEl = document.getElementById('member-search-tbody');
  const summaryEl = document.getElementById('member-search-result-summary');
  
  if (!queryInput || !loadingEl || !resultEl || !tbodyEl || !summaryEl) return;
  
  const query = queryInput.value.trim();
  if (!query) {
    alert('회원 이름을 입력해주세요.');
    queryInput.focus();
    return;
  }
  
  loadingEl.style.display = 'block';
  resultEl.style.display = 'none';
  tbodyEl.innerHTML = '';
  
  try {
    // 강사 캘린더 추출 ('**헤엄하다_' 로 시작하는 목록)
    const coachCalendars = allCalendars.filter(c => (c.summary || '').startsWith('**헤엄하다_'));
    if (coachCalendars.length === 0) {
      summaryEl.textContent = '조회할 강사 캘린더가 없습니다.';
      loadingEl.style.display = 'none';
      resultEl.style.display = 'block';
      return;
    }
    
    // 입력창에서 검색 시작일 및 종료일 가져오기 (기본값: 오늘 기준 과거 3개월 ~ 미래 3개월)
    const startDateInput = document.getElementById('member-search-start-date');
    const endDateInput = document.getElementById('member-search-end-date');
    
    let startRange = new Date();
    startRange.setMonth(startRange.getMonth() - 3);
    let endRange = new Date();
    endRange.setMonth(endRange.getMonth() + 3);
    
    if (startDateInput && startDateInput.value) {
      startRange = new Date(startDateInput.value + 'T00:00:00');
    }
    if (endDateInput && endDateInput.value) {
      endRange = new Date(endDateInput.value + 'T23:59:59');
    }
    
    const fetchPromises = coachCalendars.map(async (cal) => {
      try {
        const response = await gapi.client.calendar.events.list({
          calendarId: cal.id,
          timeMin: startRange.toISOString(),
          timeMax: endRange.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 2500
        });
        return {
          coachName: cal.summary.replace('**헤엄하다_', ''),
          events: response.result.items || []
        };
      } catch (err) {
        console.warn(`회원 검색 중 캘린더 로드 실패: ${cal.summary}`, err);
        return { coachName: cal.summary.replace('**헤엄하다_', ''), events: [] };
      }
    });
    
    const results = await Promise.all(fetchPromises);
    const matchedEvents = [];
    
    results.forEach(res => {
      res.events.forEach(gEvent => {
        let isMatch = false;
        let memberName = '';
        
        // 1. description에서 회원명 매칭
        if (gEvent.description) {
          const memberMatch = gEvent.description.match(/회원:\s*(.*)/);
          if (memberMatch) {
            memberName = memberMatch[1].trim();
          } else {
            const oldMatch = gEvent.description.match(/담당\/회원:\s*(.*)/);
            if (oldMatch) {
              const oldVal = oldMatch[1];
              memberName = oldVal.includes('/') ? oldVal.split('/')[0].trim() : oldVal.trim();
            }
          }
        }
        
        // 2. 타이틀에서 회원명 매칭
        if (!memberName && gEvent.summary) {
          const titleMatch = gEvent.summary.match(/\]\s*([^\(]+)/);
          if (titleMatch) {
            memberName = titleMatch[1].trim();
          }
        }
        
        // 검색어 포함 여부 확인 (이름 매칭 혹은 이벤트 제목에 검색어 포함 여부)
        const summaryText = gEvent.summary || '';
        const descText = gEvent.description || '';
        if (
          (memberName && memberName.toLowerCase().includes(query.toLowerCase())) ||
          summaryText.toLowerCase().includes(query.toLowerCase()) ||
          descText.toLowerCase().includes(query.toLowerCase())
        ) {
          isMatch = true;
        }
        
        if (isMatch) {
          // 회차 정보 파싱
          let sessionInfo = '회차 정보 없음';
          if (gEvent.summary) {
            const sessionMatch = gEvent.summary.match(/(\d+\/\d+\s*회차)/);
            if (sessionMatch) {
              sessionInfo = sessionMatch[1];
            }
          }
          
          matchedEvents.push({
            event: gEvent,
            coachName: itemCoachName(res.coachName, gEvent.description),
            memberName: memberName || '이름 없음',
            sessionInfo: sessionInfo,
            start: new Date(gEvent.start.dateTime || gEvent.start.date),
            end: new Date(gEvent.end.dateTime || gEvent.end.date)
          });
        }
      });
    });
    
    // 가장 최신 일정이 위로 오도록 내림차순 정렬
    matchedEvents.sort((a, b) => b.start - a.start);
    
    summaryEl.textContent = `'${query}' 검색 결과: 총 ${matchedEvents.length}건의 일정이 검색되었습니다.`;
    
    if (matchedEvents.length === 0) {
      tbodyEl.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 2rem;">검색된 일정이 없습니다. 회원 이름을 다시 확인해 주세요.</td>
        </tr>
      `;
    } else {
      const formatDate = (date) => {
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const pad = (n) => String(n).padStart(2, '0');
        return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} (${days[date.getDay()]})`;
      };
      
      const formatTime = (start, end) => {
        const pad = (n) => String(n).padStart(2, '0');
        const startStr = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
        const endStr = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
        return `${startStr} ~ ${endStr}`;
      };
      
      matchedEvents.forEach(item => {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid var(--border-color)';
        row.style.fontSize = '0.85rem';
        row.innerHTML = `
          <td data-label="날짜/시간" style="padding: 12px 16px;">
            <div style="font-weight: 600; color: var(--text-main);">${formatDate(item.start)}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">${formatTime(item.start, item.end)}</div>
          </td>
          <td data-label="강사" style="padding: 12px 16px; font-weight: 600; color: var(--color-primary);">${item.coachName}</td>
          <td data-label="일정 제목" style="padding: 12px 16px; color: var(--text-main); font-weight: 500;">${item.event.summary || '제목 없음'}</td>
          <td data-label="회차 정보" style="padding: 12px 16px;">
            <span style="font-size: 0.75rem; font-weight: 700; color: var(--color-secondary); background-color: rgba(6, 182, 212, 0.08); padding: 2px 6px; border-radius: 4px;">
              ${item.sessionInfo}
            </span>
          </td>
        `;
        tbodyEl.appendChild(row);
      });
    }
    
    loadingEl.style.display = 'none';
    resultEl.style.display = 'block';
  } catch (err) {
    console.error('Error performing member search:', err);
    alert('회원 일정 검색 중 오류가 발생했습니다.');
    loadingEl.style.display = 'none';
  }
}

// 강사 캘린더 매핑에서 본문에 기록된 실제 강사명을 파싱하기 위한 헬퍼 함수
function itemCoachName(defaultName, description) {
  if (description) {
    const coachMatch = description.match(/강사:\s*(.*)/);
    if (coachMatch) return coachMatch[1].trim();
  }
  return defaultName;
}

// 회원 검색 이벤트 바인딩
const btnMemberSearch = document.getElementById('btn-member-search');
const memberSearchInput = document.getElementById('member-search-input');

if (btnMemberSearch) {
  btnMemberSearch.addEventListener('click', performMemberSearch);
}
if (memberSearchInput) {
  memberSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      performMemberSearch();
    }
  });
}

// =========================================================================
// 회원 목록 관리 (Google Sheets 연동 CRUD)
// =========================================================================

let cachedMembers = []; // 메모리 상에 캐시된 회원 목록 (행 수정/삭제 시 index 매핑용)

// 1. 스프레드시트 '회원목록' 시트 유효성 검사 및 자동 생성
async function checkOrCreateMemberSheet() {
  const spreadsheetId = CONFIG.getSpreadsheetId();
  if (!spreadsheetId) {
    throw new Error('스프레드시트 ID가 설정되지 않았습니다.');
  }

  try {
    // 스프레드시트 메타데이터를 가져와 시트 목록 확인
    const response = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId
    });
    
    const sheets = response.result.sheets || [];
    const hasMemberSheet = sheets.some(s => s.properties.title === '회원목록');
    
    if (!hasMemberSheet) {
      console.log("'회원목록' 시트가 없습니다. 시트를 새로 생성합니다.");
      // '회원목록' 시트 추가 요청
      await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheetId,
        resource: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: '회원목록'
                }
              }
            }
          ]
        }
      });
      
      // 헤더 추가
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        range: '회원목록!A1:I1',
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [['ID', '이름', '성별', '나이', '성인여부', '연락처', '등록일', '메모', '상태']]
        }
      });
      console.log("'회원목록' 시트 및 헤더 생성이 완료되었습니다.");
    }
  } catch (err) {
    console.error('Error checking or creating member sheet:', err);
    throw err;
  }
}

// 2. 회원 목록 조회 (Read)
async function loadMemberList() {
  if (!membersLoading || !membersListContainer || !membersTbody) return;
  
  membersLoading.style.display = 'block';
  membersListContainer.style.display = 'none';
  
  try {
    await checkOrCreateMemberSheet();
    
    const spreadsheetId = CONFIG.getSpreadsheetId();
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: '회원목록!A2:I1000'
    });
    
    const rows = response.result.values || [];
    cachedMembers = rows.map((row, index) => {
      return {
        rowIndex: index + 2, // 1-based index 이며 헤더가 1행이므로 +2
        id: row[0] || '',
        name: row[1] || '',
        gender: row[2] || '',
        age: row[3] || '',
        isAdult: row[4] || '',
        phone: row[5] || '',
        joinedDate: row[6] || '',
        memo: row[7] || '',
        status: row[8] || ''
      };
    }).filter(member => member.id !== ''); // 빈 행 제거
    
    renderMembersTable();
  } catch (err) {
    console.error('Error loading member list:', err);
    alert('회원 목록을 불러오는 중 오류가 발생했습니다. Spreadsheet ID 및 권한을 확인해주세요.');
    membersLoading.style.display = 'none';
  }
}

// 3. 회원 목록 렌더링
function renderMembersTable() {
  if (!membersTbody || !membersLoading || !membersListContainer || !membersCountSummary) return;
  
  membersTbody.innerHTML = '';
  
  const query = (memberFilterInput ? memberFilterInput.value : '').trim().toLowerCase();
  
  const filteredMembers = cachedMembers.filter(member => {
    if (!query) return true;
    return member.name.toLowerCase().includes(query) || member.phone.toLowerCase().includes(query);
  });
  
  if (filteredMembers.length === 0) {
    membersCountSummary.textContent = '검색된 회원이 없습니다.';
  } else {
    membersCountSummary.textContent = `총 ${filteredMembers.length}명의 회원이 등록되어 있습니다.`;
  }
  
  filteredMembers.forEach(member => {
    const tr = document.createElement('tr');
    
    // 상태에 따른 뱃지 스타일 분기
    let statusBadgeColor = 'var(--text-muted)';
    let statusBadgeBg = 'rgba(15, 23, 42, 0.05)';
    if (member.status === '등록') {
      statusBadgeColor = 'var(--color-primary)';
      statusBadgeBg = 'rgba(99, 102, 241, 0.08)';
    } else if (member.status === '대기') {
      statusBadgeColor = '#f59e0b';
      statusBadgeBg = 'rgba(245, 158, 11, 0.08)';
    } else if (member.status === '만료') {
      statusBadgeColor = '#ef4444';
      statusBadgeBg = 'rgba(239, 68, 68, 0.08)';
    } else if (member.status === '중단') {
      statusBadgeColor = '#6b7280';
      statusBadgeBg = 'rgba(107, 114, 128, 0.08)';
    }
    
    tr.innerHTML = `
      <td data-label="이름" style="font-weight: 600; color: var(--text-main);">${escapeHtml(member.name)}</td>
      <td data-label="성별">${escapeHtml(member.gender || '남성')}</td>
      <td data-label="나이">${escapeHtml(member.age ? member.age + '세' : '-')}</td>
      <td data-label="구분">
        <span style="font-size: 0.75rem; font-weight: 700; color: var(--color-secondary); background-color: rgba(6, 182, 212, 0.06); padding: 2px 6px; border-radius: 4px;">
          ${escapeHtml(member.isAdult || '성인')}
        </span>
      </td>
      <td data-label="연락처"><span class="member-phone-number">${escapeHtml(member.phone)}</span></td>
      <td data-label="등록일">${escapeHtml(member.joinedDate)}</td>
      <td data-label="메모" class="member-table-memo" title="${escapeHtml(member.memo)}">
        ${escapeHtml(member.memo)}
      </td>
      <td data-label="상태">
        <span style="font-size: 0.75rem; font-weight: 700; color: ${statusBadgeColor}; background-color: ${statusBadgeBg}; padding: 2px 8px; border-radius: 20px;">
          ${escapeHtml(member.status || '등록')}
        </span>
      </td>
      <td data-label="관리" style="text-align: center;" class="member-table-actions">
        <button class="members-action-btn edit" data-id="${member.id}" title="수정">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button class="members-action-btn delete" data-id="${member.id}" title="삭제">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </td>
    `;
    
    // 버튼 이벤트 바인딩
    tr.querySelector('.members-action-btn.edit').addEventListener('click', () => {
      openMemberFormForEdit(member.id);
    });
    
    tr.querySelector('.members-action-btn.delete').addEventListener('click', () => {
      confirmDeleteMember(member.id, member.name);
    });
    
    membersTbody.appendChild(tr);
  });
  
  membersLoading.style.display = 'none';
  membersListContainer.style.display = 'block';
}

// 4. 회원 등록/수정 모달 열기 (신규)
function openMemberFormForNew() {
  if (!memberBackdrop || !memberForm || !memberModalTitle || !inpMemberId) return;
  
  memberModalTitle.textContent = '신규 회원 등록';
  memberForm.reset();
  inpMemberId.value = '';
  
  // 등록일 기본값 오늘로 세팅
  if (inpMemberJoined) {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    inpMemberJoined.value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  }
  
  if (inpMemberGender) inpMemberGender.value = '남성';
  if (inpMemberAge) inpMemberAge.value = '';
  if (inpMemberIsAdult) inpMemberIsAdult.value = '성인';
  if (inpMemberStatus) inpMemberStatus.value = '등록';
  
  openModal(memberBackdrop);
}

// 5. 회원 등록/수정 모달 열기 (수정)
function openMemberFormForEdit(memberId) {
  if (!memberBackdrop || !memberModalTitle || !inpMemberId || !inpMemberName || !inpMemberPhone || !inpMemberJoined || !inpMemberGender || !inpMemberAge || !inpMemberIsAdult || !inpMemberStatus || !inpMemberMemo) return;
  
  const member = cachedMembers.find(m => m.id === memberId);
  if (!member) {
    alert('회원 정보를 찾을 수 없습니다.');
    return;
  }
  
  memberModalTitle.textContent = '회원 정보 수정';
  inpMemberId.value = member.id;
  inpMemberName.value = member.name;
  inpMemberPhone.value = member.phone;
  inpMemberJoined.value = member.joinedDate;
  inpMemberGender.value = member.gender || '남성';
  inpMemberAge.value = member.age || '';
  inpMemberIsAdult.value = member.isAdult || '성인';
  inpMemberStatus.value = member.status || '등록';
  inpMemberMemo.value = member.memo;
  
  openModal(memberBackdrop);
}

// 6. 회원 저장 (Create & Update)
async function saveMemberData(e) {
  e.preventDefault();
  
  if (!inpMemberName || !inpMemberPhone || !inpMemberJoined || !inpMemberGender || !inpMemberAge || !inpMemberIsAdult || !inpMemberStatus || !inpMemberMemo) return;
  
  const memberId = inpMemberId.value.trim();
  const memberName = inpMemberName.value.trim();
  const memberPhone = inpMemberPhone.value.trim();
  const memberJoined = inpMemberJoined.value.trim();
  const memberGender = inpMemberGender.value;
  const memberAge = inpMemberAge.value.trim();
  const memberIsAdult = inpMemberIsAdult.value;
  const memberStatus = inpMemberStatus.value;
  const memberMemo = inpMemberMemo.value.trim();
  
  if (!memberName) {
    alert('회원명을 입력해주세요.');
    return;
  }
  
  const spreadsheetId = CONFIG.getSpreadsheetId();
  closeModal(memberBackdrop);
  
  if (membersLoading) membersLoading.style.display = 'block';
  if (membersListContainer) membersListContainer.style.display = 'none';
  
  try {
    if (!memberId) {
      // 신규 등록 (Create)
      const newId = 'MEM-' + Date.now();
      const newRowValues = [[newId, memberName, memberGender, memberAge, memberIsAdult, memberPhone, memberJoined, memberMemo, memberStatus]];
      
      await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheetId,
        range: '회원목록!A1',
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: newRowValues
        }
      });
      console.log('신규 회원이 성공적으로 등록되었습니다.');
    } else {
      // 기존 수정 (Update)
      const member = cachedMembers.find(m => m.id === memberId);
      if (!member) {
        throw new Error('수정하려는 회원 데이터를 찾을 수 없습니다.');
      }
      
      const rowIndex = member.rowIndex;
      const updatedRowValues = [[memberId, memberName, memberGender, memberAge, memberIsAdult, memberPhone, memberJoined, memberMemo, memberStatus]];
      
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        range: `회원목록!A${rowIndex}:I${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: updatedRowValues
        }
      });
      console.log('회원 정보가 성공적으로 수정되었습니다.');
    }
    
    // 다시 로딩
    await loadMemberList();
  } catch (err) {
    console.error('Error saving member data:', err);
    alert('회원 정보를 저장하는 중 오류가 발생했습니다.');
    if (membersLoading) membersLoading.style.display = 'none';
    if (membersListContainer) membersListContainer.style.display = 'block';
  }
}

// 7. 회원 삭제 컨펌 및 수행 (Delete)
function confirmDeleteMember(memberId, memberName) {
  if (confirm(`"${memberName}" 회원을 정말로 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.`)) {
    executeDeleteMember(memberId);
  }
}

async function executeDeleteMember(memberId) {
  const member = cachedMembers.find(m => m.id === memberId);
  if (!member) {
    alert('삭제하려는 회원 데이터를 찾을 수 없습니다.');
    return;
  }
  
  const rowIndex = member.rowIndex;
  const spreadsheetId = CONFIG.getSpreadsheetId();
  
  if (membersLoading) membersLoading.style.display = 'block';
  if (membersListContainer) membersListContainer.style.display = 'none';
  
  try {
    // 1. '회원목록' 시트의 고유 sheetId를 알아냅니다.
    const spreadsheet = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId
    });
    const sheet = spreadsheet.result.sheets.find(s => s.properties.title === '회원목록');
    if (!sheet) {
      throw new Error("'회원목록' 시트를 찾을 수 없습니다.");
    }
    const sheetId = sheet.properties.sheetId;
    
    // 2. deleteDimension 요청을 통해 행을 도려냅니다.
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: spreadsheetId,
      resource: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex - 1, // 0-based index
                endIndex: rowIndex // exclusive
              }
            }
          }
        ]
      }
    });
    
    console.log(`행 ${rowIndex}가 성공적으로 삭제되었습니다.`);
    
    // 다시 로딩
    await loadMemberList();
  } catch (err) {
    console.error('Error deleting member:', err);
    alert('회원을 삭제하는 중 오류가 발생했습니다.');
    if (membersLoading) membersLoading.style.display = 'none';
    if (membersListContainer) membersListContainer.style.display = 'block';
  }
}

// HTML 이스케이프 헬퍼
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 8. 회원 관리 이벤트 바인딩
if (btnAddMember) {
  btnAddMember.addEventListener('click', openMemberFormForNew);
}
if (closeMemberBtn) {
  closeMemberBtn.addEventListener('click', () => closeModal(memberBackdrop));
}
if (btnCancelMember) {
  btnCancelMember.addEventListener('click', () => closeModal(memberBackdrop));
}
if (memberForm) {
  memberForm.addEventListener('submit', saveMemberData);
}
if (btnMemberFilter) {
  btnMemberFilter.addEventListener('click', renderMembersTable);
}
if (memberFilterInput) {
  memberFilterInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      renderMembersTable();
    }
  });
  memberFilterInput.addEventListener('input', renderMembersTable); // 실시간 필터링
}
if (btnMemberRefresh) {
  btnMemberRefresh.addEventListener('click', loadMemberList);
}

// =========================================================================
// 카카오톡 알림 메시지 생성기 로직
// =========================================================================

const DEFAULT_TEMPLATES = {
  'template-a': "안녕하세요, 수영장 헤엄하다입니다.\n예약 일정 안내드립니다.\n* {월}/{일}({요일}) {시간}시 ({회차})\n* 수업시작 15분 전까지 센터에 도착해주시기를 부탁드립니다.\n이전 타임 고객님이 {시간-1}시 50분 수업 종료 직후 샤워실을 사용하기에 그 전에 수영복으로 환복을 완료하셔야 수업시작 전에 수영장에 미리 들어가 계실 수 있습니다.\n* 수영장 앞에 주차하실 때는 앞에서부터 주차를 부탁드리고, 앞에 차가 있을 경우 가능한 앞차와 가깝게 주차해 주시기를 부탁드립니다.\n* 수업 취소 및 변경은, 수업 시각 기준으로 이틀 전까지 부탁드립니다. 그 이후에 취소 및 변경하실 경우 횟수를 차감하고 있으니 취소 및 변경은 미리 말씀 부탁드립니다. 소규모 예약제로 운영되는 시스템상 취소 발생 시 다른 수업으로 대체하기가 어려워 양해 부탁드립니다."
};

// 특정 회원의 가장 최근 과거 일정을 조회하여 회차 정보 + 1 계산
async function getNextSessionInfo(calendarId, memberName, targetDateStr) {
  try {
    const targetDate = new Date(targetDateStr);
    targetDate.setHours(0, 0, 0, 0); // 대상 날짜 자정 기준 이전 일정만
    
    // 이 회원 이름의 텍스트가 특수문자를 포함할 수 있으므로, 이름 부문만 한글/영문 추출
    const cleanNameMatch = memberName.match(/^([가-힣a-zA-Z0-9]+)/);
    const searchName = cleanNameMatch ? cleanNameMatch[1] : memberName;
    
    const response = await gapi.client.calendar.events.list({
      calendarId: calendarId,
      timeMax: targetDate.toISOString(),
      q: searchName,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100 // 최근 100개 일정 조회
    });
    
    const items = response.result.items || [];
    
    // 시작 시간 기준 역순 정렬 (최신 순)
    const sortedItems = items
      .filter(evt => {
        const summary = evt.summary || '';
        return summary.includes(searchName);
      })
      .sort((a, b) => {
        const aTime = new Date(a.start.dateTime || a.start.date).getTime();
        const bTime = new Date(b.start.dateTime || b.start.date).getTime();
        return bTime - aTime;
      });
      
    // 가장 최근 일정에서 회차 정보 매칭 및 + 1 계산
    for (const evt of sortedItems) {
      const summary = evt.summary || '';
      
      // X/Y회차 형식 매칭 (예: 5/10회차)
      const slashMatch = summary.match(/(\d+)\/(\d+)\s*회차/);
      if (slashMatch) {
        const current = parseInt(slashMatch[1], 10);
        const total = parseInt(slashMatch[2], 10);
        return `${current + 1}/${total}회차`;
      }
      
      // X회차 또는 X회 형식 매칭 (예: 5회차, 5회)
      const simpleMatch = summary.match(/(\d+)\s*(회차|회)/);
      if (simpleMatch) {
        const current = parseInt(simpleMatch[1], 10);
        return `${current + 1}회차`;
      }
    }
    
    return '';
  } catch (err) {
    console.warn(`[getNextSessionInfo] 이전 회차 정보 계산 실패 (${memberName}):`, err);
    return '';
  }
}

let notifierEvents = []; // 알림 생성 대상이 되는 내일의 일정 정보 목록
let lastSheetLoadFailed = false; // 스프레드시트 회원목록 로드 실패 캐싱

// 1. 알림 모달 열기 및 초기 설정
function openNotifierModal() {
  if (!notifierBackdrop || !notifierTargetDate || !notifierTemplateSelect || !notifierTemplateText) return;
  
  // 대상 수업 일자를 '내일' 날짜로 세팅
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const pad = (n) => String(n).padStart(2, '0');
  notifierTargetDate.value = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
  
  // 기본 템플릿(템플릿 A) 선택 및 문구 자동 로딩
  notifierTemplateSelect.value = 'template-a';
  notifierTemplateText.value = DEFAULT_TEMPLATES['template-a'];
  notifierTemplateText.disabled = false;
  
  openModal(notifierBackdrop);
  
  // 내일 일정 조회 및 메시지 빌드
  generateNotifications();
}

// 2. 템플릿 선택 변경 시 본문 반영
function handleTemplateSelectChange() {
  const selectedType = notifierTemplateSelect.value;
  if (selectedType === 'custom') {
    notifierTemplateText.disabled = false;
    notifierTemplateText.placeholder = "직접 알림 메시지 템플릿을 입력하세요. 치환자: {이름}, {날짜}, {시간}, {강사}";
  } else {
    notifierTemplateText.value = DEFAULT_TEMPLATES[selectedType] || '';
    notifierTemplateText.disabled = false;
  }
  renderNotifierMessages();
}

// 3. 구글 캘린더에서 대상 일자 수업 데이터 로딩
async function generateNotifications() {
  if (!notifierTargetDate || !notifierLoading || !notifierEmptyMsg || !notifierResultsContainer || !notifierListCount) return;
  
  const targetDateStr = notifierTargetDate.value;
  if (!targetDateStr) {
    alert('대상 수업 일자를 선택해 주세요.');
    return;
  }
  
  notifierLoading.style.display = 'block';
  notifierEmptyMsg.style.display = 'none';
  notifierResultsContainer.style.display = 'none';
  notifierListCount.textContent = '0';
  
  try {
    // 대상 날짜의 시작(00:00)과 끝(23:59:59) 타임스탬프 구하기
    const targetDate = new Date(targetDateStr);
    const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
    const end = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59);
    
    // 활성 캘린더 중 수업 일정 캘린더(summary가 **헤엄하다_ 로 시작하는 것)만 필터링
    const targetCalendarIds = Array.from(selectedCalendarIds).filter(calendarId => {
      const calMeta = allCalendars.find(c => c.id === calendarId);
      return calMeta && calMeta.summary && calMeta.summary.startsWith('**헤엄하다_');
    });
    
    if (targetCalendarIds.length === 0) {
      notifierLoading.style.display = 'none';
      notifierEmptyMsg.style.display = 'block';
      notifierEmptyMsg.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="font-size: 1.5rem; margin-bottom: 8px; display: block; color: var(--color-primary);"></i>수업 일정 캘린더 강사를 캘린더 목록에서 최소 하나 체크해 주세요.';
      return;
    }
    
    // 스프레드시트 회원 DB가 로드되지 않았다면 로드
    if (cachedMembers.length === 0) {
      try {
        const spreadsheetId = CONFIG.getSpreadsheetId();
        if (spreadsheetId) {
          const sheetResp = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: '회원목록!A2:I1000'
          });
          const rows = sheetResp.result.values || [];
          cachedMembers = rows.map((row, index) => {
            return {
              rowIndex: index + 2,
              id: row[0] || '',
              name: row[1] || '',
              gender: row[2] || '',
              age: row[3] || '',
              isAdult: row[4] || '',
              phone: row[5] || '',
              joinedDate: row[6] || '',
              memo: row[7] || '',
              status: row[8] || ''
            };
          }).filter(m => m.id !== '');
          lastSheetLoadFailed = false; // 성공 시 플래그 초기화
        }
      } catch (sheetErr) {
        console.warn('알림 생성용 회원 목록 로드 중 에러 무시:', sheetErr);
        lastSheetLoadFailed = true; // 실패 시 플래그 설정
      }
    } else {
      lastSheetLoadFailed = false; // 이미 캐싱된 데이터가 있으면 에러 없음
    }
    
    // 각 활성 캘린더별 일정을 병렬로 가져옵니다.
    const promises = targetCalendarIds.map(async (calendarId) => {
      const calMeta = allCalendars.find(c => c.id === calendarId);
      const coachName = calMeta ? calMeta.summary || '' : '';
      
      const response = await gapi.client.calendar.events.list({
        calendarId: calendarId,
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
      
      const items = response.result.items || [];
      return items.map(evt => {
        return {
          event: evt,
          coachName: coachName,
          calendarId: calendarId
        };
      });
    });
    
    const results = await Promise.all(promises);
    const flatEvents = results.flat();
    
    const eventPromises = flatEvents.map(async (item) => {
      const evt = item.event;
      let memberName = '';
      const summary = evt.summary || '';
      
      // 대괄호로 둘러싸인 구분 기호 파싱 (예: [초급] 홍길동 => 홍길동)
      const bracketMatch = summary.match(/\[.*?\]\s*(.*)/);
      if (bracketMatch) {
        memberName = bracketMatch[1].trim();
      } else {
        memberName = summary.trim();
      }
      
      // 하이픈(-) 이후 회차 정보 등 제거하여 순수 회원명 추출 (예: 이서호(남,8) - 5/10회차 => 이서호(남,8))
      if (memberName.includes('-')) {
        memberName = memberName.split('-')[0].trim();
      }
      
      // 1. 내일 일정 자체에서 회차 정보 파싱 시도 (X/Y회차 or X회차/X회)
      let sessionInfo = '';
      const slashMatch = summary.match(/(\d+\/\d+\s*회차)/);
      if (slashMatch) {
        sessionInfo = slashMatch[1];
      } else {
        const simpleMatch = summary.match(/(\d+회차|\d+회)/);
        if (simpleMatch) {
          sessionInfo = simpleMatch[1];
        }
      }
      
      // 2. 내일 일정 자체에 회차 정보가 없거나, '회차' 형식이 맞지 않다면, 최근 과거 일정 + 1 계산
      if (!sessionInfo) {
        sessionInfo = await getNextSessionInfo(item.calendarId, memberName, targetDateStr);
      }
      
      // 3. 그래도 최종 정보가 없으면 기본값
      if (!sessionInfo) {
        sessionInfo = '회차 정보 없음';
      }
      
      // 시작 시간 구하기
      const startDateTime = evt.start.dateTime || evt.start.date;
      const startTimeObj = new Date(startDateTime);
      const pad = (n) => String(n).padStart(2, '0');
      const timeStr = `${pad(startTimeObj.getHours())}:${pad(startTimeObj.getMinutes())}`;
      
      // 회원 연락처 매핑 (순수 회원명 기준)
      const matchedMember = cachedMembers.find(m => m.name === memberName);
      const phoneNum = matchedMember ? matchedMember.phone : '연락처 미등록';
      
      return {
        id: evt.id,
        name: memberName,
        phone: phoneNum,
        time: timeStr,
        date: targetDateStr,
        session: sessionInfo,
        coach: item.coachName
      };
    });
    
    notifierEvents = await Promise.all(eventPromises);
    
    // 시간 순 정렬
    notifierEvents.sort((a, b) => a.time.localeCompare(b.time));
    
    renderNotifierMessages();
  } catch (err) {
    console.error('Error generating notification list:', err);
    alert('알림 대상 일정을 가져오는 중 오류가 발생했습니다.');
    notifierLoading.style.display = 'none';
  }
}

// 4. 생성된 데이터를 화면에 카드 목록으로 바인딩
function renderNotifierMessages() {
  if (!notifierLoading || !notifierEmptyMsg || !notifierResultsContainer || !notifierListCount || !notifierTemplateText) return;
  
  notifierResultsContainer.innerHTML = '';
  
  // 구글 시트 로드 실패 시 경고 배너 띄우기
  if (lastSheetLoadFailed) {
    const warnBanner = document.createElement('div');
    warnBanner.style.cssText = 'background-color: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; padding: 12px; border-radius: var(--radius-md); font-size: 0.78rem; line-height: 1.4; display: flex; align-items: flex-start; gap: 8px; margin-bottom: 12px; grid-column: 1 / -1;';
    warnBanner.innerHTML = `
      <i class="fa-solid fa-triangle-exclamation" style="margin-top: 2px; color: #ef4444;"></i>
      <div>
        <strong style="font-weight: 700;">구글 시트 회원목록 로드 실패 (403 권한 에러):</strong><br>
        현재 로그인된 구글 계정이 설정된 스프레드시트에 대한 접근 권한이 없습니다.<br>
        구글 시트 우측 상단의 <strong>[공유]</strong> 버튼을 눌러 <strong>process0823@gmail.com</strong> 계정에 뷰어 또는 편집자 권한을 추가해 주세요.<br>
        <span style="color: #6b7280; font-size: 0.72rem;">(권한을 추가하기 전까지는 연락처가 '연락처 미등록'으로 표시됩니다.)</span>
      </div>
    `;
    notifierResultsContainer.appendChild(warnBanner);
  }
  
  if (notifierEvents.length === 0) {
    notifierLoading.style.display = 'none';
    notifierEmptyMsg.style.display = 'block';
    return;
  }
  
  notifierListCount.textContent = notifierEvents.length;
  const templateRaw = notifierTemplateText.value;
  
  // 날짜 한글 요일 포맷팅 (예: 2026-06-27 -> 6월 27일 토요일)
  const targetDateStr = notifierTargetDate.value;
  let formattedDate = targetDateStr;
  if (targetDateStr) {
    const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const d = new Date(targetDateStr);
    formattedDate = `${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}`;
  }
  
  notifierEvents.forEach(item => {
    // 날짜 파싱 (월, 일, 요일 추출)
    const d = new Date(item.date);
    const monthVal = d.getMonth() + 1;
    const dateVal = d.getDate();
    const weekDays = ['일', '월', '화', '수', '목', '금', '토'];
    const dayVal = weekDays[d.getDay()];
    
    // 시간 정보 파싱
    const hourVal = parseInt(item.time.split(':')[0], 10);
    const prevHourVal = hourVal - 1;
    
    // 회차 정보
    const sessionVal = item.session || '회차 정보 없음';

    // 템플릿 치환
    let messageText = templateRaw
      .replace(/{이름}/g, item.name)
      .replace(/{날짜}/g, formattedDate)
      .replace(/{월}/g, monthVal)
      .replace(/{일}/g, dateVal)
      .replace(/{요일}/g, dayVal)
      .replace(/{시간}/g, hourVal)
      .replace(/{시간-1}/g, prevHourVal)
      .replace(/{회차}/g, sessionVal)
      .replace(/{강사}/g, item.coach);
      
    const card = document.createElement('div');
    card.className = 'notifier-card';
    
    card.innerHTML = `
      <div class="notifier-card-header">
        <span class="notifier-card-title">
          <i class="fa-solid fa-user" style="color: var(--color-primary);"></i> ${escapeHtml(item.name)} 
          <span style="font-size:0.75rem; font-weight:normal; color:var(--text-muted);">(${escapeHtml(item.time)})</span>
        </span>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="notifier-card-phone"><i class="fa-solid fa-phone"></i> ${escapeHtml(item.phone)}</span>
          <button class="notifier-copy-btn" title="클립보드 복사">
            <i class="fa-solid fa-copy"></i> 복사하기
          </button>
        </div>
      </div>
      <div class="notifier-card-body">${escapeHtml(messageText)}</div>
    `;
    
    // 개별 복사 버튼 리스너 바인딩
    const copyBtn = card.querySelector('.notifier-copy-btn');
    copyBtn.addEventListener('click', () => {
      copyNotifierToClipboard(messageText, copyBtn);
    });
    
    notifierResultsContainer.appendChild(card);
  });
  
  notifierLoading.style.display = 'none';
  notifierResultsContainer.style.display = 'flex';
}

// 5. 클립보드 복사 및 토스트 배너 피드백
function copyNotifierToClipboard(text, btnElement) {
  navigator.clipboard.writeText(text).then(() => {
    // 버튼 스타일 임시 피드백
    const origHtml = btnElement.innerHTML;
    btnElement.innerHTML = '<i class="fa-solid fa-check"></i> 복사 완료!';
    btnElement.classList.add('copied');
    
    // 토스트 배너 팝업 띄우기
    showToastNotification('알림 메시지가 클립보드에 복사되었습니다.');
    
    setTimeout(() => {
      btnElement.innerHTML = origHtml;
      btnElement.classList.remove('copied');
    }, 2000);
  }).catch(err => {
    console.error('클립보드 복사 실패:', err);
    alert('메시지 복사에 실패했습니다. 수동으로 복사해 주세요.');
  });
}

// 토스트 배너 생성 헬퍼
function showToastNotification(message) {
  let toast = document.querySelector('.notifier-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'notifier-toast';
    toast.innerHTML = `<i class="fa-solid fa-check-circle" style="color:var(--color-secondary); font-size:1.1rem;"></i> <span></span>`;
    document.body.appendChild(toast);
  }
  
  toast.querySelector('span').textContent = message;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// ==========================================
// 📅 삭제된 일정 구글 스프레드시트 로깅 및 팝업 연동 기능
// ==========================================

// 1. 스프레드시트로부터 삭제된 일정 로드
async function fetchDeletedEvents() {
  const spreadsheetId = CONFIG.getSpreadsheetId();
  if (!spreadsheetId) {
    console.warn('스프레드시트 ID가 비어있어 삭제된 일정을 가져올 수 없습니다.');
    return [];
  }
  
  try {
    // 스프레드시트 구조 조회하여 '삭제된일정' 시트 존재 여부 및 첫 번째 시트 이름 파악
    const metadata = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId
    });
    const sheets = metadata.result.sheets || [];
    const sheetTitles = sheets.map(s => s.properties.title);
    
    let targetSheetName = '삭제된일정';
    
    // 만약 '삭제된일정' 시트가 없고 '시트1'이나 'Sheet1'이 첫 번째 시트라면 자동 변경 시도 또는 생성
    if (!sheetTitles.includes('삭제된일정')) {
      const firstSheet = sheets[0];
      const firstSheetTitle = firstSheet ? firstSheet.properties.title : '시트1';
      if (firstSheetTitle === '시트1' || firstSheetTitle === 'Sheet1') {
        console.log(`기본 시트명 '${firstSheetTitle}'을 '삭제된일정'으로 변경합니다.`);
        await gapi.client.sheets.spreadsheets.batchUpdate({
          spreadsheetId: spreadsheetId,
          resource: {
            requests: [{
              updateSheetProperties: {
                properties: {
                  sheetId: firstSheet.properties.sheetId,
                  title: '삭제된일정'
                },
                fields: 'title'
              }
            }]
          }
        });
      } else {
        console.log("'삭제된일정' 시트를 새로 생성합니다.");
        await gapi.client.sheets.spreadsheets.batchUpdate({
          spreadsheetId: spreadsheetId,
          resource: {
            requests: [{
              addSheet: {
                properties: { title: '삭제된일정' }
              }
            }]
          }
        });
      }
    }
    
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: `${targetSheetName}!A1:I` // 헤더 포함 전체 데이터 가져오기
    });
    
    const rows = response.result.values || [];
    
    // 만약 완전히 비어있거나 첫 번째 행이 헤더 형태가 아니면 헤더 초기화 진행
    if (rows.length === 0 || rows[0][0] !== '삭제 일시') {
      console.log('스프레드시트에 헤더가 존재하지 않거나 비어 있어 초기화를 진행합니다.');
      
      // 이미 첫 줄에 잘못 들어간 데이터가 있다면 A2 행으로 이동시켜서 보존
      if (rows.length > 0 && rows[0][0] !== '삭제 일시') {
        await gapi.client.sheets.spreadsheets.values.append({
          spreadsheetId: spreadsheetId,
          range: `${targetSheetName}!A:I`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [rows[0]] }
        });
        console.log('기존에 1행에 들어있던 일정을 2행 이후로 안전하게 이동시켰습니다.');
      }
      
      await initializeSpreadsheetHeaders(spreadsheetId, targetSheetName);
      
      // 방금 헤더를 생성했고 캐시는 없으므로 빈 리스트 리턴
      deletedEventsCache = [];
      deletedEventsMap = {};
      return [];
    }
    
    // 첫 행(헤더)을 제외하고 데이터 매핑
    const dataRows = rows.slice(1);
    deletedEventsCache = dataRows.map(row => ({
      deletedAt: row[0] || '',
      calendarId: row[1] || '',
      calendarName: row[2] || '',
      eventId: row[3] || '',
      eventTitle: row[4] || '',
      originalStart: row[5] || '',
      originalEnd: row[6] || '',
      memberName: row[7] || '',
      coachName: row[8] || ''
    }));
    
    // 날짜별 빠른 조회를 위한 해시맵 인덱스 구축 (O(1) 성능 최적화)
    deletedEventsMap = {};
    deletedEventsCache.forEach(item => {
      if (item.originalStart) {
        const dateKey = item.originalStart.split(' ')[0]; // 'YYYY-MM-DD' 추출
        if (!deletedEventsMap[dateKey]) {
          deletedEventsMap[dateKey] = [];
        }
        deletedEventsMap[dateKey].push(item);
      }
    });
    
    console.log('스프레드시트로부터 로드된 삭제 일정 개수:', deletedEventsCache.length);
    return deletedEventsCache;
  } catch (err) {
    console.error('삭제 목록 로드 중 오류 발생:', err);
    deletedEventsCache = [];
    deletedEventsMap = {};
    return [];
  }
}

// 2. 스프레드시트 초기 헤더 생성 헬퍼
async function initializeSpreadsheetHeaders(spreadsheetId, sheetName = '삭제된일정') {
  const headers = [[
    '삭제 일시',
    '캘린더 ID',
    '캘린더명',
    '일정 ID',
    '일정명',
    '원래 수업 시작',
    '원래 수업 종료',
    '회원명',
    '강사명'
  ]];
  
  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: spreadsheetId,
    range: `${sheetName}!A1:I1`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: headers }
  });
  console.log(`스프레드시트 헤더(${sheetName}!A1:I1)가 성공적으로 초기화되었습니다.`);
}

// 3. 일정을 실제 지우기 전 스프레드시트에 내역 누적 기록
async function logDeletedEventToSpreadsheet({
  deletedAt,
  calendarId,
  calendarName,
  eventId,
  eventTitle,
  originalStart,
  originalEnd,
  memberName,
  coachName
}) {
  const spreadsheetId = CONFIG.getSpreadsheetId();
  if (!spreadsheetId) {
    console.warn('스프레드시트 ID가 없어 로그 저장을 생략합니다.');
    return;
  }
  
  try {
    const values = [[
      deletedAt,
      calendarId,
      calendarName,
      eventId,
      eventTitle,
      originalStart,
      originalEnd,
      memberName,
      coachName
    ]];
    
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: spreadsheetId,
      range: '삭제된일정!A:I',
      valueInputOption: 'USER_ENTERED',
      resource: { values: values }
    });
    console.log('스프레드시트에 삭제 일정 기록 성공:', eventTitle);
  } catch (err) {
    console.error('스프레드시트에 삭제 일정 로깅 실패:', err);
    alert('삭제 로그를 기록하는 데 실패했으나 일정 삭제 작업은 계속 진행됩니다.');
  }
}

// 4. 날짜별 삭제 일정 조회 팝업(모달) 오픈
function showDeletedEventsPopup(dateStr) {
  console.log(`[Popup Debug] showDeletedEventsPopup called with dateStr: "${dateStr}"`);
  
  const backdrop = document.getElementById('deleted-events-backdrop');
  const dateSpan = document.getElementById('deleted-events-modal-date');
  const container = document.getElementById('deleted-events-list-container');
  
  console.log('[Popup Debug] DOM Element status:', {
    backdrop: !!backdrop,
    dateSpan: !!dateSpan,
    container: !!container
  });
  
  if (!backdrop || !container) {
    console.error('[Popup Debug] Error: backdrop or container is missing from the DOM!');
    return;
  }
  
  if (dateSpan) dateSpan.textContent = dateStr;
  container.innerHTML = '';
  
  console.log(`[Popup Debug] Total deleted events in cache: ${deletedEventsCache.length}`);
  
  // YYYY-MM-DD 형식으로 원래 시작 날짜가 일치하는 취소 건 필터링
  const matches = deletedEventsCache.filter(e => {
    const isMatch = e.originalStart.startsWith(dateStr);
    console.log(`[Popup Debug] Filtering: comparing event "${e.eventTitle}" originalStart "${e.originalStart}" with "${dateStr}" -> match: ${isMatch}`);
    return isMatch;
  });
  
  console.log(`[Popup Debug] Found ${matches.length} matching deleted events for date: ${dateStr}`);
  
  if (matches.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.85rem;">해당 날짜에 삭제된 일정이 없습니다.</div>`;
  } else {
    // 삭제 시각 역순 정렬 (최근 삭제가 위로 오도록)
    matches.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
    
    matches.forEach(item => {
      // 본래 수업 시간 포맷 가공 (시간 파트만 추출)
      const getTime = (dateStr) => {
        try {
          const parts = dateStr.split(' ');
          if (parts.length >= 2) return parts[1].substring(0, 5); // HH:mm
          return dateStr;
        } catch {
          return dateStr;
        }
      };
      
      const timeRange = `${getTime(item.originalStart)} ~ ${getTime(item.originalEnd)}`;
      
      const card = document.createElement('div');
      card.className = 'deleted-event-card';
      card.style.cssText = 'background: #f8fafc; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 12px 14px; display: flex; flex-direction: column; gap: 6px;';
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--border-color); padding-bottom: 6px; margin-bottom: 4px;">
          <span style="font-weight: 700; color: var(--text-main); font-size: 0.88rem;">${item.eventTitle}</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.8rem; color: var(--text-muted);">
          <div><strong style="color: var(--text-main);">시간:</strong> ${timeRange}</div>
          <div><strong style="color: var(--text-main);">강사:</strong> ${item.coachName || '미지정'}</div>
          <div><strong style="color: var(--text-main);">회원:</strong> ${item.memberName || '미지정'}</div>
          <div style="grid-column: span 2; font-size: 0.75rem; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;"><strong style="color: var(--text-main);">캘린더:</strong> ${item.calendarName}</div>
          <div style="grid-column: span 2; font-size: 0.78rem; border-top: 1px dashed #e2e8f0; padding-top: 4px; margin-top: 2px; color: #ef4444;"><strong style="color: var(--text-main);">삭제 일시:</strong> ${item.deletedAt}</div>
        </div>
      `;
      container.appendChild(card);
    });
  }
  
  openModal(backdrop);
}

// 5. 모달 닫기 버튼 이벤트 리스너 바인딩
const deletedEventsBackdrop = document.getElementById('deleted-events-backdrop');
const closeDeletedEventsBtn = document.getElementById('close-deleted-events-btn');
const btnCloseDeletedEvents = document.getElementById('btn-close-deleted-events');

if (closeDeletedEventsBtn) {
  closeDeletedEventsBtn.addEventListener('click', () => closeModal(deletedEventsBackdrop));
}
if (btnCloseDeletedEvents) {
  btnCloseDeletedEvents.addEventListener('click', () => closeModal(deletedEventsBackdrop));
}


// ==========================================
// 🎨 캘린더 커스텀 색상 구글 스프레드시트 동기화 기능
// ==========================================

let spreadsheetColorsCache = {}; // 구글 시트에서 가져온 색상 캐시

// 1. 색상 설정용 시트 체크 및 생성 (삭제 로그용 스프레드시트 17Qe4GjnKHiV6DkbtPht06QnGyWkyPT4_Q466INd8h9c 공유 사용)
async function checkOrCreateColorSheet() {
  const spreadsheetId = CONFIG.getSpreadsheetId();
  if (!spreadsheetId) return;

  try {
    const response = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId
    });
    
    const sheets = response.result.sheets || [];
    const hasColorSheet = sheets.some(s => s.properties.title === '캘린더색상');
    
    if (!hasColorSheet) {
      console.log("'캘린더색상' 시트가 존재하지 않습니다. 새로 생성합니다.");
      await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheetId,
        resource: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: '캘린더색상'
                }
              }
            }
          ]
        }
      });
      
      // 헤더 추가
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        range: '캘린더색상!A1:D1',
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [['캘린더 ID', '지정 색상', '캘린더명', '최종 변경일']]
        }
      });
      console.log("'캘린더색상' 시트 및 헤더 생성이 완료되었습니다.");
    }
  } catch (err) {
    console.error('Error checking or creating calendar color sheet:', err);
  }
}

// 2. 시트로부터 색상 데이터 로드
async function loadCalendarColorsFromSheet() {
  const spreadsheetId = CONFIG.getSpreadsheetId();
  if (!spreadsheetId) {
    console.warn('스프레드시트 ID가 비어있어 커스텀 색상을 가져올 수 없습니다.');
    return {};
  }

  try {
    await checkOrCreateColorSheet();
    
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: '캘린더색상!A2:D100'
    });
    
    const rows = response.result.values || [];
    spreadsheetColorsCache = {};
    rows.forEach(row => {
      const calId = row[0];
      const color = row[1];
      if (calId && color) {
        spreadsheetColorsCache[calId] = color;
      }
    });
    
    console.log('스프레드시트에서 로드한 캘린더 커스텀 색상 개수:', Object.keys(spreadsheetColorsCache).length);
    return spreadsheetColorsCache;
  } catch (err) {
    console.error('스프레드시트 캘린더 색상 데이터 조회 실패:', err);
    return {};
  }
}

// 3. 시트에 색상 업데이트 또는 추가
async function saveCalendarColorToSheet(calId, color, calName) {
  const spreadsheetId = CONFIG.getSpreadsheetId();
  if (!spreadsheetId) {
    console.warn('스프레드시트 ID가 없어 구글 시트 색상 저장을 생략합니다.');
    return;
  }

  try {
    // 1. 현재 색상 시트에서 캘린더 ID 중복 행이 있는지 검사
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: '캘린더색상!A2:A100'
    });
    
    const rows = response.result.values || [];
    let existingRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === calId) {
        existingRowIndex = i + 2; // 2부터 시작하는 실제 행 번호 (A2는 2행)
        break;
      }
    }
    
    const updateTime = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const rowValues = [[calId, color, calName, updateTime]];
    
    if (existingRowIndex !== -1) {
      // 2-A. 기존 행 덮어쓰기 업데이트
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        range: `캘린더색상!A${existingRowIndex}:D${existingRowIndex}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: rowValues
        }
      });
      console.log(`구글 시트 캘린더 색상 업데이트 성공 (${calName} - ${color}) 행: ${existingRowIndex}`);
    } else {
      // 2-B. 새 행으로 데이터 추가
      await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheetId,
        range: '캘린더색상!A:D',
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: rowValues
        }
      });
      console.log(`구글 시트 신규 캘린더 색상 추가 성공 (${calName} - ${color})`);
    }
    
    // 로컬 메모리 캐시 동기화
    spreadsheetColorsCache[calId] = color;
  } catch (err) {
    console.error('구글 시트 색상 저장 실패:', err);
  }
}


