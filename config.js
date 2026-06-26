// Google Calendar 및 OAuth 설정 관리
export const secrets = { 
  clientId: '', 
  apiKey: '', 
  calendarId: 'heumhadas@gmail.com',
  spreadsheetId: '1De1s-wA4vDF3AP-GOpkDWRHa1bhcCY66lWsTnncq9rc'
};

export async function loadSecrets() {
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
  getSpreadsheetId: () => localStorage.getItem('G_SPREADSHEET_ID') || secrets.spreadsheetId || '1De1s-wA4vDF3AP-GOpkDWRHa1bhcCY66lWsTnncq9rc',
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
  if (spreadsheetId !== undefined) localStorage.setItem('G_SPREADSHEET_ID', spreadsheetId.trim() || '1De1s-wA4vDF3AP-GOpkDWRHa1bhcCY66lWsTnncq9rc');
  if (whitelistEmails !== undefined) {
    const emailList = whitelistEmails
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(e => e.length > 0);
    localStorage.setItem('G_WHITELIST_EMAILS', JSON.stringify(emailList));
  }
}
