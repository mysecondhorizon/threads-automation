export function buildSchedulesDiagnosticsClientScript() {
  return `(() => {
    const history = document.querySelector('#schedule-history');
    if (!history) return;

    const section = document.createElement('section');
    section.className = 'app-schedule-panel';
    const title = document.createElement('h2');
    title.textContent = '최근 General AUTO 진단';
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const list = document.createElement('div');
    list.className = 'app-schedule-history';
    section.append(title, status, list);
    history.parentElement?.insertBefore(section, history.parentElement?.firstChild || null);

    const text = (value) => String(value || '').trim();
    const when = (value) => {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
    };
    const add = (parent, label, value) => {
      if (!text(value)) return;
      const line = document.createElement('div');
      line.textContent = label + ': ' + value;
      parent.append(line);
    };
    const topicLabel = (topic) => {
      if (!topic) return '기록 없음';
      if (topic.mode === 'current_topic') return 'Current Topic · ' + (topic.subject || topic.selectedAngle || topic.topicId || '-');
      if (topic.mode === 'fallback') return 'fallback · ' + (topic.fallbackReason || '-');
      return 'everyday_personal';
    };
    const contentBasisLabel = (basis) => ({
      PERSONA: 'Persona',
      CURRENT_TOPIC: 'Current Topic',
      CONTENT_POOL: 'Content Pool',
    })[basis] || '-';
    const mediaBasisLabel = (basis) => ({
      NONE: '없음',
      DAILY_IMAGE: 'Daily Image',
      DAILY_VIDEO: 'Daily Video',
    })[basis] || '-';
    const renderAttempt = (attempt) => {
      const detail = document.createElement('article');
      detail.className = 'app-schedule-history-item';
      const heading = document.createElement('strong');
      heading.textContent = '시도 ' + attempt.attempt + (attempt.retrying ? ' · 재시도 예정' : '');
      detail.append(heading);
      add(detail, '단계', attempt.stage);
      add(detail, '오류 코드', attempt.errorCode);
      add(detail, '실패 사유', Array.isArray(attempt.reasons) ? attempt.reasons.join(', ') : '');
      add(detail, '포맷', attempt.format?.signature);
      add(detail, '대상 포맷', attempt.targetFormat?.name || attempt.targetFormat?.id);
      if (Number.isFinite(attempt.similarity?.highestScore)) add(detail, '유사도', attempt.similarity.highestScore);
      add(detail, '일치 게시물 ID', attempt.similarity?.matchedPostId);
      for (const [label, value] of [['생성 초안', attempt.draftText], ['일치 게시물', attempt.similarity?.matchedPostText]]) {
        if (!text(value)) continue;
        const block = document.createElement('pre');
        block.textContent = label + '\\n' + value;
        detail.append(block);
      }
      return detail;
    };
    const render = (records) => {
      list.replaceChildren();
      if (!records.length) {
        status.textContent = '최근 General AUTO 진단 기록이 없습니다.';
        return;
      }
      status.textContent = '';
      for (const record of records) {
        const item = document.createElement('article');
        item.className = 'app-schedule-history-item';
        const heading = document.createElement('strong');
        heading.textContent = 'General AUTO · ' + (record.status || 'unknown');
        item.append(heading);
        add(item, '실행 시각', when(record.startedAt));
        add(item, '실패 단계', record.error?.code ? (record.step || '-') + ' · ' + record.error.code : '');
        add(item, '실패 사유', Array.isArray(record.error?.details?.reasons) ? record.error.details.reasons.join(', ') : '');
        add(item, 'Current Topic', topicLabel(record.diagnostic?.currentTopic));
        add(item, '생성 기반', contentBasisLabel(record.diagnostic?.provenance?.contentBasis));
        add(item, '미디어', mediaBasisLabel(record.diagnostic?.provenance?.mediaBasis));
        add(item, '시도 횟수', record.diagnostic?.attempts?.length || record.generation?.attempts || 0);
        const attempts = Array.isArray(record.diagnostic?.attempts) ? record.diagnostic.attempts : [];
        if (attempts.length) {
          const details = document.createElement('details');
          const summary = document.createElement('summary');
          summary.textContent = '시도 상세 보기';
          details.append(summary, ...attempts.map(renderAttempt));
          item.append(details);
        }
        list.append(item);
      }
    };
    (async () => {
      status.textContent = 'General AUTO 진단 정보를 불러오는 중…';
      try {
        const response = await fetch('/admin/auto-post/status');
        const data = await response.json();
        if (!response.ok || data.ok === false) throw new Error('status_failed');
        render(Array.isArray(data.recentGeneralAutoExecutions) ? data.recentGeneralAutoExecutions : []);
      } catch {
        status.textContent = 'General AUTO 진단 정보를 불러오지 못했습니다.';
      }
    })();
  })();`;
}
