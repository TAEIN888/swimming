// Google Calendar 및 OAuth 설정 관리
export const CONFIG = {
  getClientId: () => localStorage.getItem('G_CLIENT_ID') || '',
  getApiKey: () => localStorage.getItem('G_API_KEY') || '',
  getCalendarId: () => localStorage.getItem('G_CALENDAR_ID') || 'primary',
  DISCOVERY_DOCS: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"],
  SCOPES: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email",
  
  // 접근 허용할 구글 이메일 목록
  getWhitelist: () => {
    const list = localStorage.getItem('G_WHITELIST_EMAILS');
    return list ? JSON.parse(list) : [];
  }
};

export function saveConfig({ clientId, apiKey, calendarId, whitelistEmails }) {
  if (clientId !== undefined) localStorage.setItem('G_CLIENT_ID', clientId.trim());
  if (apiKey !== undefined) localStorage.setItem('G_API_KEY', apiKey.trim());
  if (calendarId !== undefined) localStorage.setItem('G_CALENDAR_ID', calendarId.trim() || 'primary');
  if (whitelistEmails !== undefined) {
    const emailList = whitelistEmails
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(e => e.length > 0);
    localStorage.setItem('G_WHITELIST_EMAILS', JSON.stringify(emailList));
  }
}
