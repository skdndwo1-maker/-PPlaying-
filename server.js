require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// 회사 네트워크/VPN 환경 SSL 우회
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Node 18+ 내장 fetch 사용, 없으면 node-fetch 폴백
const fetchFn = globalThis.fetch || require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API 프록시 엔드포인트 - 키는 여기서만 처리
app.post('/api/analyze', async (req, res) => {
  const { brand, industry } = req.body;

  if (!brand) {
    return res.status(400).json({ error: '브랜드명을 입력해주세요.' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: '.env 파일에 ANTHROPIC_API_KEY가 없습니다.' });
  }

  const prompt = `당신은 브랜드 인텔리전스 전문 AI입니다. 아래 브랜드에 대해 정확하고 상세한 분석을 제공하세요.

브랜드명: ${brand}
산업군: ${industry || '전체'}

반드시 아래 JSON 형식으로만 응답하세요. JSON 외에 다른 텍스트는 절대 포함하지 마세요.

{
  "brand_name": "공식 브랜드명 (한국어 + 영문)",
  "country": "본사 국가",
  "industry": "세부 산업군",
  "status": "상장/비상장/개인기업 등",
  "chips": ["산업 태그1", "태그2", "태그3"],
  "metrics": {
    "revenue": "연간 매출 (최신, 단위 포함)",
    "revenue_sub": "기준 연도",
    "profit": "순이익",
    "profit_sub": "영업이익률",
    "founded": "설립 연도",
    "founded_sub": "설립 도시/국가",
    "biz_type": "사업 형태",
    "biz_type_sub": "상장 거래소 또는 구분"
  },
  "basic_info": [
    {"key": "창립자", "val": "이름"},
    {"key": "현 운영자/CEO", "val": "이름"},
    {"key": "본사", "val": "위치"},
    {"key": "직원 수", "val": "약 N만 명"},
    {"key": "주요 시장", "val": "국가/지역"},
    {"key": "핵심 제품/서비스", "val": "설명"}
  ],
  "business_direction": "현재 사업 방향과 미래 전략을 3-4문장으로 상세히 작성.",
  "brand_story": "브랜드의 창업 배경, 성장 역사, 핵심 가치, 주요 전환점 등을 4-5문장으로 작성.",
  "branding_structure": [
    {"key": "포지셔닝", "val": "설명"},
    {"key": "타겟 고객", "val": "설명"},
    {"key": "핵심 가치", "val": "설명"},
    {"key": "슬로건", "val": "공식 슬로건"},
    {"key": "비주얼 아이덴티티", "val": "설명"},
    {"key": "마케팅 전략", "val": "설명"}
  ],
  "related_brands": [
    {"name": "브랜드명", "relation": "경쟁/협력/동종"},
    {"name": "브랜드명", "relation": "관계 설명"},
    {"name": "브랜드명", "relation": "관계 설명"},
    {"name": "브랜드명", "relation": "관계 설명"},
    {"name": "브랜드명", "relation": "관계 설명"},
    {"name": "브랜드명", "relation": "관계 설명"}
  ],
  "contacts": [
    {"type": "공식 웹사이트", "val": "URL", "confidence": "확인됨"},
    {"type": "IR/투자자 연락처", "val": "이메일 또는 페이지", "confidence": "확인됨"},
    {"type": "파트너십 문의", "val": "이메일 또는 부서", "confidence": "추론됨"},
    {"type": "공식 SNS", "val": "주요 채널", "confidence": "확인됨"}
  ]
}`;

  try {
    const response = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: errData?.error?.message || `API 오류 (${response.status})`
      });
    }

    const data = await response.json();
    const raw = data.content.map(i => i.text || '').join('');
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('JSON 응답을 찾을 수 없습니다.');
    const result = JSON.parse(match[0]);

    res.json(result);

  } catch (err) {
    console.error('서버 오류:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 상세보기 API - 핵심가치/비주얼아이덴티티/마케팅전략
app.post('/api/detail', async (req, res) => {
  const { brand, category, summary } = req.body;
  const prompt = `당신은 브랜드 인텔리전스 전문가입니다.

브랜드: ${brand}
카테고리: ${category}
기존 요약: ${summary}

위 브랜드의 "${category}"에 대해 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요.

{
  "title": "${brand} — ${category} 상세 분석",
  "summary": "2-3문장 핵심 요약",
  "cases": [
    {"title": "구체적 사례 제목", "desc": "사례 상세 설명 2-3문장", "year": "연도"},
    {"title": "구체적 사례 제목", "desc": "사례 상세 설명 2-3문장", "year": "연도"},
    {"title": "구체적 사례 제목", "desc": "사례 상세 설명 2-3문장", "year": "연도"}
  ],
  "articles": [
    {"title": "관련 기사 제목 (실제 존재 가능성 높은)", "source": "매체명", "year": "2023 또는 2024", "url": "https://실제URL또는검색URL", "desc": "기사 내용 1-2문장 요약"},
    {"title": "관련 기사 제목", "source": "매체명", "year": "2024", "url": "https://실제URL또는검색URL", "desc": "기사 내용 1-2문장 요약"},
    {"title": "관련 기사 제목", "source": "매체명", "year": "2024", "url": "https://실제URL또는검색URL", "desc": "기사 내용 1-2문장 요약"}
  ],
  "links": [
    {"label": "공식 관련 페이지", "url": "https://실제URL", "desc": "설명"},
    {"label": "관련 리소스", "url": "https://실제URL", "desc": "설명"}
  ]
}`;

  try {
    const response = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await response.json();
    const raw = data.content.map(i => i.text || '').join('');
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('JSON 없음');
    res.json(JSON.parse(match[0]));
  } catch (err) {
    console.error('detail 오류:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 관련 브랜드 기사/링크 API
app.post('/api/related', async (req, res) => {
  const { brand, relatedBrand, relation } = req.body;
  const prompt = `당신은 브랜드 인텔리전스 전문가입니다.

메인 브랜드: ${brand}
관련 브랜드: ${relatedBrand}
관계: ${relation}

두 브랜드의 관계와 "${relatedBrand}"에 대한 정보를 아래 JSON 형식으로만 응답하세요.

{
  "brand_name": "${relatedBrand}",
  "relation_desc": "두 브랜드 관계 상세 설명 2-3문장",
  "brand_summary": "${relatedBrand} 브랜드 핵심 요약 2문장",
  "articles": [
    {"title": "관련 기사 제목", "source": "매체명", "year": "2023 또는 2024", "url": "https://실제URL또는검색URL", "desc": "기사 내용 요약"},
    {"title": "관련 기사 제목", "source": "매체명", "year": "2024", "url": "https://실제URL또는검색URL", "desc": "기사 내용 요약"},
    {"title": "관련 기사 제목", "source": "매체명", "year": "2024", "url": "https://실제URL또는검색URL", "desc": "기사 내용 요약"}
  ],
  "key_contents": [
    {"title": "핵심 콘텐츠/캠페인/이슈", "desc": "상세 설명", "year": "연도"},
    {"title": "핵심 콘텐츠/캠페인/이슈", "desc": "상세 설명", "year": "연도"}
  ],
  "official_links": [
    {"label": "공식 웹사이트", "url": "https://실제URL"},
    {"label": "공식 SNS 또는 뉴스룸", "url": "https://실제URL"}
  ]
}`;

  try {
    const response = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 3000, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await response.json();
    const raw = data.content.map(i => i.text || '').join('');
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('JSON 없음');
    res.json(JSON.parse(match[0]));
  } catch (err) {
    console.error('related 오류:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 연락망 웹서치 API - 실제 웹 검색 기반
app.post('/api/contacts', async (req, res) => {
  const { brand } = req.body;

  const prompt = `"${brand}" 브랜드의 실제 연락처 정보를 웹에서 검색해서 찾아주세요.

찾아야 할 정보:
1. 공식 웹사이트 URL
2. IR/투자자 관계 페이지 또는 이메일
3. 파트너십/제휴 문의 이메일 또는 페이지
4. 공식 SNS 채널 (Instagram, LinkedIn 등)
5. 고객센터 또는 미디어 문의 연락처

반드시 아래 JSON 형식으로만 응답하세요. JSON 외 텍스트는 절대 포함하지 마세요.

{
  "contacts": [
    {"type": "공식 웹사이트", "val": "실제 URL", "confidence": "확인됨", "source": "출처"},
    {"type": "IR/투자자 연락처", "val": "실제 URL 또는 이메일", "confidence": "확인됨 또는 추론됨", "source": "출처"},
    {"type": "파트너십 문의", "val": "실제 이메일 또는 URL", "confidence": "확인됨 또는 추론됨", "source": "출처"},
    {"type": "공식 SNS", "val": "채널명 및 URL", "confidence": "확인됨", "source": "출처"},
    {"type": "미디어/PR 문의", "val": "이메일 또는 URL", "confidence": "확인됨 또는 추론됨", "source": "출처"}
  ]
}`;

  try {
    const response = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err?.error?.message || `API 오류 (${response.status})` });
    }

    const data = await response.json();
    const raw = data.content.map(i => i.text || '').join('');
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('JSON 없음');
    res.json(JSON.parse(match[0]));
  } catch (err) {
    console.error('contacts 오류:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});
app.post('/api/deep', async (req, res) => {
  const { brand, industry } = req.body;

  const prompt = `당신은 브랜드 인텔리전스 전문가입니다. "${brand}" 브랜드에 대한 심층 분석 리포트를 작성해주세요.

반드시 아래 JSON 형식으로만 응답하세요. JSON 외 텍스트는 절대 포함하지 마세요.

{
  "brand_name": "${brand}",
  "industry": "${industry || '전체'}",

  "history": {
    "intro": "브랜드 전체 역사 한 문단 요약",
    "phases": [
      {
        "title": "Phase 1 — 창업기 (시작연도~)",
        "sections": [
          {
            "heading": "섹션 제목",
            "content": "상세 내용 2-3문단. <strong>강조</strong> 태그 사용 가능.",
            "quote": "핵심 인사이트 한 줄 (없으면 null)"
          }
        ]
      },
      {
        "title": "Phase 2 — 성장기",
        "sections": [{"heading": "제목", "content": "내용", "quote": null}]
      },
      {
        "title": "Phase 3 — 확장기",
        "sections": [{"heading": "제목", "content": "내용", "quote": null}]
      },
      {
        "title": "Phase 4 — 현재",
        "sections": [{"heading": "제목", "content": "내용", "quote": null}]
      }
    ]
  },

  "portfolio": {
    "intro": "포트폴리오 구조 한 문단 요약",
    "root": {
      "name": "${brand} 그룹/본사",
      "sub": "핵심 사업 한 줄",
      "children": [
        {
          "category": "ct",
          "category_name": "핵심사업",
          "items": [
            {"name": "사업/브랜드명", "tags": ["태그1", "태그2"], "desc": "한 줄 설명", "source": "출처 또는 연도"}
          ]
        },
        {
          "category": "ca",
          "category_name": "자회사/계열사",
          "items": [
            {"name": "사업/브랜드명", "tags": ["태그1"], "desc": "한 줄 설명", "source": "연도"}
          ]
        },
        {
          "category": "cb",
          "category_name": "오프라인/채널",
          "items": [
            {"name": "채널명", "tags": ["태그1"], "desc": "한 줄 설명", "source": "연도"}
          ]
        }
      ]
    }
  },

  "branding": {
    "intro": "브랜딩 구조 한 문단 요약",
    "layers": [
      {"level": "l1", "num": "Layer 1 — 최상위 포지셔닝", "brands": "해당 브랜드/라인명", "desc": "역할과 의미 설명"},
      {"level": "l2", "num": "Layer 2 — 프리미엄", "brands": "해당 브랜드/라인명", "desc": "역할과 의미 설명"},
      {"level": "l3", "num": "Layer 3 — 메인 플랫폼", "brands": "해당 브랜드/라인명", "desc": "역할과 의미 설명"},
      {"level": "l4", "num": "Layer 4 — 대중 라인", "brands": "해당 브랜드/라인명", "desc": "역할과 의미 설명"},
      {"level": "l5", "num": "Layer 5 — 인프라/기반", "brands": "해당 브랜드/라인명", "desc": "역할과 의미 설명"}
    ],
    "footer_tags": ["브랜딩 특징1", "브랜딩 특징2"]
  },

  "timeline": {
    "events": [
      {"phase": "Phase 1 — 창업기 (연도~연도)"},
      {"year": "연도", "big": true, "title": "주요 이벤트", "desc": "상세 설명", "tags": ["ct"]},
      {"year": "연도", "big": false, "title": "이벤트", "desc": "설명", "tags": ["ca"]},
      {"phase": "Phase 2 — 성장기 (연도~연도)"},
      {"year": "연도", "big": true, "title": "주요 이벤트", "desc": "설명", "tags": ["ca"]},
      {"year": "연도", "big": false, "title": "이벤트", "desc": "설명", "tags": ["cb"]},
      {"phase": "Phase 3 — 현재 (연도~)"},
      {"year": "연도", "big": true, "title": "최근 이벤트", "desc": "설명", "tags": ["cp"]}
    ],
    "tag_labels": {
      "ct": "창업/커뮤니티",
      "ca": "커머스/성장",
      "cc": "M&A",
      "cb": "오프라인",
      "cn": "미디어",
      "cp": "글로벌",
      "cg": "인프라"
    }
  }
}`;

  try {
    const response = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 16000, messages: [{ role: 'user', content: prompt }] })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err?.error?.message || `API 오류 (${response.status})` });
    }
    const data = await response.json();
    const raw = data.content.map(i => i.text || '').join('');
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('JSON 없음');
    res.json(JSON.parse(match[0]));
  } catch (err) {
    console.error('deep 오류:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 브랜드 검색(발견) API — 브랜드명을 모를 때 AI 추천 리스트
app.post('/api/discover', async (req, res) => {
  const { query, industry } = req.body;

  if (!query) {
    return res.status(400).json({ error: '검색 질문을 입력해주세요.' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: '.env 파일에 ANTHROPIC_API_KEY가 없습니다.' });
  }

  const industryFilter = industry && industry !== '전체' ? industry : '전 산업';

  const prompt = `당신은 브랜드 인텔리전스 전문 AI입니다. 사용자가 브랜드명을 모르고 탐색 중입니다.

사용자 질문: ${query}
산업군 필터: ${industryFilter}

위 조건에 맞는 브랜드를 **정확히 10개** 추천하세요. 실존하는 브랜드만 포함하고, 순위는 브랜딩·사업 영향력 기준으로 매기세요.

반드시 아래 JSON 형식으로만 응답하세요. JSON 외 텍스트는 절대 포함하지 마세요.

{
  "query_summary": "이번 추천의 한 줄 요약",
  "brands": [
    {
      "rank": 1,
      "brand_name": "공식 브랜드명 (한국어, 필요시 영문 병기)",
      "country": "본사 국가",
      "industry": "세부 산업군",
      "branding_philosophy": "브랜딩 철학·포지셔닝 1~2문장",
      "business_structure": "사업 구조·채널·수익모델 1~2문장",
      "why_notable": "추천 이유 한 줄"
    }
  ]
}`;

  try {
    const response = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: errData?.error?.message || `API 오류 (${response.status})`
      });
    }

    const data = await response.json();
    const raw = data.content.map(i => i.text || '').join('');
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('JSON 응답을 찾을 수 없습니다.');
    const result = JSON.parse(match[0]);

    res.json(result);
  } catch (err) {
    console.error('discover 오류:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ PPlaying 서버 실행 중: http://localhost:${PORT}`);
});
