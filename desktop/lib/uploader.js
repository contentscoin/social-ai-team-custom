// 공개 미디어 호스트 — 로컬 파일을 "인터넷에서 열리는 URL"로 만든다.
// 왜 필요한가: Instagram/Threads Graph API는 바이너리 업로드를 받지 않고 공개 URL만 받는다
// (Meta의 제약). 그래서 발행 전에 이미지를 어딘가에 올려 URL을 확보해야 한다.
//
// 프로바이더 레인 (render.js의 이미지 엔진과 같은 패턴):
//   s3       — S3 호환 스토리지(Cloudflare R2 · Supabase · AWS S3 · MinIO). 기본·권장.
//              내 버킷이라 남의 서비스 배포 상태에 발행이 묶이지 않는다. SigV4 직접 서명(무의존).
//              R2/Supabase 무료 티어로 충분(R2는 전송료 0) — 사실상 무료 경로는 여기다.
//   imgbb    — 간편 이미지 호스트(이미지 전용, 영상 불가). 주의: API 접근·직링크가 유료 플랜
//              기능이라 무료 계정으로는 발행에 못 쓸 수 있다(IG가 직접 가져갈 URL이 필요).
//   qrcoding — 구버전 경로(하위호환). QR 서비스가 파일 저장소를 겸하던 결합 — 신규 권장하지 않음.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const secrets = require('./secrets');

const DEFAULT_QR_BASE = 'https://qrcoding-skill-mcp.vercel.app';
const CT_BY_EXT = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4',
};
function contentTypeOf(p) {
  return CT_BY_EXT[path.extname(String(p || '')).toLowerCase()] || null;
}

// ---- 프로바이더 선택 ------------------------------------------------------------------
// 명시 설정(imagehost.provider) 우선, 없으면 설정된 것 중 s3 → imgbb → qrcoding 순.
function s3Ready() { return secrets.has('imagehost', ['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey']); }
function imgbbReady() { return !!(secrets.get('imagehost') || {}).imgbbKey; }
function qrReady() { return secrets.has('qrcoding', ['apiKey']); }
function activeProvider() {
  const p = String((secrets.get('imagehost') || {}).provider || '').trim();
  if (p === 's3' && s3Ready()) return 's3';
  if (p === 'imgbb' && imgbbReady()) return 'imgbb';
  if (p === 'qrcoding' && qrReady()) return 'qrcoding';
  if (s3Ready()) return 's3';
  if (imgbbReady()) return 'imgbb';
  if (qrReady()) return 'qrcoding';
  return null;
}
// 공개 URL을 만들 수단이 하나라도 있는가 — 인스타 연결 배지가 이 신호를 쓴다.
function hostReady() { return !!activeProvider(); }
const LABEL = { s3: 'S3 호환 스토리지', imgbb: 'imgbb', qrcoding: 'qrcoding(구버전)' };
function hostStatus() {
  const p = activeProvider();
  return { ready: !!p, provider: p, label: p ? LABEL[p] : '', video: p === 's3' || p === 'qrcoding' };
}

// ---- S3 호환 (AWS Signature V4) --------------------------------------------------------
const sha256hex = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (key, str) => crypto.createHmac('sha256', key).update(str, 'utf8').digest();

// 오브젝트 키 — 안전 문자만 남긴다(퍼센트 인코딩 지뢰 회피: 카노니컬 경로를 그대로 쓸 수 있다).
function safeKey(filename, stamp) {
  const base = String(filename || 'file').replace(/[^A-Za-z0-9._-]/g, '-').replace(/-+/g, '-').slice(-80);
  return `${String(stamp).slice(0, 8)}/${String(stamp).slice(9, 15)}-${base}`;
}

// PUT 요청의 SigV4 서명 헤더 — 순수 함수(now 주입 가능 → 테스트에서 고정 서명 검증).
function signS3Put({ endpoint, bucket, key, region, accessKeyId, secretAccessKey, contentType, body, acl, now }) {
  const url = `${String(endpoint).replace(/\/$/, '')}/${bucket}/${key}`;
  const u = new URL(url);
  const amzDate = (now || new Date()).toISOString().replace(/[:-]|\.\d{3}/g, ''); // 20260726T120000Z
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256hex(body);
  const headers = {
    'content-type': contentType,
    host: u.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (acl) headers['x-amz-acl'] = acl; // 버킷이 ACL을 끈 경우(대부분의 신규 S3) 넣으면 400 — 옵션.
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${String(headers[n]).trim()}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = ['PUT', u.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  const signature = hmac(hmac(kService, 'aws4_request'), stringToSign).toString('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { url, headers };
}

// 공개 URL — publicBase가 있으면 그것(R2 공개 도메인·CDN·커스텀 도메인), 없으면 endpoint/bucket/key.
function s3PublicUrl(cfg, key) {
  const base = String(cfg.publicBase || '').trim().replace(/\/$/, '');
  if (base) return `${base}/${key}`;
  return `${String(cfg.endpoint).replace(/\/$/, '')}/${cfg.bucket}/${key}`;
}

async function uploadS3(absPath, buf, contentType) {
  const c = secrets.get('imagehost') || {};
  const stamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const prefix = String(c.prefix || 'social').replace(/[^A-Za-z0-9._/-]/g, '').replace(/^\/+|\/+$/g, '');
  const key = `${prefix ? prefix + '/' : ''}${safeKey(path.basename(absPath), stamp)}`;
  const { url, headers } = signS3Put({
    endpoint: c.endpoint, bucket: c.bucket, key, region: String(c.region || 'auto'),
    accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey,
    contentType, body: buf, acl: c.acl || null,
  });
  let res;
  try { res = await fetch(url, { method: 'PUT', headers, body: buf }); }
  catch (e) { return { ok: false, error: `S3 연결 실패: ${e.message} — endpoint를 확인하세요` }; }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const hint = res.status === 403 ? ' (키·region·버킷 권한 확인. ACL 옵션을 켠 경우 버킷이 ACL을 허용하는지도 확인)'
      : res.status === 404 ? ' (버킷명·endpoint 확인)' : '';
    return { ok: false, error: `S3 업로드 실패 HTTP ${res.status}${hint} ${String(body).slice(0, 200)}`.trim() };
  }
  return { ok: true, url: s3PublicUrl(c, key), provider: 's3' };
}

// ---- imgbb ----------------------------------------------------------------------------
async function uploadImgbb(absPath, buf, contentType) {
  const c = secrets.get('imagehost') || {};
  if (/^video\//.test(contentType)) return { ok: false, error: 'imgbb는 이미지 전용입니다 — 영상은 S3 호환 스토리지를 설정하세요' };
  const form = new URLSearchParams();
  form.set('image', buf.toString('base64'));
  form.set('name', path.basename(absPath).replace(/\.[^.]+$/, '').slice(0, 60));
  let res;
  try {
    res = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(c.imgbbKey)}`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString(),
    });
  } catch (e) { return { ok: false, error: 'imgbb 연결 실패: ' + e.message }; }
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || !j.success || !j.data) {
    const msg = (j && j.error && j.error.message) || `HTTP ${res.status}`;
    // 무료 계정은 API·직링크가 막혀 있을 수 있다 — 권한 오류면 S3 경로를 안내한다.
    const hint = (res.status === 400 || res.status === 401 || res.status === 403)
      ? ' — imgbb는 API·직접 링크가 유료 플랜 기능일 수 있습니다. 요금제를 확인하거나 S3 호환(R2·Supabase 무료 티어)으로 바꾸세요'
      : '';
    return { ok: false, error: `imgbb 업로드 실패: ${msg}${hint}` };
  }
  return { ok: true, url: j.data.url || j.data.display_url, provider: 'imgbb' };
}

// ---- qrcoding (하위호환) ---------------------------------------------------------------
function qrApiBase() {
  const c = secrets.get('qrcoding');
  const base = c.apiUrl || String(c.url || '').replace(/\/mcp\/?$/, '') || DEFAULT_QR_BASE;
  return String(base).replace(/\/$/, '');
}
async function uploadQrcoding(absPath, buf, contentType) {
  const c = secrets.get('qrcoding');
  const signRes = await fetch(qrApiBase() + '/v1/uploads', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': c.apiKey },
    body: JSON.stringify({ filename: path.basename(String(absPath)), contentType }),
  });
  const sign = await signRes.json().catch(() => null);
  if (signRes.status === 501) return { ok: false, error: '서버에 업로드 스토리지가 설정되지 않았습니다 — 설정 → 발행에서 S3 호환 스토리지나 imgbb로 바꾸는 것을 권장합니다' };
  if (signRes.status === 404) return { ok: false, error: '업로드 API를 찾지 못했습니다 — 설정 → 발행에서 S3 호환 스토리지나 imgbb로 바꾸는 것을 권장합니다' };
  if (!signRes.ok || !sign || !sign.uploadUrl) {
    return { ok: false, error: (sign && (sign.message || sign.code)) || `업로드 서명 실패 HTTP ${signRes.status}` };
  }
  if (sign.maxBytes && buf.length > sign.maxBytes) {
    return { ok: false, error: `파일이 큽니다 (${(buf.length / 1e6).toFixed(1)}MB > ${Math.round(sign.maxBytes / 1e6)}MB)` };
  }
  const put = await fetch(sign.uploadUrl, { method: 'PUT', headers: { 'content-type': contentType }, body: buf });
  if (!put.ok) return { ok: false, error: `스토리지 업로드 실패 HTTP ${put.status}` };
  return { ok: true, url: sign.publicUrl, provider: 'qrcoding' };
}

// ---- 진입점 ----------------------------------------------------------------------------
const UPLOADERS = { s3: uploadS3, imgbb: uploadImgbb, qrcoding: uploadQrcoding };
async function uploadPublic(absPath) {
  const provider = activeProvider();
  if (!provider) {
    return { ok: false, error: '공개 이미지 호스트가 설정되지 않았습니다 — 설정 → 발행에서 S3 호환 스토리지(권장) 또는 imgbb를 설정하세요' };
  }
  const contentType = contentTypeOf(absPath);
  if (!contentType) return { ok: false, error: '지원하지 않는 파일 형식: ' + path.extname(String(absPath)) };
  let buf;
  try { buf = fs.readFileSync(absPath); } catch { return { ok: false, error: '파일을 읽지 못했습니다: ' + absPath }; }
  return UPLOADERS[provider](absPath, buf, contentType);
}

// 연결 테스트 — 1x1 PNG를 실제로 올려 URL이 나오고 공개로 열리는지 확인(설정 UI의 [연결 테스트]).
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
async function testHost() {
  const provider = activeProvider();
  if (!provider) return { ok: false, error: '설정된 이미지 호스트가 없습니다' };
  const tmp = path.join(os.tmpdir(), `sat-hosttest-${Date.now()}.png`);
  try { fs.writeFileSync(tmp, TINY_PNG); } catch (e) { return { ok: false, error: e.message }; }
  try {
    const r = await uploadPublic(tmp);
    if (!r.ok) return r;
    // 올린 URL이 실제로 공개로 열리는지까지 확인 — 버킷이 비공개면 여기서 잡힌다(발행 때 IG가 못 읽는다).
    let reachable = true;
    try { const g = await fetch(r.url, { method: 'GET' }); reachable = g.ok; } catch { reachable = false; }
    if (!reachable) {
      return { ok: false, url: r.url, provider, error: '업로드는 됐지만 URL이 공개로 열리지 않습니다 — 버킷 공개 설정 또는 publicBase(공개 도메인)를 확인하세요' };
    }
    return { ok: true, url: r.url, provider, label: LABEL[provider] };
  } finally { try { fs.rmSync(tmp, { force: true }); } catch { /* tmp */ } }
}

module.exports = {
  uploadPublic, contentTypeOf, hostReady, hostStatus, activeProvider, testHost,
  // 테스트 전용 내부 노출
  _signS3Put: signS3Put, _safeKey: safeKey, _s3PublicUrl: s3PublicUrl, _qrApiBase: qrApiBase,
};
