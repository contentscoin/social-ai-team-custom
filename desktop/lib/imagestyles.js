// 이미지 생성 스타일 프리셋 — 렌더 프롬프트 앞에 붙는 영어 스타일 지시어.
// 사용자가 설정/일괄 생성 UI에서 고르면 promptlab이 컴파일 결과 앞에 directive를 명시한다.
// key는 저장/전달용 안정 식별자, label은 한국어 표기, directive는 프롬프트에 실릴 영어 지시.
const STYLES = [
  { key: 'photoreal',    label: '실사형',        directive: 'photorealistic, realistic photography, true-to-life detail, natural lighting' },
  { key: 'studio_photo', label: '실제 사진촬영',  directive: 'professional studio product photography, DSLR, softbox lighting, sharp focus, shallow depth of field' },
  { key: 'infographic',  label: '인포그래픽형',   directive: 'clean infographic style, flat vector graphics, bold labeled data visualization, simple iconography, generous whitespace' },
  { key: 'animation',    label: '애니메이션',     directive: 'stylized 2D animation illustration, cel-shaded, clean linework, vibrant flat colors' },
  { key: 'illustration', label: '일러스트',       directive: 'hand-drawn editorial illustration, textured brushwork, warm palette' },
  { key: 'clean',        label: '깔끔한 스타일',  directive: 'clean minimalist design, ample negative space, simple balanced composition, restrained palette' },
  { key: 'render3d',     label: '3D 렌더',        directive: '3D rendered, soft global illumination, subtle depth of field, product-visualization quality' },
  { key: 'watercolor',   label: '수채화',         directive: 'soft watercolor painting, gentle gradients, visible paper texture, delicate washes' },
];
const BY_KEY = new Map(STYLES.map((s) => [s.key, s]));

function isValid(key) { return BY_KEY.has(key); }
function directiveFor(key) { const s = BY_KEY.get(key); return s ? s.directive : ''; }
function labelFor(key) { const s = BY_KEY.get(key); return s ? s.label : ''; }
// 목록(렌더러 드롭다운용) — directive는 UI에 필요 없으니 key/label만.
function list() { return STYLES.map((s) => ({ key: s.key, label: s.label })); }

module.exports = { STYLES, list, isValid, directiveFor, labelFor };
