// 채널별 포스팅 템플릿 목업 — 발행 전 "작성된 모습" 미리보기
(function (global) {
  'use strict';

  function nl2br(esc, text) {
    return esc(text || '').replace(/\n/g, '<br>');
  }

  function firstParagraphs(text, n) {
    const parts = String(text || '').trim().split(/\n{2,}/);
    return parts.slice(0, n).join('\n\n');
  }

  /**
   * @param {string} chKey
   * @param {{ text?: string, topic?: string, title?: string, handle?: string, images?: string[], imageSrcs?: string[], satUrl: (rel: string) => string, esc: (s: string) => string, compact?: boolean }} opts
   */
  function channelMockHTML(chKey, opts) {
    const esc = opts.esc;
    const satUrl = opts.satUrl || ((r) => r);
    const text = (opts.text || '').trim();
    const topic = opts.topic || '';
    const title = (opts.title || '').trim();
    const handle = opts.handle || 'brand';
    const images = opts.images || [];
    // imageSrcs: data: URL 등 이미 해석된 소스 (sat:// 실패 대비)
    const srcs = (opts.imageSrcs && opts.imageSrcs.length)
      ? opts.imageSrcs
      : images.map((r) => (String(r).startsWith('data:') || String(r).startsWith('sat:') ? r : satUrl(r)));
    const compact = !!opts.compact;
    const img = (src, cls) => (src
      ? `<img class="${cls || 'tm-img'}" src="${src}" alt="" loading="lazy">`
      : `<div class="${cls || 'tm-img'} empty">이미지 없음</div>`);

    if (chKey === 'instagram') {
      const media = srcs.length
        ? (srcs.length === 1
          ? img(srcs[0])
          : `<div class="tm-carousel-strip">${srcs.slice(0, 6).map((r) => img(r, 'tm-img tm-slide')).join('')}</div>`)
        : img(null);
      return `<article class="tm-card tm-ig ${compact ? 'compact' : ''}">
        <header class="tm-ig-head"><span class="tm-avatar">${esc(handle.slice(0, 1).toUpperCase())}</span>
          <div><b>${esc(handle)}</b><span class="muted small">원본 · 게시물</span></div></header>
        <div class="tm-ig-media">${media}${srcs.length > 1 ? `<span class="tm-carousel">${srcs.length}장</span>` : ''}</div>
        <div class="tm-ig-actions" aria-hidden="true">♡ 💬 ➤</div>
        <div class="tm-ig-caption"><b>${esc(handle)}</b> ${nl2br(esc, text || topic || '캡션이 아직 없습니다')}</div>
      </article>`;
    }

    if (chKey === 'threads') {
      const body = text || topic || '스레드 본문이 아직 없습니다';
      return `<article class="tm-card tm-th ${compact ? 'compact' : ''}">
        <div class="tm-th-row">
          <span class="tm-avatar">${esc(handle.slice(0, 1).toUpperCase())}</span>
          <div class="tm-th-body">
            <div class="tm-th-meta"><b>${esc(handle)}</b><span class="muted small">방금</span></div>
            <div class="tm-th-text">${nl2br(esc, body)}</div>
            ${srcs[0] ? `<div class="tm-th-media">${img(srcs[0])}</div>` : ''}
          </div>
        </div>
      </article>`;
    }

    if (chKey === 'naver') {
      const blogTitle = title || topic || (text.split('\n')[0] || '블로그 제목');
      const body = text || '본문이 아직 없습니다';
      return `<article class="tm-card tm-nb ${compact ? 'compact' : ''}">
        <div class="tm-nb-brand">네이버 블로그</div>
        <h3 class="tm-nb-title">${esc(blogTitle)}</h3>
        <div class="tm-nb-meta muted small">${esc(handle)} · 발행 전 미리보기</div>
        ${srcs[0] ? `<div class="tm-nb-hero">${img(srcs[0])}</div>` : ''}
        <div class="tm-nb-body">${nl2br(esc, compact ? firstParagraphs(body, 2) : body)}</div>
      </article>`;
    }

    if (chKey === 'naver_clip') {
      return `<article class="tm-card tm-nc ${compact ? 'compact' : ''}">
        <div class="tm-nc-stage">
          ${img(srcs[0], 'tm-nc-cover')}
          <span class="tm-nc-badge">CLIP</span>
        </div>
        <div class="tm-nc-info">
          <h3>${esc(topic || '클립 제목')}</h3>
          <p>${nl2br(esc, text || '설명이 아직 없습니다')}</p>
          <span class="muted small">${esc(handle)}</span>
        </div>
      </article>`;
    }

    if (chKey === 'kakao_channel') {
      return `<article class="tm-card tm-kk ${compact ? 'compact' : ''}">
        <div class="tm-kk-bar"><span class="tm-kk-dot"></span><b>${esc(handle)}</b><span class="muted small">카카오톡 채널</span></div>
        ${srcs[0] ? `<div class="tm-kk-media">${img(srcs[0])}</div>` : ''}
        <div class="tm-kk-text">${nl2br(esc, text || topic || '소식 본문이 아직 없습니다')}</div>
        <div class="tm-kk-cta">자세히 보기</div>
      </article>`;
    }

    if (chKey === 'x') {
      return `<article class="tm-card tm-x ${compact ? 'compact' : ''}">
        <div class="tm-th-row">
          <span class="tm-avatar">${esc(handle.slice(0, 1).toUpperCase())}</span>
          <div class="tm-th-body">
            <div class="tm-th-meta"><b>${esc(handle)}</b><span class="muted small">@${esc(handle)} · 미리보기</span></div>
            <div class="tm-th-text">${nl2br(esc, text || topic || '게시물이 아직 없습니다')}</div>
            ${srcs[0] ? `<div class="tm-th-media">${img(srcs[0])}</div>` : ''}
          </div>
        </div>
      </article>`;
    }

    if (chKey === 'facebook' || chKey === 'linkedin') {
      const label = chKey === 'facebook' ? 'Facebook' : 'LinkedIn';
      return `<article class="tm-card tm-fb ${compact ? 'compact' : ''}">
        <header class="tm-ig-head"><span class="tm-avatar">${esc(handle.slice(0, 1).toUpperCase())}</span>
          <div><b>${esc(handle)}</b><span class="muted small">${label} · 미리보기</span></div></header>
        <div class="tm-fb-text">${nl2br(esc, text || topic || '본문이 아직 없습니다')}</div>
        ${srcs[0] ? `<div class="tm-ig-media">${img(srcs[0])}</div>` : ''}
      </article>`;
    }

    // fallback
    return `<article class="tm-card tm-generic ${compact ? 'compact' : ''}">
      <div class="tm-generic-head"><b>${esc(topic || '포스트')}</b><span class="chip tiny">${esc(chKey)}</span></div>
      ${srcs[0] ? img(srcs[0]) : ''}
      <div class="tm-generic-body">${nl2br(esc, text || '본문이 아직 없습니다')}</div>
    </article>`;
  }

  global.SatTemplate = { channelMockHTML };
})(typeof window !== 'undefined' ? window : globalThis);
