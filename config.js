// Google Calendar 및 OAuth 설정 관리
export const secrets = { 
  clientId: '', 
  apiKey: '', 
  calendarId: 'heumhadas@gmail.com',
  spreadsheetId: '17Qe4GjnKHiV6DkbtPht06QnGyWkyPT4_Q466INd8h9c'
};

export async function loadSecrets() {
  // 로컬 개발 환경(localhost, 127.0.0.1 등)에서만 secrets.json 로드를 시도하여 운영 서버 콘솔에 404 빨간 에러가 표시되는 것을 방지합니다.
  const isLocal = window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1' || 
                  window.location.hostname.startsWith('192.168.');
                  
  if (!isLocal) {
    console.log('운영 환경(GitHub Pages)이므로 secrets.json 로드를 건너뛰고 브라우저 설정(localStorage)을 사용합니다.');
    return;
  }

  try {
    const response = await fetch('./secrets.json');
    if (response.ok) {
      const data = await response.json();
      Object.assign(secrets, data);
      console.log('로컬 secrets.json 설정을 성공적으로 로드했습니다.');
    }
  } catch (err) {
    console.log('로컬 secrets.json 파일이 없습니다. 수동 설정을 사용합니다.');
  }
}

export const CONFIG = {
  getClientId: () => localStorage.getItem('G_CLIENT_ID') || secrets.clientId || '',
  getApiKey: () => localStorage.getItem('G_API_KEY') || secrets.apiKey || '',
  getCalendarId: () => localStorage.getItem('G_CALENDAR_ID') || secrets.calendarId || 'heumhadas@gmail.com',
  getSpreadsheetId: () => '17Qe4GjnKHiV6DkbtPht06QnGyWkyPT4_Q466INd8h9c',
  DISCOVERY_DOCS: [
    "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest",
    "https://sheets.googleapis.com/$discovery/rest?version=v4"
  ],
  SCOPES: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email",
  
  // 접근 허용할 구글 이메일 목록
  getWhitelist: () => {
    const list = localStorage.getItem('G_WHITELIST_EMAILS');
    return list ? JSON.parse(list) : [];
  }
};

export function saveConfig({ clientId, apiKey, calendarId, spreadsheetId, whitelistEmails }) {
  if (clientId !== undefined) localStorage.setItem('G_CLIENT_ID', clientId.trim());
  if (apiKey !== undefined) localStorage.setItem('G_API_KEY', apiKey.trim());
  if (calendarId !== undefined) localStorage.setItem('G_CALENDAR_ID', calendarId.trim() || 'heumhadas@gmail.com');
  // Spreadsheet ID는 '17Qe4GjnKHiV6DkbtPht06QnGyWkyPT4_Q466INd8h9c'로 영구 고정되어 저장하지 않음
  if (whitelistEmails !== undefined) {
    const emailList = whitelistEmails
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(e => e.length > 0);
    localStorage.setItem('G_WHITELIST_EMAILS', JSON.stringify(emailList));
  }
}
