// 공개 미디어 업로더 — qrcoding /v1/uploads에서 서명 URL을 받아 스토리지에 직접 PUT.
// Instagram Graph API처럼 '공개 URL만 받는' 발행 대상 전용이며, 바이너리는 서버를
// 거치지 않는다. 인증 키는 설정 → 렌더의 QR Agent Studio(qrcoding) 폼을 재사용한다.
const fs = require('fs');
const path = require('path');
const secrets = require('./secrets');

const DEFAULT_BASE = 'https://qrcoding-skill-mcp.vercel.app';
const CT_BY_EXT = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4',
};

function contentTypeOf(p) {
  return CT_BY_EXT[path.extname(String(p || '')).toLowerCase()] || null;
}

// 업로드 API 베이스 — apiUrl 필드가 있으면 그것, 없으면 MCP URL에서 /mcp를 떼서 유추
function apiBase() {
  const c = secrets.get('qrcoding');
  const base = c.apiUrl || String(c.url || '').replace(/\/mcp\/?$/, '') || DEFAULT_BASE;
  return String(base).replace(/\/$/, '');
}

async function uploadPublic(absPath) {
  const c = secrets.get('qrcoding');
  if (!c.apiKey) return { ok: false, error: 'qrcoding API 키가 없습니다 — 설정 → 렌더의 QR Agent Studio 폼에 저장하세요' };
  const contentType = contentTypeOf(absPath);
  if (!contentType) return { ok: false, error: '지원하지 않는 파일 형식: ' + path.extname(String(absPath)) };
  let buf;
  try { buf = fs.readFileSync(absPath); } catch { return { ok: false, error: '파일을 읽지 못했습니다: ' + absPath }; }

  const signRes = await fetch(apiBase() + '/v1/uploads', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': c.apiKey },
    body: JSON.stringify({ filename: path.basename(String(absPath)), contentType }),
  });
  const sign = await signRes.json().catch(() => null);
  if (signRes.status === 501) return { ok: false, error: '서버에 업로드 스토리지가 설정되지 않았습니다 (qrcoding의 Supabase env 필요)' };
  if (signRes.status === 404) return { ok: false, error: '업로드 API를 찾지 못했습니다 — 설정의 qrcoding 서비스 URL(apiUrl)이 /v1/uploads를 제공하는 배포인지 확인하세요' };
  if (!signRes.ok || !sign || !sign.uploadUrl) {
    return { ok: false, error: (sign && (sign.message || sign.code)) || `업로드 서명 실패 HTTP ${signRes.status}` };
  }
  if (sign.maxBytes && buf.length > sign.maxBytes) {
    return { ok: false, error: `파일이 큽니다 (${(buf.length / 1e6).toFixed(1)}MB > ${Math.round(sign.maxBytes / 1e6)}MB)` };
  }
  const put = await fetch(sign.uploadUrl, { method: 'PUT', headers: { 'content-type': contentType }, body: buf });
  if (!put.ok) return { ok: false, error: `스토리지 업로드 실패 HTTP ${put.status}` };
  return { ok: true, url: sign.publicUrl };
}

module.exports = { uploadPublic, contentTypeOf, _apiBase: apiBase };
